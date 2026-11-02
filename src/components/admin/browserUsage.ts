import type { BrowserRow, BrowserTime, ToolStat } from '../../../api/_dashboard';
import { fmtChipDuration, formatWhen } from './userPreview';

export type UsageTool = 'dex' | 'league' | 'picker';
export type UsageSource = 'active' | 'legacy';
export type CardTime = BrowserTime & {missing?: boolean; alsoMissing?: true};

export type ToolCell = { tool: UsageTool; used: boolean; count: number; exported: boolean; sessions: number; totalMs: number; missing?: boolean; partial?: true; alsoMissing?: true };

const TOOLS: readonly UsageTool[] = ['dex', 'league', 'picker'];

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

const progressLength = (s: ToolStat) => String(s.count).length + (s.exported ? 2 : 0);

type SizerStat = ToolStat & { active?: CardTime };
type SizerRow = BrowserRow & { dex: SizerStat; league: SizerStat; picker: SizerStat; activeTotal?: CardTime };

function widestActive(times: readonly (BrowserTime | undefined)[]): CardTime | undefined {
  const measured = times.filter((t): t is BrowserTime => !!t);
  if (!measured.length) return undefined;
  return {...widestTime(measured), ...(measured.length < times.length ? {alsoMissing: true as const} : {})};
}

function widestStat(stats: readonly ToolStat[]): SizerStat {
  if (stats.length === 0) return { count: 0, sessions: 0, totalMs: 0 };
  const progress = longest(stats, progressLength);
  return {
    count: progress.count,
    ...(progress.exported ? { exported: true as const } : {}),
    sessions: Math.max(...stats.map((s) => s.sessions)),
    totalMs: longest(stats, (s) => fmtChipDuration(s.totalMs).length).totalMs,
    ...(stats.some(s => s.active) ? {active: widestActive(stats.map(s => s.active))} : {}),
  };
}

function widestTime(times: readonly BrowserTime[]): BrowserTime {
  return {sessions: Math.max(...times.map(t => t.sessions)),
    totalMs: longest(times, t => fmtChipDuration(t.totalMs).length).totalMs,
    ...(times.some(t => t.partial) ? {partial: true as const} : {})};
}

const shapes = new WeakMap<BrowserRow, string>();
function whenShape(row: BrowserRow): string {
  let shape = shapes.get(row);
  if (shape === undefined) {
    shape = formatWhen(row.lastTs, row.tz).replace(/\d/g, '0');
    shapes.set(row, shape);
  }
  return shape;
}

export function whenShapes(rows: readonly BrowserRow[]): string[] {
  return [...new Set(rows.map(whenShape))];
}

export function widestRow(rows: readonly BrowserRow[]): SizerRow | null {
  if (rows.length === 0) return null;
  const stats = (tool: UsageTool) => rows.flatMap((r) => r[tool] ?? []);
  const totals = rows.map((r) => r.total);
  return {
    ...rows[0],
    activeTotal: widestActive(rows.map(r => r.activeTotal)),
    dex: widestStat(stats('dex')),
    league: widestStat(stats('league')),
    picker: widestStat(stats('picker')),
    total: {
      sessions: Math.max(...totals.map((t) => t.sessions)),
      totalMs: longest(totals, (t) => fmtChipDuration(t.totalMs).length).totalMs,
    },
  };
}
