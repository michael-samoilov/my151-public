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

export const EXPORT_SURVEY_SKIP_EVENT = 'export_survey_skipped' as const;

export const EXPORT_SURVEY_SKIP_REASONS = ['not_now', 'close', 'abandon'] as const;
export type ExportSurveySkipReason = (typeof EXPORT_SURVEY_SKIP_REASONS)[number];

export const EXPORT_SURVEY_TOOLS = ['pokedex', 'league', 'card'] as const;
export type ExportSurveyToolField = (typeof EXPORT_SURVEY_TOOLS)[number];

export function parseExportSurveySkipReason(v: unknown): ExportSurveySkipReason | undefined {
  return typeof v === 'string' && (EXPORT_SURVEY_SKIP_REASONS as readonly string[]).includes(v)
    ? (v as ExportSurveySkipReason)
    : undefined;
}

export function parseExportSurveyToolField(v: unknown): ExportSurveyToolField | undefined {
  return typeof v === 'string' && (EXPORT_SURVEY_TOOLS as readonly string[]).includes(v)
    ? (v as ExportSurveyToolField)
    : undefined;
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
  EXPORT_SURVEY_SKIP_EVENT,
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export function isFunnelEvent(s: unknown): s is FunnelEvent {
  return typeof s === 'string' && (FUNNEL_EVENTS as readonly string[]).includes(s);
}

/** Parse one stored journal entry. The SDK parses JSON strings back into
 *  objects when it can, so entries arrive as either. */
export function parseJournalEntry(raw: unknown): JournalEntry | null {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const e = o as Record<string, unknown>;
  if (typeof e.t !== 'number' || typeof e.cid !== 'string' || !isFunnelEvent(e.ev)) return null;
  const exportTool = parseExportSurveyToolField(e.exportTool);
  const reason = parseExportSurveySkipReason(e.reason);
  return {
    t: e.t,
    cid: e.cid,
    tool: parseTool(e.tool),
    ev: e.ev,
    ...(typeof e.page === 'string' ? { page: e.page } : {}),
    ...(exportTool ? { exportTool } : {}),
    ...(reason ? { reason } : {}),
  };
}

/**
 * Per-day raw journal of funnel events, so a view designed after launch can
 * replay from launch day instead of from the day its counter was added.
 * `journal:<YYYY-MM-DD>` is a list of compact JSON entries; the day is UTC.
 */
export const JOURNAL_PREFIX = 'journal';
export const JOURNAL_TTL_S = 400 * 24 * 60 * 60;
export const JOURNAL_MAX_PER_DAY = 50_000;

/** One journal entry, as api/event.ts writes it and api/journal.ts returns it. */
export interface JournalEntry {
  t: number;
  cid: string;
  tool: Tool;
  ev: FunnelEvent;
  page?: string;
  exportTool?: ExportSurveyToolField;
  reason?: ExportSurveySkipReason;
}

/**
 * Which record stores a browser ended up in, as a bitmask on the journal
 * response's `membership` map.
 *
 * The join lives on the server because only the server holds the two record
 * hashes; the constants live here because the client reads the result.
 */
export const HAS_DEX = 1;
export const HAS_LEAGUE = 2;
