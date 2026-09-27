/**
 * The admin dashboard's date ranges. `api/submissions.ts` reads `?range=`,
 * and the admin page draws one chip per range. Nothing here touches Redis.
 */

import { DAY_MS, HOUR_MS, activeTimestamps, dayStart, type SessionRecord } from './_aggregate.js';

export const DASHBOARD_RANGES = ['24h', '7d', '28d', '90d', '180d', '365d', 'all'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

const SPAN_MS: Record<Exclude<DashboardRange, 'all'>, number> = {
  '24h': 24 * HOUR_MS,
  '7d': 7 * DAY_MS,
  '28d': 28 * DAY_MS,
  '90d': 90 * DAY_MS,
  '180d': 180 * DAY_MS,
  '365d': 365 * DAY_MS,
};

export function isDashboardRange(v: string): v is DashboardRange {
  return (DASHBOARD_RANGES as readonly string[]).includes(v);
}

/** Where the window opens: it holds (start, now]. `null` for `all`. */
export function rangeStart(range: DashboardRange, now: number): number | null {
  return range === 'all' ? null : now - SPAN_MS[range];
}

/** Whether the record was active after `start`. Every record is, for `all`. */
export function activeSince(r: SessionRecord, start: number | null): boolean {
  return start === null || activeTimestamps(r).some((ts) => ts > start);
}

/** Whether the record was first seen on or after the UTC day the window opens
 *  on. Cohort cards count by whole UTC days, as the day counters do. */
export function firstSeenSince(r: { firstTs: number }, start: number | null): boolean {
  return start === null || r.firstTs >= dayStart(start);
}
