/**
 * Which surface a feedback report came from, counted over a time window.
 *
 * The endpoint keeps per-day counts by CATEGORY (bug, idea, …) but not by
 * route, and there are now four surfaces sending reports rather than one. The
 * counts here are folded out of the reports the card already fetched, so no
 * new server counter has to exist — and, unlike a counter, it works back to
 * the first report ever filed.
 *
 * Kept out of the component so the windowing can be tested directly.
 */

/** Human label per route, in the order the app presents the surfaces. Routes
 *  outside this list still count; they render under their own raw name. */
export const ROUTE_LABELS: Record<string, string> = {
  home: 'Hub',
  builder: 'Dex builder',
  view: 'Dex view',
  league: 'Gym leader maker',
  'league-card': 'Gym leader card',
  analytics: 'Analytics',
  unknown: 'Unknown',
};

export interface RouteCount {
  route: string;
  label: string;
  last7: number;
  last30: number;
}

interface Reported {
  ts: number;
  context?: Record<string, unknown>;
}

/**
 * Reports per route in the last 7 and 30 days, busiest 30-day route first.
 *
 * Counts only the reports passed in. The card fetches one page, so these are
 * per-page counts whenever the window holds more reports than a page — which
 * the caller has to say, or the number reads as a total it is not.
 */
export function routeCounts(items: Reported[], now = Date.now()): RouteCount[] {
  const day = 86_400_000;
  const totals = new Map<string, { last7: number; last30: number }>();
  for (const item of items) {
    const age = now - item.ts;
    if (age > 30 * day || age < 0) continue;
    const raw = item.context?.route;
    const route = typeof raw === 'string' && raw ? raw : 'unknown';
    let t = totals.get(route);
    if (!t) totals.set(route, (t = { last7: 0, last30: 0 }));
    t.last30 += 1;
    if (age <= 7 * day) t.last7 += 1;
  }
  return [...totals.entries()]
    .map(([route, t]) => ({ route, label: ROUTE_LABELS[route] ?? route, ...t }))
    .sort((a, b) => b.last30 - a.last30 || (a.label < b.label ? -1 : 1));
}
