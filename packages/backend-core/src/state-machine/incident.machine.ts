import {
  IncidentStatus,
  type IncidentStatus as Status,
} from '@equipcare/shared';
import { AppError } from '../errors/app-error.js';

/**
 * Incident state machine (Doc04 §3.2, Doc02 §FR-INC-01..09).
 *
 * Workflow (plan §12.2 M4):
 *
 *   Reporter tạo:           ─── NEW
 *   Manager yêu cầu info:   ─── AWAITING_INFO
 *   Staff xử lý:            ─── IN_PROGRESS
 *   Staff xong:              ─── RESOLVED (set resolved_at)
 *   Manager xác nhận + đóng: ─── CLOSED (set closed_at, closed_by) — terminal
 *
 *   Cancel từ NEW/INFO/IN_PROGRESS: ─── CANCELLED (set cancelled_at, cancelled_by, cancel_reason)
 *
 * Ràng buộc:
 *   - CLOSED là terminal (không reopen, theo Doc04).
 *   - RESOLVED có thể → CLOSED (manager confirm) hoặc → IN_PROGRESS (nếu vẫn lỗi).
 *   - REOPENED không tồn tại trong enum Doc04 (Q-01).
 *   - CANCELLED chỉ từ các state chưa RESOLVED.
 *
 * Lưu ý transition side-effects (Doc02 §FR-INC-08/09):
 *   - Vào RESOLVED → set `resolved_at = NOW()`. Manager/Staff thực hiện.
 *   - Vào CLOSED  → set `closed_at`, `closed_by`. Manager thực hiện.
 *   - Vào CANCELLED → set `cancelled_at/by/reason`. Bắt buộc lý do.
 */
const TRANSITIONS: Record<Status, Status[]> = {
  [IncidentStatus.NEW]: [
    IncidentStatus.AWAITING_INFO,
    IncidentStatus.IN_PROGRESS,
    IncidentStatus.CANCELLED,
  ],
  [IncidentStatus.AWAITING_INFO]: [
    IncidentStatus.NEW,
    IncidentStatus.IN_PROGRESS,
    IncidentStatus.CANCELLED,
  ],
  [IncidentStatus.IN_PROGRESS]: [
    IncidentStatus.AWAITING_INFO,
    IncidentStatus.RESOLVED,
    IncidentStatus.CANCELLED,
  ],
  [IncidentStatus.RESOLVED]: [
    IncidentStatus.IN_PROGRESS, // vẫn lỗi → mở lại
    IncidentStatus.CLOSED, // manager confirm
  ],
  [IncidentStatus.CLOSED]: [], // terminal
  [IncidentStatus.CANCELLED]: [], // terminal
};

export function canTransitionIncident(from: Status, to: Status): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertIncidentTransition(from: Status, to: Status): void {
  if (!canTransitionIncident(from, to)) {
    throw AppError.unprocessable(
      'INCIDENT_INVALID_TRANSITION',
      `Không thể chuyển sự cố từ ${from} sang ${to}`,
      { from, to },
    );
  }
}

/** Vào RESOLVED → set `resolved_at`. Caller đặt vào UPDATE incidents. */
export function markResolved(): { resolved_at: Date } {
  return { resolved_at: new Date() };
}

/** Vào CLOSED → set `closed_at`. Caller đặt `closed_by` từ actor. */
export function markClosed(): { closed_at: Date } {
  return { closed_at: new Date() };
}

/** Vào CANCELLED → bắt buộc lý do (Doc02 §FR-INC-09). */
export function assertCancelReason(reason: string | undefined): string {
  if (!reason || reason.trim().length === 0) {
    throw AppError.unprocessable(
      'INCIDENT_CANCEL_REQUIRES_REASON',
      'Cần nhập lý do khi hủy sự cố',
      { field: 'reason' },
    );
  }
  return reason.trim();
}
