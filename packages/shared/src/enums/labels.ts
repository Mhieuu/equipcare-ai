/**
 * Nhãn tiếng Việt cho enum Doc04 (Q-08 trong plan rev. 6.1).
 *
 * Nguyên tắc:
 * - Không thay đổi enum Doc04.
 * - Mapping lưu tập trung ở đây để cả web và api dùng chung.
 * - Backend response trả `activity_status` (enum) + `activity_status_label` (tiếng Việt).
 */
import {
  ActivityStatus,
  AssetManualState,
} from './asset.enum';
import {
  WorkOrderStatus,
  WorkOrderType,
} from './work-order.enum';
import {
  IncidentStatus,
  IncidentPriority,
} from './incident.enum';
import {
  ApprovalStatus,
} from './approval.enum';

/**
 * Q-08 (plan §9): nhãn tiếng Việt cho `assets.activity_status` (Doc04 §7.2).
 *
 * - OPERATIONAL  → "Đang hoạt động"
 * - MAINTENANCE  → "Đang bảo trì"      (có WO MAINTENANCE đang mở)
 * - REPAIR       → "Đang sửa chữa"     (có WO REPAIR đang mở)
 * - SUSPENDED    → "Tạm ngừng"
 * - RETIRED      → "Ngừng sử dụng"
 *
 * View `v_asset_state` (migration 0002_asset) tính từ `assets.manual_state` +
 * `work_orders` đang mở (filter `status IN ('NEW','ASSIGNED','IN_PROGRESS','WAITING_APPROVAL')`
 * và `type ∈ ('MAINTENANCE','REPAIR')`).
 */
export const ActivityStatusLabel: Record<ActivityStatus, string> = {
  [ActivityStatus.OPERATIONAL]: 'Đang hoạt động',
  [ActivityStatus.MAINTENANCE]: 'Đang bảo trì',
  [ActivityStatus.REPAIR]: 'Đang sửa chữa',
  [ActivityStatus.SUSPENDED]: 'Tạm ngừng',
  [ActivityStatus.RETIRED]: 'Ngừng sử dụng',
};

/**
 * Nhãn tiếng Việt cho `assets.manual_state` (Doc04 §5.3).
 * UI đôi khi hiển thị thẳng `manual_state` (không cần derived view).
 */
export const AssetManualStateLabel: Record<AssetManualState, string> = {
  [AssetManualState.NORMAL]: 'Đang vận hành',
  [AssetManualState.SUSPENDED]: 'Tạm ngừng',
  [AssetManualState.RETIRED]: 'Ngừng sử dụng',
};

export const WorkOrderStatusLabel: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.NEW]: 'Mới tạo',
  [WorkOrderStatus.ASSIGNED]: 'Đã phân công',
  [WorkOrderStatus.IN_PROGRESS]: 'Đang thực hiện',
  [WorkOrderStatus.WAITING_APPROVAL]: 'Chờ phê duyệt',
  [WorkOrderStatus.COMPLETED]: 'Hoàn thành',
  [WorkOrderStatus.CANCELLED]: 'Đã hủy',
};

export const WorkOrderTypeLabel: Record<WorkOrderType, string> = {
  [WorkOrderType.REPAIR]: 'Sửa chữa',
  [WorkOrderType.MAINTENANCE]: 'Bảo trì',
  [WorkOrderType.INSPECTION]: 'Kiểm tra',
};

export const IncidentStatusLabel: Record<IncidentStatus, string> = {
  [IncidentStatus.NEW]: 'Mới tạo',
  [IncidentStatus.AWAITING_INFO]: 'Chờ bổ sung',
  [IncidentStatus.IN_PROGRESS]: 'Đang xử lý',
  [IncidentStatus.RESOLVED]: 'Đã giải quyết',
  [IncidentStatus.CLOSED]: 'Đã đóng',
  [IncidentStatus.CANCELLED]: 'Đã hủy',
};

export const IncidentPriorityLabel: Record<IncidentPriority, string> = {
  [IncidentPriority.LOW]: 'Thấp',
  [IncidentPriority.MEDIUM]: 'Trung bình',
  [IncidentPriority.HIGH]: 'Cao',
  [IncidentPriority.CRITICAL]: 'Khẩn cấp',
};

export const ApprovalStatusLabel: Record<ApprovalStatus, string> = {
  [ApprovalStatus.DRAFT]: 'Nháp',
  [ApprovalStatus.PENDING]: 'Chờ duyệt',
  [ApprovalStatus.NEEDS_INFO]: 'Yêu cầu bổ sung',
  [ApprovalStatus.APPROVED]: 'Đã duyệt',
  [ApprovalStatus.REJECTED]: 'Từ chối',
  [ApprovalStatus.CANCELLED]: 'Đã hủy',
};
