/**
 * The vocabulary shared by every analytics endpoint and the client: which
 * tool a beacon comes from, and which funnel events exist.
 *
 * One list, imported by event.ts and submit.ts, because the two once carried
 * separate copies that disagreed (`js-error` was in one and not the other),
 * and the league builder's export events were rejected with 400 for a week
 * because only the client knew their names.
 *
 * Dependency-free on purpose, like _limits.ts: the client and its unit tests
 * import it too. The leading underscore keeps Vercel from serving it.
 */

export const TOOLS = ['dex', 'league', 'hub'] as const;
export type Tool = (typeof TOOLS)[number];

/** The tool a beacon names, defaulting to the dex for clients that predate
 *  the field — every record written before the launch was a dex record. */
export function parseTool(v: unknown): Tool {
  return typeof v === 'string' && (TOOLS as readonly string[]).includes(v) ? (v as Tool) : 'dex';
}

/** The page path a beacon names. Shape-checked and bounded; absent is fine. */
export function parsePage(v: unknown): string | undefined {
  return typeof v === 'string' && v.startsWith('/') && v.length <= 80 && !/[\s<>"']/.test(v) ? v : undefined;
}

export const FUNNEL_EVENTS = [
  // Dex builder onboarding.
  'intro-shown',
  'intro-cta',
  'intro-dismiss',
  'milestone-25',
  'milestone-100',
  'milestone-151',
  'view-visit',
  // Uncaught client errors, counted once per browser. No payload — see
  // src/hooks/useJsErrorCounter.ts for why this is a counter, not a reporter.
  'js-error',
  // The hub: seen once per browser; each card click.
  'hub-shown',
  'hub-cta-dex',
  'hub-cta-league',
  // The gym leader maker.
  'league-open',
  'league-first-seat',
  'league-card-named',
  'league-export-card',
  'league-export-league',
  // The callout in the dex builder that points at the gym leader maker.
  'league-promo-shown',
  'league-promo-cta',
  'league-promo-dismiss',
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export function isFunnelEvent(s: unknown): s is FunnelEvent {
  return typeof s === 'string' && (FUNNEL_EVENTS as readonly string[]).includes(s);
}

/**
 * Per-day raw journal of funnel events, so a view designed after launch can
 * replay from launch day instead of from the day its counter was added.
 * `journal:<YYYY-MM-DD>` is a list of compact JSON entries; the day is UTC.
 */
export const JOURNAL_PREFIX = 'journal';
export const JOURNAL_TTL_S = 400 * 24 * 60 * 60;
export const JOURNAL_MAX_PER_DAY = 50_000;
