import type { AttentionRecording } from './_attention.js';
import { DAY_MS, dayStart } from './_aggregate.js';

const touched = (attention: AttentionRecording | undefined) => (attention?.totalMs ?? 0) > 0;

export const engagedDex = (r: { latestIds?: number[]; everIds?: number[]; attention?: AttentionRecording }) =>
  (r.latestIds?.length ?? 0) > 0 || (r.everIds?.length ?? 0) > 0 || touched(r.attention);

export const engagedLeague = (r: { maxSeats?: number; maxCards?: number; attention?: AttentionRecording }) =>
  (r.maxSeats ?? 0) > 0 || (r.maxCards ?? 0) > 0 || touched(r.attention);

export type SuspectReason = 'burst' | 'no-language';

export interface SuspectInput {
  cid: string;
  firstTs: number;
  country?: string;
  region?: string;
  device?: string;
  os?: string;
  browser?: string;
  lang?: string;
  activeMs: number;
}

export const BURST_MIN = 3;
export const BURST_WINDOW_MS = 10 * 60_000;
export const BURST_MAX_ACTIVE_MS = 30_000;

export function suspectReasons(browsers: SuspectInput[]): Map<string, SuspectReason[]> {
  const out = new Map<string, SuspectReason[]>();
  const add = (cid: string, reason: SuspectReason) => {
    const list = out.get(cid) ?? [];
    if (!list.includes(reason)) list.push(reason);
    out.set(cid, list);
  };
  const groups = new Map<string, SuspectInput[]>();
  for (const b of browsers) {
    // platform: Every real browser sends an Accept-Language header.
    if (!b.lang) add(b.cid, 'no-language');
    if (b.activeMs >= BURST_MAX_ACTIVE_MS) continue;
    const key = [b.country, b.region, b.device, b.os, b.browser, b.lang].join('|');
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.firstTs - b.firstTs);
    let from = 0;
    for (let to = 0; to < group.length; to++) {
      while (group[to].firstTs - group[from].firstTs > BURST_WINDOW_MS) from++;
      if (to - from + 1 >= BURST_MIN) for (let i = from; i <= to; i++) add(group[i].cid, 'burst');
    }
  }
  return out;
}

export const ENGAGED_INPUT_MS = 10_000;

export const INPUT_TIMING_SINCE = Date.UTC(2026, 9, 11);

function inputMsOn(attention: AttentionRecording, day: number): number {
  const until = day + DAY_MS;
  let end = day, total = 0;
  for (const s of [...attention.segments].sort((a, b) => a.start - b.start)) {
    total += Math.max(0, Math.min(s.end, until) - Math.max(s.start, end));
    end = Math.max(end, s.end);
  }
  return total;
}

interface ActivityRecord<E extends { ts: number }> {
  firstTs: number;
  lastTs: number;
  sessions?: number;
  sessionLog?: E[];
  activeDays?: number[];
  seenDays?: number[];
  attention?: AttentionRecording;
}

export function engagedDays<E extends { ts: number }>(r: ActivityRecord<E>, picksOf: (entry: E) => string, engagedEver: boolean): number[] {
  const log = r.sessionLog ?? [];
  const earliest = new Map<number, number>();
  for (const ts of log.length ? log.map((e) => e.ts) : [r.firstTs, r.lastTs]) {
    const day = dayStart(ts);
    earliest.set(day, Math.min(earliest.get(day) ?? Infinity, ts));
  }
  for (const day of [...(r.activeDays ?? []), ...(r.seenDays ?? [])]) if (!earliest.has(day)) earliest.set(day, day);

  const changed = new Set<number>();
  const complete = (r.sessions ?? log.length) <= log.length;
  log.forEach((entry, i) => {
    const picks = picksOf(entry);
    const before = i > 0 ? picksOf(log[i - 1]) : complete ? '' : picks;
    if (picks !== before) changed.add(dayStart(entry.ts));
  });

  const attention = r.attention;
  const measuredFrom = Math.max(Math.min(attention?.coverageFrom ?? Infinity, INPUT_TIMING_SINCE), attention?.retiredThrough ?? -Infinity);
  const inputOn = (day: number) => (attention ? inputMsOn(attention, day) : 0);
  const seen = new Set(r.seenDays);
  return [...earliest]
    .filter(([day, first]) => changed.has(day) || seen.has(day) || (first < measuredFrom ? engagedEver : inputOn(day) >= ENGAGED_INPUT_MS))
    .map(([day]) => day)
    .sort((a, b) => a - b);
}

export const isActiveUser = (r: { engagedDays?: number[] }) => (r.engagedDays?.length ?? 0) > 0;

export const dexPickKey = (entry: { ids?: number[]; sections?: Record<string, number[]> }) =>
  entry.ids?.length ? JSON.stringify(entry.sections ?? entry.ids) : '';

export const leaguePickKey = (entry: { summary?: { cards: number; seats: number }; cards?: unknown }) =>
  entry.summary?.cards || entry.summary?.seats ? JSON.stringify(entry.cards ?? entry.summary) : '';

export const pickerPickKey = (entry: { snapshot?: { fills: Record<string, number> } }) =>
  Object.keys(entry.snapshot?.fills ?? {}).length ? JSON.stringify(entry.snapshot!.fills) : '';

type DexActivity = ActivityRecord<{ ts: number } & Parameters<typeof dexPickKey>[0]> & Parameters<typeof engagedDex>[0];
type LeagueActivity = ActivityRecord<{ ts: number } & Parameters<typeof leaguePickKey>[0]> & Parameters<typeof engagedLeague>[0];
type PickerActivity = ActivityRecord<{ ts: number } & Parameters<typeof pickerPickKey>[0]> & { maxFilled?: number };

export const dexEngagedDays = (r: DexActivity) => engagedDays(r, dexPickKey, engagedDex(r));
export const leagueEngagedDays = (r: LeagueActivity) => engagedDays(r, leaguePickKey, engagedLeague(r));
export const pickerEngagedDays = (r: PickerActivity) => ((r.maxFilled ?? 0) > 0 ? engagedDays(r, pickerPickKey, true) : []);
