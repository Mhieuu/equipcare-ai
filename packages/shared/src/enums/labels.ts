/**
 * Nhãn tiếng Việt cho enum Doc04 (Q-08 trong plan rev. 6.1).
 *
 * Nguyên tắc:
 * - Không thay đổi enum Doc04.
 * - Mapping lưu tập trung ở đây để cả web và api dùng chung.
 * - Backend response trả `activity_status` (enum) + `activity_status_label` (tiếng Việt).
 */
import { AssetActivityStatus } from './user.enum';
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

export const AssetActivityStatusLabel: Record<AssetActivityStatus, string> = {
  [AssetActivityStatus.OPERATIONAL]: 'Đang hoạt động',
  [AssetActivityStatus.MAINTENANCE]: 'Đang bảo trì',
  [AssetActivityStatus.REPAIR]: 'Đang sửa chữa',
  [AssetActivityStatus.SUSPENDED]: 'Tạm ngừng',
  [AssetActivityStatus.RETIRED]: 'Ngừng sử dụng',
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
