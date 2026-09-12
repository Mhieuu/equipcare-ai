/**
 * Asset `manual_state` (Doc04 §5.3 — 3 trạng thái vận hành).
 *
 * Con người đặt thủ công (Doc02 §FR-ASSET-05). KHÔNG tự thay đổi theo WO.
 *   - NORMAL    → thiết bị đang vận hành bình thường.
 *   - SUSPENDED → tạm ngừng (bảo trì dài hạn, sửa chữa lớn).
 *   - RETIRED   → ngừng sử dụng vĩnh viễn (FR-ASSET-07: chặn WO mới).
 *
 * Re-export từ `user.enum.ts` (vị trí enum gốc trước M2) để giữ backward-compat.
 * State machine + transitions: xem `@equipcare/backend-core` `asset.machine.ts`.
 */
export { AssetManualState, type AssetManualState as AssetManualStateType } from './user.enum.js';

/**
 * Asset `activity_status` (Doc04 §7.2 — derived từ view `v_asset_state`).
 *
 * M2: chỉ manual_state. M5+ sẽ tính thêm MAINTENANCE/REPAIR từ WO đang mở.
 * Mapping sang tiếng Việt: xem `packages/shared/src/enums/labels.ts`.
 */
export const ActivityStatus = {
  OPERATIONAL: 'OPERATIONAL',
  MAINTENANCE: 'MAINTENANCE',
  REPAIR: 'REPAIR',
  SUSPENDED: 'SUSPENDED',
  RETIRED: 'RETIRED',
} as const;

export type ActivityStatus = (typeof ActivityStatus)[keyof typeof ActivityStatus];
