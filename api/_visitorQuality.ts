import type { AttentionRecording } from './_attention.js';

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
