import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  redis,
  requireAdmin,
  firstQueryValue,
  parseRecord,
  CLIENTS_KEY,
  type ClientRecord,
} from './_shared.js';
import { EVOLUTION_CHAIN_BY_ID } from './_chains.js';

/** Distinct evolution lines represented by a set of ids (unknown ids count as
 *  their own line). Mirrors the client's countEvoLines so server-derived depth
 *  matches what the beacon reports. */
function countEvoLines(ids: number[]): number {
  const chains = new Set<number>();
  for (const id of ids) chains.add(EVOLUTION_CHAIN_BY_ID[id] ?? -id);
  return chains.size;
}

const DAY = 86_400_000;
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local day-of-week (0=Sun) and hour (0–23) for a record, derived from its
 *  timezone + last-activity timestamp. Prefers stored localDow/localHour when
 *  present, but falls back to deriving from lastTs+tz — which back-populates
 *  every legacy record that predates those fields. */
function localSlot(r: ClientRecord): { dow: number; hour: number } | null {
  if (typeof r.localDow === 'number' && typeof r.localHour === 'number') {
    return { dow: r.localDow % 7, hour: r.localHour % 24 };
  }
  if (!r.lastTs) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: r.tz || 'UTC',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(r.lastTs);
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hrStr = parts.find((p) => p.type === 'hour')?.value ?? '';
    const dow = DOW_NAMES.indexOf(wd);
    const hour = parseInt(hrStr, 10) % 24;
    if (dow < 0 || !Number.isFinite(hour)) return null;
    return { dow, hour };
  } catch {
    return null;
  }
}

// Per-minute time-before-churn bars up to this cap; everything longer (incl.
// returning users who came back another day) falls in the final overflow bar.
/** Ranked entries (desc) including only those with count >= min. No hard cap,
 *  so evolution lines are never truncated mid-family. */
function rankedAtLeast(counts: Record<string, number>, min: number): [string, number][] {
  return Object.entries(counts)
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1]);
}

/** Self-scaling qualification threshold: the MEAN per-Pokemon count. For a
 *  long-tailed distribution the head pulls the mean above the median, so
 *  "appears in >= the average number of dexes" naturally cuts the sparse tail
 *  without a hand-picked constant. Floored at 2 (a single-dex Pokemon is tail
 *  by definition) and rounded up. */
function tailThreshold(counts: Record<string, number>): number {
  const v = Object.values(counts);
  if (v.length === 0) return 2;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.max(2, Math.ceil(mean));
}

/** Apply rankedAtLeast within each section, dropping sections left empty. */
function rankBySection(
  bySection: Record<string, Record<string, number>>,
  min: number,
): Record<string, [string, number][]> {
  const out: Record<string, [string, number][]> = {};
  for (const [sid, counts] of Object.entries(bySection)) {
    const ranked = rankedAtLeast(counts, min);
    if (ranked.length > 0) out[sid] = ranked;
  }
  return out;
}

/** Value at quantile q (0..1) of an ascending-sorted array. */
function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length));
  return sortedAsc[i];
}

/** Fraction of values >= t (the survival function), via binary search. */
function survivalAt(sortedAsc: number[], t: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return (n - lo) / n;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!(await requireAdmin(req, res))) return;

    const rawLimit = parseInt(firstQueryValue(req.query.limit as string | string[] | undefined), 10);
    const rawOffset = parseInt(firstQueryValue(req.query.offset as string | string[] | undefined), 10);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 50 : rawLimit, 1), 500);
    const offset = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);

    const all = (await redis.hgetall(CLIENTS_KEY)) as Record<string, unknown> | null;
    const records: ClientRecord[] = Object.values(all ?? {})
      .map(parseRecord)
      .filter((r): r is ClientRecord => r !== null);

    // Funnel event counters (from api/event.ts) — top-of-funnel signals that
    // fire with zero placements, so they live outside the per-user records.
    const funnelRaw = (await redis.hgetall('funnel')) as Record<string, unknown> | null;
    const funnelEvents: Record<string, number> = {};
    for (const [k, v] of Object.entries(funnelRaw ?? {})) {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (Number.isFinite(n)) funnelEvents[k] = n;
    }

    // Newest-active first.
    records.sort((a, b) => b.lastTs - a.lastTs);

    const now = Date.now();
    const countries: Record<string, number> = {};
    const devices: Record<string, number> = {};
    const osCounts: Record<string, number> = {};
    const hours = new Array<number>(24).fill(0);
    // 7 (day-of-week, 0=Sun) × 24 (hour) heatmap of users' local build times.
    const heatmap: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    // Raw per-user values; we build survival (drop-off) curves from these.
    const longestSecs: number[] = []; // each user's longest session, seconds
    const firstSecs: number[] = []; // each user's first session, seconds
    const allSecs: number[] = []; // every session pooled, seconds (per-session)
    // Depth (evolution-line) drop-off, four bases:
    //  total   = peak lines ever reached (overall breadth) — the default view.
    //  first   = lines net-added in the user's FIRST session.
    //  longest = lines net-added in the user's longest-DURATION session.
    //  all     = lines net-added per session, pooled (one point per session).
    // Per-session contribution = diff of cumulative end-depths, floored at 0
    // (a session that net-pruned counts as 0 added, not negative).
    // Two metrics, same four bases: evolution lines and raw Pokemon count.
    const lineVals = { total: [] as number[], first: [] as number[], longest: [] as number[], all: [] as number[] };
    const monVals = { total: [] as number[], first: [] as number[], longest: [] as number[], all: [] as number[] };
    const picksFinal: Record<string, number> = {}; // one vote per user's final dex
    const droppedCounts: Record<string, number> = {}; // ever placed but not in final dex
    // Same, but split by the section the user actually placed each Pokemon in
    // (sectionId -> { pokemonId -> count }). Forward-only; only records with
    // section placement contribute.
    const picksBySection: Record<string, Record<string, number>> = {};
    const droppedBySection: Record<string, Record<string, number>> = {};
    const bump = (m: Record<string, Record<string, number>>, sid: string, id: number) => {
      (m[sid] ??= {})[id] = (m[sid][id] ?? 0) + 1;
    };

    let completed = 0;
    let exported = 0;
    let returning = 0;
    let activeLast7 = 0;
    let multiSession = 0; // users with 2+ sessions (why the bases can differ)
    // Compact per-user cohort samples for the pre/post date comparison: one
    // tuple per user [firstTs, peakMon, peakLines, completed(0/1), exported(0/1)].
    // firstTs + peakMon predate onboarding, so the whole history is comparable.
    const cohort: [number, number, number, 0 | 1, 0 | 1][] = [];
    // Tally the View settings exporters actually used (forward-only — only
    // exports captured since settings-tracking shipped contribute).
    const exportSettingsAgg = {
      tracked: 0,
      outlines: 0,
      groupSpecial: 0,
      showStats: 0,
      sorts: {} as Record<string, number>,
    };

    for (const r of records) {
      // Session durations. Prefer the per-session list; fall back to the
      // first→last span (as a single session) for legacy records.
      const sessSecs =
        r.sessionMs && r.sessionMs.length > 0
          ? r.sessionMs.map((ms) => Math.round(ms / 1000))
          : [Math.round(Math.max(0, r.lastTs - r.firstTs) / 1000)];
      longestSecs.push(Math.max(...sessSecs));
      firstSecs.push(sessSecs[0]);
      for (const s of sessSecs) allSecs.push(s);
      // Index of this user's longest-DURATION session (aligns with the time
      // chart's "longest"); used to pick that session's build contribution.
      let li = 0;
      for (let i = 1; i < sessSecs.length; i++) if (sessSecs[i] > sessSecs[li]) li = i;

      // Per-session END sizes (cumulative) for each metric. Prefer stored evo-
      // line end depths; otherwise BACK-POPULATE from sessionLog (each entry has
      // that session's ids). Pokemon count comes straight from those ids.
      const logCounts = r.sessionLog?.map((s) => countEvoLines(s.ids ?? []));
      const lineEnds =
        r.sessionDepth && r.sessionDepth.length > 0 ? r.sessionDepth : (logCounts ?? [r.maxDepth]);
      const monEnds = r.sessionLog?.map((s) => (s.ids ?? []).length) ?? [r.latestIds?.length ?? 0];

      // total = peak size ever; first/longest/all = size ADDED per session
      // (diff of cumulative ends, floored at 0), keyed to the same longest idx.
      const fill = (target: typeof lineVals, ends: number[]) => {
        const added = ends.map((d, i) => Math.max(0, i === 0 ? d : d - ends[i - 1]));
        target.total.push(Math.max(...ends));
        target.first.push(added[0]);
        target.longest.push(added[Math.min(li, added.length - 1)]);
        for (const a of added) target.all.push(a);
      };
      fill(lineVals, lineEnds);
      fill(monVals, monEnds);
      if (Math.max(lineEnds.length, monEnds.length) >= 2) multiSession += 1;

      // Cohort sample for the pre/post date slider. Peak raw-Pokemon count (the
      // milestone threshold basis, 25/100/151) and peak evo lines, both derived
      // from history so pre-onboarding users are included.
      const peakMon = Math.max(0, ...monEnds);
      const peakLines = Math.max(0, ...lineEnds);
      cohort.push([r.firstTs, peakMon, peakLines, r.completed ? 1 : 0, r.exported ? 1 : 0]);

      if (r.country) countries[r.country] = (countries[r.country] ?? 0) + 1;
      if (r.device) devices[r.device] = (devices[r.device] ?? 0) + 1;
      if (r.os) osCounts[r.os] = (osCounts[r.os] ?? 0) + 1;
      // Derive local day+hour from tz+lastTs (back-populates legacy records).
      const slot = localSlot(r);
      if (slot) {
        hours[slot.hour] += 1;
        heatmap[slot.dow][slot.hour] += 1;
      }

      // Popularity across every user's final/current dex (one vote each), so it
      // reflects everyone — not just the few who finish a full 151.
      for (const id of r.latestIds ?? []) picksFinal[id] = (picksFinal[id] ?? 0) + 1;
      if (r.completed) completed += 1;

      // Adjustment signal: placed at some point but not kept in the final dex.
      const kept = new Set(r.latestIds ?? []);
      for (const id of r.everIds ?? []) {
        if (!kept.has(id)) droppedCounts[id] = (droppedCounts[id] ?? 0) + 1;
      }

      // Per-section breakdowns (forward-only; needs captured placement).
      if (r.latestSections) {
        for (const [sid, sIds] of Object.entries(r.latestSections)) {
          for (const id of sIds) bump(picksBySection, sid, id);
        }
      }
      if (r.everSections) {
        for (const [sid, everIds] of Object.entries(r.everSections)) {
          const keptHere = new Set(r.latestSections?.[sid] ?? []);
          for (const id of everIds) if (!keptHere.has(id)) bump(droppedBySection, sid, id);
        }
      }
      if (r.exported) exported += 1;
      if (r.exportSettings) {
        exportSettingsAgg.tracked += 1;
        if (r.exportSettings.outlines) exportSettingsAgg.outlines += 1;
        if (r.exportSettings.groupSpecial) exportSettingsAgg.groupSpecial += 1;
        if (r.exportSettings.showStats) exportSettingsAgg.showStats += 1;
        const s = r.exportSettings.sort;
        exportSettingsAgg.sorts[s] = (exportSettingsAgg.sorts[s] ?? 0) + 1;
      }
      if (r.lastTs - r.firstTs >= DAY) returning += 1;
      if (now - r.lastTs <= 7 * DAY) activeLast7 += 1;
    }

    // --- Survival (drop-off) curves -------------------------------------
    // S(t) = fraction of sessions still active at t. The steepest part of the
    // curve is where people churn — that's where to intervene. We sample the
    // x-axis up to the 95th percentile (so the long tail doesn't flatten the
    // interesting region) at a fixed number of points.

    // Build a time survival curve + percentile stats from a set of durations.
    // Sampled fine-grained where it matters — every 30s for the first 10 min,
    // then every 60s out to the 95th percentile (min 60s of range).
    const buildTimeCurve = (secsRaw: number[]) => {
      const secs = secsRaw.slice().sort((a, b) => a - b);
      const tMax = Math.max(60, quantile(secs, 0.95));
      const ticks: number[] = [];
      for (let t = 0; t <= Math.min(tMax, 600); t += 30) ticks.push(t);
      for (let t = 660; t <= tMax; t += 60) ticks.push(t);
      if (ticks[ticks.length - 1] !== tMax) ticks.push(tMax);
      return {
        survival: ticks.map((t) => ({ t, s: survivalAt(secs, t) })),
        stats: { p50: quantile(secs, 0.5), p75: quantile(secs, 0.75), p90: quantile(secs, 0.9) },
        n: secs.length,
      };
    };
    // Three bases the admin can toggle between.
    const timeCurves = {
      longest: buildTimeCurve(longestSecs),
      first: buildTimeCurve(firstSecs),
      all: buildTimeCurve(allSecs),
    };
    // Back-compat default surface (longest session).
    const timeSurvival = timeCurves.longest.survival;
    const timeStats = timeCurves.longest.stats;

    // Depth survival: x in evolution lines, 0..maxObserved.
    const buildDepthCurve = (vals: number[]) => {
      const v = vals.slice().sort((a, b) => a - b);
      const dMax = Math.max(1, v[v.length - 1] ?? 1);
      const survival: { t: number; s: number }[] = [];
      for (let d = 0; d <= dMax; d++) survival.push({ t: d, s: survivalAt(v, d) });
      return {
        survival,
        stats: { p50: quantile(v, 0.5), p75: quantile(v, 0.75), p90: quantile(v, 0.9) },
        n: v.length,
      };
    };
    const curvesFor = (v: typeof lineVals) => ({
      total: buildDepthCurve(v.total),
      first: buildDepthCurve(v.first),
      longest: buildDepthCurve(v.longest),
      all: buildDepthCurve(v.all),
    });
    // Both metrics, four bases each. lineCurves = evolution lines (legacy
    // depthCurves), monCurves = raw Pokemon count (new default).
    const lineCurves = curvesFor(lineVals);
    const monCurves = curvesFor(monVals);
    const depthCurves = lineCurves; // back-compat name (evolution lines)
    // Back-compat flat surface (total lines ever reached).
    const depthSurvival = lineCurves.total.survival;
    const depthStats = lineCurves.total.stats;

    const totalUsers = records.length;
    const page = records.slice(offset, offset + limit);

    // Self-scaling qualification thresholds: median per-Pokemon count per list.
    const popularMin = tailThreshold(picksFinal);
    const droppedMin = tailThreshold(droppedCounts);

    // Private data — never cache.
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({
      totalUsers,
      offset,
      limit,
      funnel: { users: totalUsers, completed, exported },
      funnelEvents,
      cohort,
      exportSettings: exportSettingsAgg,
      retention: { returning, activeLast7, newUsers: totalUsers - returning },
      multiSession,
      timeSurvival,
      timeStats,
      timeCurves,
      depthSurvival,
      depthStats,
      depthCurves,
      lineCurves,
      monCurves,
      countries,
      devices,
      os: osCounts,
      hours,
      heatmap,
      // Full ranked lists; the admin UI previews the top N and expands the rest.
      // Qualification threshold = the median per-Pokemon count for that list, so
      // it self-scales with the data. No cap, so evo lines aren't cut off.
      popularFinal: rankedAtLeast(picksFinal, popularMin),
      mostDropped: rankedAtLeast(droppedCounts, droppedMin),
      popularMin,
      droppedMin,
      // Same, split by the section users actually placed them in (forward-only).
      popularBySection: rankBySection(picksBySection, popularMin),
      droppedBySection: rankBySection(droppedBySection, droppedMin),
      picksBySectionAll: rankBySection(picksBySection, 1),
      records: page,
    });
  } catch (err) {
    console.error('Submissions error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
