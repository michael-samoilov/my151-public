import type { AttentionRecording } from './_attention.js';
import { DAY_MS, dayStart } from './_aggregate.js';

// A browser becomes a user of a tool once it places a Pokémon there or gives
// the page real input. Attention time comes only from trusted input events in
// the foreground (src/lib/activeAttention.ts). A record with neither is a page
// load: a bounce, a crawler, or a bot. The admin counts keep page loads apart
// instead of counting them as users.

const touched = (attention: AttentionRecording | undefined) => (attention?.totalMs ?? 0) > 0;

export const engagedDex = (r: { latestIds?: number[]; everIds?: number[]; attention?: AttentionRecording }) =>
  (r.latestIds?.length ?? 0) > 0 || (r.everIds?.length ?? 0) > 0 || touched(r.attention);

export const engagedLeague = (r: { maxSeats?: number; maxCards?: number; attention?: AttentionRecording }) =>
  (r.maxSeats ?? 0) > 0 || (r.maxCards ?? 0) > 0 || touched(r.attention);

export const engagedPicker = (r: { maxFilled?: number; attention?: AttentionRecording }) =>
  (r.maxFilled ?? 0) > 0 || touched(r.attention);

/** Why a browser looks automated. A reason is a lead for the owner to review,
 *  not proof, so it never removes a browser from a count by itself. */
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
  /** Foreground time when measured, else session time. */
  activeMs: number;
}

/** A burst is BURST_MIN or more new browsers with the same location, device,
 *  system, browser, and language, first seen within BURST_WINDOW_MS, each
 *  active under BURST_MAX_ACTIVE_MS. Scripts open a fresh browser per run;
 *  people rarely arrive that way. */
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
    // Every real browser sends Accept-Language.
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

/** Input a browser must give in a UTC day, without a pick change, to count as
 *  active that day. It matches the 10-second engaged session of Google
 *  Analytics: a shorter visit is a bounce. */
export const ENGAGED_INPUT_MS = 10_000;

/** Production clients sent input timing from 2026-10-10 19:31 UTC, so from the
 *  next UTC day a missing recording means no input. Only a tab opened before
 *  that release still runs code without it, and its pick changes still count. */
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
  attention?: AttentionRecording;
}

/**
 * The UTC days a tool record counts as an active user: days a session changed
 * its picks, or days with ENGAGED_INPUT_MS of input. `picksOf` gives a
 * session's picks as a comparable key, '' when it holds none. A day whose input
 * was not recorded (before input timing, or among retired segments) keeps the
 * earlier rule: it counts when the record ever placed a Pokémon or saw input,
 * which `engagedEver` reports.
 */
export function engagedDays<E extends { ts: number }>(r: ActivityRecord<E>, picksOf: (entry: E) => string, engagedEver: boolean): number[] {
  const log = r.sessionLog ?? [];
  const earliest = new Map<number, number>();
  for (const ts of log.length ? log.map((e) => e.ts) : [r.firstTs, r.lastTs]) {
    const day = dayStart(ts);
    earliest.set(day, Math.min(earliest.get(day) ?? Infinity, ts));
  }
  for (const day of r.activeDays ?? []) if (!earliest.has(day)) earliest.set(day, day);

  const changed = new Set<number>();
  // A truncated log's first session may repeat an evicted one, so it proves no change.
  const complete = (r.sessions ?? log.length) <= log.length;
  log.forEach((entry, i) => {
    const picks = picksOf(entry);
    const before = i > 0 ? picksOf(log[i - 1]) : complete ? '' : picks;
    if (picks !== before) changed.add(dayStart(entry.ts));
  });

  const attention = r.attention;
  const measuredFrom = Math.max(Math.min(attention?.coverageFrom ?? Infinity, INPUT_TIMING_SINCE), attention?.retiredThrough ?? -Infinity);
  const inputOn = (day: number) => (attention ? inputMsOn(attention, day) : 0);
  return [...earliest]
    .filter(([day, first]) => changed.has(day) || (first < measuredFrom ? engagedEver : inputOn(day) >= ENGAGED_INPUT_MS))
    .map(([day]) => day)
    .sort((a, b) => a - b);
}

/** A browser record is an active user once it has an engaged day. */
export const isActiveUser = (r: { engagedDays?: number[] }) => (r.engagedDays?.length ?? 0) > 0;

export const dexPickKey = (entry: { ids?: number[]; sections?: Record<string, number[]> }) =>
  entry.ids?.length ? JSON.stringify(entry.sections ?? entry.ids) : '';

// Sessions logged before these fields existed carry no picks to compare.
export const leaguePickKey = (entry: { summary?: { cards: number; seats: number }; cards?: unknown }) =>
  entry.summary?.cards || entry.summary?.seats ? JSON.stringify(entry.cards ?? entry.summary) : '';

export const pickerPickKey = (entry: { snapshot?: { fills: Record<string, number> } }) =>
  Object.keys(entry.snapshot?.fills ?? {}).length ? JSON.stringify(entry.snapshot!.fills) : '';
