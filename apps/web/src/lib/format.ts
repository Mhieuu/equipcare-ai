/**
 * Format an ISO date string (or anything `new Date()` accepts) using date-fns.
 *
 * Returns the `fallback` (default `'—'`) when:
 *  - value is null/undefined/empty string
 *  - `new Date(value)` yields an Invalid Date
 *
 * Centralized here so a single change covers every page that displays dates.
 */
import { format as fmt } from 'date-fns';

export function formatDate(
  value: string | number | Date | null | undefined,
  pattern = 'dd/MM/yyyy HH:mm',
  fallback = '—',
): string {
  if (value === null || value === undefined || value === '') return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  try {
    return fmt(d, pattern);
  } catch {
    return fallback;
  }
}

/**
 * Format a duration given in seconds as "Xd Yh Zm" (or "—").
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
