/**
 * The admin dashboard's date ranges. `api/submissions.ts` reads `?range=`,
 * and the admin page draws one chip per range. Nothing here touches Redis.
 */

import { DAY_MS, HOUR_MS, activeTimestamps, dayStart, type SessionRecord } from './_aggregate.js';
import { TOOL_CATALOG } from './_crossTool.js';

/** Windows that end now and span a fixed time, then every record. */
export const ROLLING_RANGES = ['24h', '7d', '28d', '90d', '180d', '365d', 'all'] as const;
export type RollingRange = (typeof ROLLING_RANGES)[number];

/** A window that opens at a tool's launch and ends now: `since-league`. */
export type LaunchRange = `since-${string}`;
export type DashboardRange = RollingRange | LaunchRange;

export interface ToolLaunch {
  range: LaunchRange;
  /** The tool's `short` name, for the chip. */
  short: string;
  /** UTC ms. */
  at: number;
}

/** One range per tool after the first, once the catalog sets its launch. */
export const TOOL_LAUNCHES: readonly ToolLaunch[] = TOOL_CATALOG.slice(1).flatMap((tool) =>
  tool.launchedAt === null ? [] : [{ range: `since-${tool.id}` as const, short: tool.short, at: tool.launchedAt }],
);

export const DASHBOARD_RANGES: readonly DashboardRange[] = [...ROLLING_RANGES, ...TOOL_LAUNCHES.map((l) => l.range)];

const SPAN_MS: Record<Exclude<RollingRange, 'all'>, number> = {
  '24h': 24 * HOUR_MS,
  '7d': 7 * DAY_MS,
  '28d': 28 * DAY_MS,
  '90d': 90 * DAY_MS,
  '180d': 180 * DAY_MS,
  '365d': 365 * DAY_MS,
};

export function isDashboardRange(v: string): v is DashboardRange {
  return DASHBOARD_RANGES.includes(v as DashboardRange);
}

export function isLaunchRange(range: DashboardRange): range is LaunchRange {
  return range.startsWith('since-');
}

/** The launch a `since-` range opens at. Every range comes from the catalog,
 *  so a missing one skipped `isDashboardRange`. */
export function toolLaunch(range: LaunchRange): ToolLaunch {
  const launch = TOOL_LAUNCHES.find((l) => l.range === range);
  if (!launch) throw new Error(`Unknown launch range: ${range}`);
  return launch;
}

/** Where the window opens: it holds (start, now]. `null` for `all`. */
export function rangeStart(range: DashboardRange, now: number): number | null {
  if (range === 'all') return null;
  return isLaunchRange(range) ? toolLaunch(range).at : now - SPAN_MS[range];
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

/** Days api/event.ts keeps each `funnel:<YYYY-MM-DD>` counter (its DAILY_TTL_S). */
const FUNNEL_DAY_TTL_DAYS = 120;

/**
 * The per-day funnel counter keys that cover the range's cohort window, from
 * the UTC day it opens on through today. `null` when the all-time `funnel`
 * hash answers instead: for `all`, and for a window older than the counters.
 */
export function funnelDayKeys(range: DashboardRange, now: number): string[] | null {
  const start = rangeStart(range, now);
  if (start === null) return null;
  const first = dayStart(start);
  const days = (dayStart(now) - first) / DAY_MS + 1;
  if (days > FUNNEL_DAY_TTL_DAYS) return null;
  return Array.from({ length: days }, (_, i) => `funnel:${new Date(first + i * DAY_MS).toISOString().slice(0, 10)}`);
}
