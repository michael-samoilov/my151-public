import type { AttentionRecording } from './_attention.js';
import { DAY_MS, dayStart } from './_aggregate.js';

// A browser becomes a user of a tool once it places a Pokémon there, gives the
// page real input, or keeps the page on screen for 10 seconds. A Picker user
// must also have placed a Pokémon, because the server saves only those Picker
// visitors (api/favorites.ts). Attention time comes only from trusted input
// events in the foreground, and on-screen time only from a visible, focused
// page (src/lib/activeAttention.ts). A record with none of these is a page
// load: a bounce, a crawler, or a bot. The admin counts keep page loads apart
// instead of counting them as users.

const touched = (attention: AttentionRecording | undefined) => (attention?.totalMs ?? 0) > 0;

export const engagedDex = (r: { latestIds?: number[]; everIds?: number[]; attention?: AttentionRecording }) =>
  (r.latestIds?.length ?? 0) > 0 || (r.everIds?.length ?? 0) > 0 || touched(r.attention);

export const engagedLeague = (r: { maxSeats?: number; maxCards?: number; attention?: AttentionRecording }) =>
  (r.maxSeats ?? 0) > 0 || (r.maxCards ?? 0) > 0 || touched(r.attention);

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

/** Input a browser must give in a UTC day, without a pick change, to count as
 *  active that day. Seen days implement Google Analytics' rule, 10 seconds on
 *  screen with no input needed. This input rule covers tabs opened before seen
 *  days shipped, and the days before that release, which have no seen days. */
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
  seenDays?: number[];
  attention?: AttentionRecording;
}

/**
 * The UTC days a tool record counts as an active user. A day counts when:
 *
 * - a session changed its picks that day,
 * - one page load stayed on screen 10 seconds or more that day (`seenDays`), or
 * - the browser gave ENGAGED_INPUT_MS of input that day.
 *
 * `picksOf` gives a session's picks as a comparable key, '' when it holds none.
 * A day whose input was not recorded (before input timing, or among retired
 * segments) replaces the input rule with the earlier one: it counts when the
 * record ever placed a Pokémon or saw input, which `engagedEver` reports.
 */
export function engagedDays<E extends { ts: number }>(r: ActivityRecord<E>, picksOf: (entry: E) => string, engagedEver: boolean): number[] {
  const log = r.sessionLog ?? [];
  const earliest = new Map<number, number>();
  for (const ts of log.length ? log.map((e) => e.ts) : [r.firstTs, r.lastTs]) {
    const day = dayStart(ts);
    earliest.set(day, Math.min(earliest.get(day) ?? Infinity, ts));
  }
  for (const day of [...(r.activeDays ?? []), ...(r.seenDays ?? [])]) if (!earliest.has(day)) earliest.set(day, day);

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
  const seen = new Set(r.seenDays);
  return [...earliest]
    .filter(([day, first]) => changed.has(day) || seen.has(day) || (first < measuredFrom ? engagedEver : inputOn(day) >= ENGAGED_INPUT_MS))
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

type DexActivity = ActivityRecord<{ ts: number } & Parameters<typeof dexPickKey>[0]> & Parameters<typeof engagedDex>[0];
type LeagueActivity = ActivityRecord<{ ts: number } & Parameters<typeof leaguePickKey>[0]> & Parameters<typeof engagedLeague>[0];
type PickerActivity = ActivityRecord<{ ts: number } & Parameters<typeof pickerPickKey>[0]> & { maxFilled?: number };

export const dexEngagedDays = (r: DexActivity) => engagedDays(r, dexPickKey, engagedDex(r));
export const leagueEngagedDays = (r: LeagueActivity) => engagedDays(r, leaguePickKey, engagedLeague(r));
// A Picker record that never placed a Pokémon is a bounce, whatever its input or seen days.
export const pickerEngagedDays = (r: PickerActivity) => ((r.maxFilled ?? 0) > 0 ? engagedDays(r, pickerPickKey, true) : []);
