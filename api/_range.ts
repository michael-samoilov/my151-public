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

export function rangeStart(range: DashboardRange, now: number): number | null {
  return range === 'all' ? null : now - SPAN_MS[range];
}

export function activeSince(r: SessionRecord, start: number | null): boolean {
  return start === null || activeTimestamps(r).some((ts) => ts > start);
}

export function firstSeenSince(r: { firstTs: number }, start: number | null): boolean {
  return start === null || r.firstTs >= dayStart(start);
}

/** How long a `funnel:<day>` counter lives. It covers the longest bounded
 *  range (365d is 366 day keys), so every bounded range sums exact day counts. */
export const FUNNEL_DAY_TTL_DAYS = 400;
export const FUNNEL_DAY_TTL_S = FUNNEL_DAY_TTL_DAYS * 24 * 60 * 60;

export function funnelDayKeys(range: DashboardRange, now: number): string[] | null {
  const start = rangeStart(range, now);
  if (start === null) return null;
  const first = dayStart(start);
  const days = (dayStart(now) - first) / DAY_MS + 1;
  if (days > FUNNEL_DAY_TTL_DAYS) return null;
  return Array.from({ length: days }, (_, i) => `funnel:${new Date(first + i * DAY_MS).toISOString().slice(0, 10)}`);
}
