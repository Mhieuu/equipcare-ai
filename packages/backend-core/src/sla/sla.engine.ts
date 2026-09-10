import { WorkOrderStatus, type WorkOrderStatus as WOStatus } from '@equipcare/shared';

/**
 * SLA engine (Doc02 §6 — Q-04).
 *
 * Công thức (đã chốt):
 *   total_elapsed_seconds = end_at − sla_started_at
 *   excluded_seconds      = duration(union(pause_intervals, waiting_approval_intervals))
 *   active_elapsed        = total_elapsed − excluded
 *   is_overdue = active_elapsed > sla_seconds
 *                AND status IN (ASSIGNED, IN_PROGRESS, WAITING_APPROVAL)
 *
 * PAUSED/RESUMED là event, không phải status → status vẫn là IN_PROGRESS khi pause.
 */

const OPEN_STATUSES: WOStatus[] = [
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.WAITING_APPROVAL,
];

export interface SlaInterval {
  startedAt: Date;
  endedAt: Date | null; // null = đang mở
}

export function durationSeconds(interval: SlaInterval, now: Date = new Date()): number {
  const end = interval.endedAt ?? now;
  return Math.max(0, Math.floor((end.getTime() - interval.startedAt.getTime()) / 1000));
}

export interface UnionResult {
  totalExcludedSeconds: number;
}

/**
 * Tính tổng thời lượng của union N intervals, KHÔNG trừ trùng khi overlap.
 * Trả về tổng giây bị loại trừ khỏi active_elapsed.
 */
export function unionDuration(intervals: SlaInterval[], now: Date = new Date()): number {
  if (intervals.length === 0) return 0;
  const closed = intervals
    .map((i) => ({
      from: i.startedAt.getTime(),
      to: (i.endedAt ?? now).getTime(),
    }))
    .filter((i) => i.to > i.from)
    .sort((a, b) => a.from - b.from);

  let total = 0;
  let curFrom = closed[0].from;
  let curTo = closed[0].to;
  for (let i = 1; i < closed.length; i++) {
    const next = closed[i];
    if (next.from <= curTo) {
      curTo = Math.max(curTo, next.to);
    } else {
      total += curTo - curFrom;
      curFrom = next.from;
      curTo = next.to;
    }
  }
  total += curTo - curFrom;
  return Math.max(0, Math.floor(total / 1000));
}

export interface ActiveElapsedInput {
  slaStartedAt: Date;
  now?: Date;
  pauseIntervals: SlaInterval[];
  waitingApprovalIntervals: SlaInterval[];
}

export function computeActiveElapsed(input: ActiveElapsedInput): number {
  const now = input.now ?? new Date();
  const total = durationSeconds(
    { startedAt: input.slaStartedAt, endedAt: now },
    now,
  );
  const excluded = unionDuration(
    [...input.pauseIntervals, ...input.waitingApprovalIntervals],
    now,
  );
  return Math.max(0, total - excluded);
}

export function isOverdue(
  status: WOStatus,
  slaSeconds: number,
  activeElapsedSeconds: number,
): boolean {
  if (!OPEN_STATUSES.includes(status)) return false;
  return activeElapsedSeconds > slaSeconds;
}
