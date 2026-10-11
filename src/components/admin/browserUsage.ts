import type { BrowserRow, BrowserTime, ToolStat } from '../../../api/_dashboard';
import { fmtChipDuration, formatWhen } from './userPreview';

export type UsageTool = 'dex' | 'league' | 'picker';
export type UsageSource = 'active' | 'legacy';
export type CardTime = BrowserTime & {missing?: boolean};

/** One tool on a card: its progress, and its sessions and time. `used` is
 *  false when the browser never opened the tool; the card still shows it. */
export type ToolCell = { tool: UsageTool; used: boolean; count: number; exported: boolean; sessions: number; totalMs: number; missing?: boolean; partial?: true };

const TOOLS: readonly UsageTool[] = ['dex', 'league', 'picker'];

/** All three tools of one row, in card order: Dex, League, Picker. */
export function toolCells(row: BrowserRow, source: UsageSource = 'legacy'): ToolCell[] {
  return TOOLS.map((tool) => {
    const stat = row[tool];
    return stat
      ? { tool, used: true, count: stat.count, exported: !!stat.exported, ...(source === 'active' ? stat.active ?? {sessions: 0, totalMs: 0, missing: true} : {sessions: stat.sessions, totalMs: stat.totalMs}) }
      : { tool, used: false, count: 0, exported: false, sessions: 0, totalMs: 0 };
  });
}

export function totalTime(row: BrowserRow, source: UsageSource): CardTime {
  return source === 'active' ? row.activeTotal ?? {sessions: 0, totalMs: 0, missing: true} : row.total;
}

function longest<T>(items: readonly T[], length: (item: T) => number): T {
  return items.reduce((a, b) => (length(b) > length(a) ? b : a));
}

/** Digits read as one width each; a camera icon takes about two. */
const progressLength = (s: ToolStat) => String(s.count).length + (s.exported ? 2 : 0);

function widestStat(stats: readonly ToolStat[]): ToolStat {
  if (stats.length === 0) return { count: 0, sessions: 0, totalMs: 0 };
  const progress = longest(stats, progressLength);
  return {
    count: progress.count,
    ...(progress.exported ? { exported: true as const } : {}),
    sessions: Math.max(...stats.map((s) => s.sessions)),
    totalMs: longest(stats, (s) => fmtChipDuration(s.totalMs).length).totalMs,
    ...(stats.some(s => s.active) ? {active: widestTime(stats.flatMap(s => s.active ?? []))} : {}),
  };
}

function widestTime(times: readonly BrowserTime[]): BrowserTime {
  return {sessions: Math.max(...times.map(t => t.sessions)),
    totalMs: longest(times, t => fmtChipDuration(t.totalMs).length).totalMs,
    ...(times.some(t => t.partial) ? {partial: true as const} : {})};
}

/** A row's "When" text with every digit as 0. The digits are tabular, so
 *  texts of one shape are one width. Cached per row object, which lives as
 *  long as its dashboard load, so each date formats once. */
const shapes = new WeakMap<BrowserRow, string>();
function whenShape(row: BrowserRow): string {
  let shape = shapes.get(row);
  if (shape === undefined) {
    shape = formatWhen(row.lastTs, row.tz).replace(/\d/g, '0');
    shapes.set(row, shape);
  }
  return shape;
}

/** Every distinct "When" shape of `rows`: a hidden copy of each holds the
 *  When column at the width of the widest. Month names, AM and PM, and zone
 *  names differ in width, so the longest text is not always the widest. */
export function whenShapes(rows: readonly BrowserRow[]): string[] {
  return [...new Set(rows.map(whenShape))];
}

/**
 * A row as wide as the widest of `rows` in each usage column. The list
 * renders only the rows near the viewport, so the table's auto columns would
 * resize as rows scroll in; a hidden copy of this row holds them at the width
 * every row needs. Each line of a column takes its own widest value. The
 * When column takes its width from `whenShapes`.
 */
export function widestRow(rows: readonly BrowserRow[]): BrowserRow | null {
  if (rows.length === 0) return null;
  const stats = (tool: UsageTool) => rows.flatMap((r) => r[tool] ?? []);
  const totals = rows.map((r) => r.total);
  return {
    ...rows[0],
    activeTotal: rows.some(r => r.activeTotal) ? widestTime(rows.flatMap(r => r.activeTotal ?? [])) : undefined,
    dex: widestStat(stats('dex')),
    league: widestStat(stats('league')),
    picker: widestStat(stats('picker')),
    total: {
      sessions: Math.max(...totals.map((t) => t.sessions)),
      totalMs: longest(totals, (t) => fmtChipDuration(t.totalMs).length).totalMs,
    },
  };
}
