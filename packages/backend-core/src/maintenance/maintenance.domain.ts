import { addDays, addMonths, addQuarters, addWeeks, addYears, formatISO, startOfDay } from 'date-fns';

/**
 * Maintenance recurrence (Doc04 section 5.10 + plan M8).
 *
 * Hien tai P1 (M8) chi dung FIXED schedule basis:
 *   next_due_on(n+1) = next_due_on(n) + interval_value * interval_unit
 *
 * Neu plan is_active=false → scheduler sinh SKIPPED occurrence cho due_on da qua
 * (Plan paused), KHONG sinh WO.
 *
 * Q-02 (Doc04): OVERDUE occurrence van phai co 1 WO mo hoac WO thay the hop le.
 * Logic:
 *   - Moi occurrence (plan_id, due_on) UNIQUE.
 *   - Tick scheduler:
 *       1) voi moi plan active voi schedule_basis='FIXED':
 *           - next_due_on <= today(): chua co occurrence? -> tao PENDING
 *             (scheduler se cap nhat thanh OVERDUE neu qua ngay).
 *             is_active=false -> tao SKIPPED (PAUSED).
 *           - advance next_due_on theo interval.
 *       2) voi moi occurrence OVERDUE/PLANNED khong co WO open:
 *           - tao WO moi (kind='MAINTENANCE', priority='MEDIUM', creation_mode='FROM_MAINTENANCE').
 *           - cap nhat occurrence.status = 'IN_PROGRESS'.
 *       3) voi occurrence co WO COMPLETED:
 *           - cap nhat status='COMPLETED', advance next_due_on neu can.
 *   - Resume plan (is_active true -> true): KHONG sinh bu SKIPPED (plan M8: "Resume khong sinh bu occurrence SKIPPED").
 */

export type MaintenanceIntervalUnit = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

export const MaintenanceIntervalUnit: Record<MaintenanceIntervalUnit, MaintenanceIntervalUnit> = {
  DAY: 'DAY',
  WEEK: 'WEEK',
  MONTH: 'MONTH',
  QUARTER: 'QUARTER',
  YEAR: 'YEAR',
};

export type MaintenanceScheduleBasis = 'FIXED' | 'AFTER_COMPLETION';
export const MaintenanceScheduleBasis: Record<MaintenanceScheduleBasis, MaintenanceScheduleBasis> = {
  FIXED: 'FIXED',
  AFTER_COMPLETION: 'AFTER_COMPLETION',
};

export type MaintenanceOccurrenceStatus =
  | 'PLANNED'
  | 'SKIPPED'
  | 'OVERDUE'
  | 'IN_PROGRESS'
  | 'COMPLETED';
export const MaintenanceOccurrenceStatus: Record<MaintenanceOccurrenceStatus, MaintenanceOccurrenceStatus> = {
  PLANNED: 'PLANNED',
  SKIPPED: 'SKIPPED',
  OVERDUE: 'OVERDUE',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
};

/** Tinh next due_on tu current + interval. Tra ve Date (00:00 UTC). */
export function advanceDueOn(
  current: Date,
  intervalUnit: MaintenanceIntervalUnit,
  intervalValue: number,
): Date {
  if (intervalValue <= 0) {
    throw new Error('interval_value phai > 0');
  }
  let result: Date;
  switch (intervalUnit) {
    case MaintenanceIntervalUnit.DAY:
      result = addDays(current, intervalValue);
      break;
    case MaintenanceIntervalUnit.WEEK:
      result = addWeeks(current, intervalValue);
      break;
    case MaintenanceIntervalUnit.MONTH:
      result = addMonths(current, intervalValue);
      break;
    case MaintenanceIntervalUnit.QUARTER:
      result = addQuarters(current, intervalValue);
      break;
    case MaintenanceIntervalUnit.YEAR:
      result = addYears(current, intervalValue);
      break;
    default:
      throw new Error(`Unsupported interval_unit: ${intervalUnit as string}`);
  }
  return new Date(startOfDay(result));
}

/** Normalize Date thanh YYYY-MM-DD (ISO date). */
export function toDateOnly(d: Date): string {
  return formatISO(new Date(startOfDay(d)), { representation: 'date' });
}

/** Kiem tra due_on co qua ngay hom nay (UTC date). */
export function isDueOverdue(dueOn: Date, today: Date): boolean {
  const due = startOfDay(dueOn);
  const t = startOfDay(today);
  return (due as unknown as number) < (t as unknown as number);
}
