import { FAVORITE_SESSION_GAP_MS } from '../../../api/_favoriteRecord';
import { LEAGUE_SESSION_GAP_MS } from '../../../api/_leagueRecord';
import { alignSessionMs } from '../../../api/_sessionize';
import { dexPokemonCount, leagueExported } from './userPreview';

/** One session on the clock, in ms since the epoch. */
export type Span = { start: number; end: number };

/** One tool's sessions, as its preview chip counts them. */
export type ToolUsage = {
  /** Every session the tool counted, logged or not. */
  sessions: number;
  /** The summed durations the record keeps (its newest 50 sessions). */
  totalMs: number;
  /** The logged sessions. Older ones fell out of the log, or predate it. */
  spans: Span[];
};

/**
 * Two sessions this close are one visit. Each tool joins a beacon to a
 * session within its own gap, and the Dex gap (`SESSION_GAP_MS` in
 * api/_shared.ts, which the client cannot import) equals both of these. The
 * widest gap means the total never splits a session a tool joined.
 */
export const BROWSER_SESSION_GAP_MS = Math.max(LEAGUE_SESSION_GAP_MS, FAVORITE_SESSION_GAP_MS);

const sumMs = (ms: readonly number[] | undefined) =>
  (ms ?? []).reduce((a, b) => a + (Number.isFinite(b) && b > 0 ? b : 0), 0);

/** Dex and League: each log entry stamps its session's end, and `sessionMs`
 *  pairs with the log from the newest end. */
export function endStampedUsage(rec: {
  sessions?: number;
  sessionMs?: number[];
  sessionLog?: { ts: number }[];
}): ToolUsage {
  const log = rec.sessionLog ?? [];
  const ms = alignSessionMs(log.length, rec.sessionMs ?? []);
  const spans: Span[] = [];
  log.forEach((entry, i) => {
    if (!Number.isFinite(entry.ts)) return;
    const dur = Number.isFinite(ms[i]) && ms[i] > 0 ? ms[i] : 0;
    spans.push({ start: entry.ts - dur, end: entry.ts });
  });
  return { sessions: rec.sessions ?? rec.sessionMs?.length ?? 0, totalMs: sumMs(rec.sessionMs), spans };
}

/** Picker: each log entry stores its session's start and end. */
export function spanUsage(rec: {
  sessions?: number;
  sessionMs?: number[];
  sessionLog?: { ts: number; endTs: number }[];
}): ToolUsage {
  const spans = (rec.sessionLog ?? [])
    .filter((s) => Number.isFinite(s.ts) && Number.isFinite(s.endTs) && s.endTs >= s.ts)
    .map((s) => ({ start: s.ts, end: s.endTs }));
  return { sessions: rec.sessions ?? spans.length, totalMs: sumMs(rec.sessionMs), spans };
}

/**
 * The browser as a whole: every logged session of every tool on one timeline.
 *
 * - Sessions: sessions that overlap, or start within the gap of the visit
 *   before ending, are one visit.
 * - Time: the union of the sessions, so a minute in two tools counts once and
 *   the idle gap between two tools counts not at all.
 * - Unlogged sessions (older than a record's newest 50, or from before the
 *   Dex log existed) have no clock time. All of them precede that tool's
 *   logged ones, so each counts as a visit of its own, with its kept duration.
 * - The result never drops below the busiest tool. A visit in one tool can
 *   bridge two sessions that another tool split, and a record's own sessions
 *   can overlap, so the merge alone could undercount.
 *
 * It never exceeds the sum of the tools either: merging only removes sessions
 * and overlap.
 */
export function browserTotal(tools: readonly ToolUsage[]): { sessions: number; totalMs: number } {
  const spans = tools.flatMap((t) => t.spans).sort((a, b) => a.start - b.start || a.end - b.end);
  let visits = 0;
  let unionMs = 0;
  let visitEnd = -Infinity;
  let runStart = 0;
  let runEnd = -Infinity;
  for (const s of spans) {
    if (s.start > visitEnd + BROWSER_SESSION_GAP_MS) visits += 1;
    visitEnd = Math.max(visitEnd, s.end);
    if (s.start > runEnd) {
      if (runEnd > -Infinity) unionMs += runEnd - runStart;
      runStart = s.start;
      runEnd = s.end;
    } else {
      runEnd = Math.max(runEnd, s.end);
    }
  }
  if (runEnd > -Infinity) unionMs += runEnd - runStart;

  let sessions = visits;
  let totalMs = unionMs;
  let busiest = 0;
  let longest = 0;
  for (const t of tools) {
    const loggedMs = t.spans.reduce((a, s) => a + (s.end - s.start), 0);
    sessions += Math.max(0, t.sessions - t.spans.length);
    totalMs += Math.max(0, t.totalMs - loggedMs);
    busiest = Math.max(busiest, t.sessions);
    longest = Math.max(longest, t.totalMs);
  }
  return { sessions: Math.max(sessions, busiest), totalMs: Math.max(totalMs, longest) };
}

export type UsageTool = 'dex' | 'league' | 'picker';

/** One tool a browser used: its progress, and its sessions and time. */
export type ToolCell = { tool: UsageTool; count: number; exported: boolean; usage: ToolUsage };

type SessionRecord = { sessions?: number; sessionMs?: number[] };

/** The tools one browser used, in card order: Dex, League, Picker. */
export function toolCells(t: {
  dex?: SessionRecord & { latestIds?: number[]; exported?: boolean; sessionLog?: { ts: number }[] };
  league?: SessionRecord & { maxCards: number; exportsCard: number; exportsLeague: number; sessionLog?: { ts: number }[] };
  picker?: SessionRecord & {
    latest: { filled: number };
    exportsFull: number;
    exportsSimplified: number;
    sessionLog?: { ts: number; endTs: number }[];
  };
}): ToolCell[] {
  const cells: ToolCell[] = [];
  if (t.dex) {
    cells.push({ tool: 'dex', count: dexPokemonCount(t.dex.latestIds), exported: !!t.dex.exported, usage: endStampedUsage(t.dex) });
  }
  if (t.league) {
    cells.push({
      tool: 'league',
      count: t.league.maxCards,
      exported: leagueExported(t.league.exportsCard, t.league.exportsLeague),
      usage: endStampedUsage(t.league),
    });
  }
  if (t.picker) {
    cells.push({
      tool: 'picker',
      count: t.picker.latest.filled,
      exported: t.picker.exportsFull + t.picker.exportsSimplified > 0,
      usage: spanUsage(t.picker),
    });
  }
  return cells;
}
