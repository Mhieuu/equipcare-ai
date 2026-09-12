import { AssetManualState, type AssetManualState as State } from '@equipcare/shared';
import { AppError } from '../errors/app-error.js';

/**
 * Asset `manual_state` state machine (Doc04 §5.3, plan §12.2 M2).
 *
 * Allowed transitions (FR-ASSET-05 + FR-ASSET-07):
 *   NORMAL    → SUSPENDED | RETIRED
 *   SUSPENDED → NORMAL | RETIRED
 *   RETIRED   → terminal (FR-ASSET-07: chặn WO mới + recycle yêu cầu admin)
 *
 * RETIRED là terminal:
 *   - Doc02 §FR-ASSET-07: chặn tạo Work Order mới (kiểm tra qua
 *     `assertAssetCanHaveWorkOrder(assetManualState)` ở M5+).
 *   - Không thể recover về NORMAL từ RETIRED — nếu cần dùng lại phải tạo
 *     asset mới (audit trail rõ ràng).
 */
const TRANSITIONS: Record<State, State[]> = {
  [AssetManualState.NORMAL]: [AssetManualState.SUSPENDED, AssetManualState.RETIRED],
  [AssetManualState.SUSPENDED]: [AssetManualState.NORMAL, AssetManualState.RETIRED],
  [AssetManualState.RETIRED]: [],
};

export function canTransitionManualState(from: State, to: State): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertManualStateTransition(from: State, to: State): void {
  if (!canTransitionManualState(from, to)) {
    throw AppError.unprocessable(
      'ASSET_INVALID_STATE_TRANSITION',
      `Không thể chuyển trạng thái thiết bị từ ${from} sang ${to}`,
      { from, to },
    );
  }
}

/**
 * assertAssetCanHaveWorkOrder — FR-ASSET-07.
 *
 * Helper gọi từ WO module (M5+) trước khi tạo Work Order mới.
 * RETIRED chặn WO mới.
 */
export function assertAssetCanHaveWorkOrder(manualState: State): void {
  if (manualState === AssetManualState.RETIRED) {
    throw AppError.unprocessable(
      'ASSET_RETIRED_CANNOT_CREATE_WO',
      'Thiết bị đã ngừng sử dụng (RETIRED); không thể tạo Work Order mới',
      { manualState },
    );
  }
}

/**
 * deriveActivityStatus — Q-08 mapping (Doc04 §7.2 + plan §9).
 *
 * M2: chỉ manual_state. M5 sẽ JOIN work_orders để override MAINTENANCE/REPAIR
 * khi có WO MAINTENANCE/REPAIR đang mở. Đặt ở backend-core để frontend + API
 * cùng dùng; mapping text Việt sống ở `packages/shared/labels.ts`.
 *
 * Tham số `activeWoKinds` mặc định undefined (= M2 chỉ dùng manual_state).
 */
export type ActivityStatus =
  | 'OPERATIONAL'
  | 'MAINTENANCE'
  | 'REPAIR'
  | 'SUSPENDED'
  | 'RETIRED';

export function deriveActivityStatus(
  manualState: State,
  activeWoKinds?: { maintenance: boolean; repair: boolean },
): ActivityStatus {
  // RETIRED terminal — không quan tâm WO.
  if (manualState === AssetManualState.RETIRED) return 'RETIRED';

  // NORMAL + có WO đang mở → MAINTENANCE / REPAIR (M5+ logic).
  if (manualState === AssetManualState.NORMAL && activeWoKinds) {
    if (activeWoKinds.repair) return 'REPAIR';
    if (activeWoKinds.maintenance) return 'MAINTENANCE';
  }

  if (manualState === AssetManualState.SUSPENDED) return 'SUSPENDED';
  return 'OPERATIONAL';
}
