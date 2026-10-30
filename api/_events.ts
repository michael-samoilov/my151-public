export const TOOLS = ['dex', 'league', 'hub', 'favorites'] as const;
export type Tool = (typeof TOOLS)[number];

export function parseTool(v: unknown): Tool {
  return typeof v === 'string' && (TOOLS as readonly string[]).includes(v) ? (v as Tool) : 'dex';
}

export function parsePage(v: unknown): string | undefined {
  return typeof v === 'string' && v.startsWith('/') && v.length <= 80 && !/[\s<>"']/.test(v) ? v : undefined;
}

export const EXPORT_SURVEY_SKIP_EVENT = 'export_survey_skipped' as const;

export const EXPORT_SURVEY_SKIP_REASONS = ['not_now', 'close', 'abandon'] as const;
export type ExportSurveySkipReason = (typeof EXPORT_SURVEY_SKIP_REASONS)[number];

export const EXPORT_SURVEY_TOOLS = ['pokedex', 'league', 'card'] as const;
export type ExportSurveyToolField = (typeof EXPORT_SURVEY_TOOLS)[number];
export type ExportSurveyTool = ExportSurveyToolField;

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

export function isExportSurveyTool(v: unknown): v is ExportSurveyTool {
  return parseExportSurveyToolField(v) !== undefined;
}

export function isExportSurveySkipReason(v: unknown): v is ExportSurveySkipReason {
  return parseExportSurveySkipReason(v) !== undefined;
}

export const LEAGUE_EXPORT_CARD_EVENT = 'league-export-card' as const;
export const LEAGUE_EXPORT_LEAGUE_EVENT = 'league-export-league' as const;

export const LEAGUE_NUDGE_IDS = ['card', 'league'] as const;
export type LeagueNudgeId = (typeof LEAGUE_NUDGE_IDS)[number];
export const LEAGUE_NUDGE_ACTIONS = ['shown', 'cta', 'dismiss'] as const;
export type LeagueNudgeAction = (typeof LEAGUE_NUDGE_ACTIONS)[number];

export function leagueNudgeEvent(
  id: LeagueNudgeId,
  action: LeagueNudgeAction,
): `league-nudge-${LeagueNudgeId}-${LeagueNudgeAction}` {
  return `league-nudge-${id}-${action}`;
}

const FUNNEL_EVENTS = [
  'intro-shown',
  'intro-cta',
  'intro-dismiss',
  'milestone-25',
  'milestone-100',
  'milestone-151',
  'view-visit',
  'js-error',
  'hub-shown',
  'hub-cta-dex',
  'hub-cta-league',
  'hub-cta-favorites',
  'favorites-open',
  'favorites-visit',
  'favorites-first-pick',
  'favorites-quarter',
  'favorites-half',
  'favorites-complete',
  'favorites-export-full',
  'favorites-export-simplified',
  'favorites-export-shown',
  'favorites-export-stats',
  'favorites-nudge-complete-shown',
  'favorites-shiny-on',
  'favorites-icons-on',
  'league-open',
  'league-first-seat',
  'league-card-named',
  'league-shiny-on',
  LEAGUE_EXPORT_CARD_EVENT,
  LEAGUE_EXPORT_LEAGUE_EVENT,
  'league-nudge-card-shown',
  'league-nudge-card-cta',
  'league-nudge-card-dismiss',
  'league-nudge-league-shown',
  'league-nudge-league-cta',
  'league-nudge-league-dismiss',
  'league-promo-shown',
  'league-promo-cta',
  'league-promo-dismiss',
  EXPORT_SURVEY_SKIP_EVENT,
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export function isFunnelEvent(s: unknown): s is FunnelEvent {
  return typeof s === 'string' && (FUNNEL_EVENTS as readonly string[]).includes(s);
}

export function isLeagueExportEvent(
  s: unknown,
): s is typeof LEAGUE_EXPORT_CARD_EVENT | typeof LEAGUE_EXPORT_LEAGUE_EVENT {
  return s === LEAGUE_EXPORT_CARD_EVENT || s === LEAGUE_EXPORT_LEAGUE_EVENT;
}

export function leagueExportEventBody(exportKind: 'league' | 'card'): {
  event: typeof LEAGUE_EXPORT_CARD_EVENT | typeof LEAGUE_EXPORT_LEAGUE_EVENT;
  exportTool: 'league' | 'card';
} {
  return exportKind === 'card'
    ? { event: LEAGUE_EXPORT_CARD_EVENT, exportTool: 'card' }
    : { event: LEAGUE_EXPORT_LEAGUE_EVENT, exportTool: 'league' };
}

const FUNNEL_EVENT_LIST_CAP = 20;

export function parseFunnelEventList(v: unknown, cap = FUNNEL_EVENT_LIST_CAP): FunnelEvent[] {
  if (!Array.isArray(v)) return [];
  const out: FunnelEvent[] = [];
  for (const e of v) {
    if (isFunnelEvent(e) && !out.includes(e)) out.push(e);
    if (out.length >= cap) break;
  }
  return out;
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

export const EXPORT_SURVEY_SKIPS_KEY = 'export-survey-skips';
const EXPORT_SURVEY_SKIPS_CAP = 20;

export interface ExportSurveySkip {
  t: number;
  tool: ExportSurveyTool;
  reason: ExportSurveySkipReason;
}

export function exportSurveySkippedBody(
  cid: string,
  tool: ExportSurveyTool,
  reason: ExportSurveySkipReason,
  page?: string,
): {
  cid: string;
  event: typeof EXPORT_SURVEY_SKIP_EVENT;
  tool: ExportSurveyTool;
  exportTool: ExportSurveyTool;
  reason: ExportSurveySkipReason;
  page?: string;
} {
  return {
    cid,
    event: EXPORT_SURVEY_SKIP_EVENT,
    tool,
    exportTool: tool,
    reason,
    ...(page ? { page } : {}),
  };
}

export function parseExportSurveySkipFields(body: {
  tool?: unknown;
  exportTool?: unknown;
  reason?: unknown;
}): { tool: ExportSurveyTool; reason: ExportSurveySkipReason } | null {
  const reason = parseExportSurveySkipReason(body.reason);
  const tool = parseExportSurveyToolField(body.exportTool) ?? parseExportSurveyToolField(body.tool);
  if (!tool || !reason) return null;
  return { tool, reason };
}

function parseOneSkip(raw: unknown): ExportSurveySkip | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.t !== 'number' || !Number.isFinite(o.t)) return null;
  if (!isExportSurveyTool(o.tool) || !isExportSurveySkipReason(o.reason)) return null;
  return { t: o.t, tool: o.tool, reason: o.reason };
}

export function parseExportSurveySkipList(raw: unknown): ExportSurveySkip[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map(parseOneSkip).filter((s): s is ExportSurveySkip => s !== null);
}

export function parseExportSurveySkipMap(
  hash: Record<string, unknown> | null | undefined,
): Map<string, ExportSurveySkip[]> {
  const out = new Map<string, ExportSurveySkip[]>();
  for (const [cid, raw] of Object.entries(hash ?? {})) {
    const list = parseExportSurveySkipList(raw);
    if (list.length) out.set(cid, list);
  }
  return out;
}

export function appendExportSurveySkip(
  list: ExportSurveySkip[],
  next: ExportSurveySkip,
  cap = EXPORT_SURVEY_SKIPS_CAP,
): ExportSurveySkip[] {
  return [...list, next].slice(-cap);
}

export function stampExportSurveySkips<T extends { cid: string }>(
  row: T,
  skips: Map<string, ExportSurveySkip[]>,
): T & { exportSurveySkips?: ExportSurveySkip[] } {
  const list = skips.get(row.cid.split('::')[0]);
  if (!list?.length) return row;
  return { ...row, exportSurveySkips: list };
}

export const JOURNAL_PREFIX = 'journal';
export const JOURNAL_TTL_S = 400 * 24 * 60 * 60;
export const JOURNAL_MAX_PER_DAY = 50_000;

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

export const HAS_FAVORITES = 4;
