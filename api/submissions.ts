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
import { LEAGUE_CLIENTS_KEY, parseLeagueRecord, type LeagueRecord } from './_leagueRecord.js';
import {
  DAY_MS,
  aggregate,
  buildDepthCurve,
  dayStart,
  mergeByCid,
  quantile,
  sessionSeconds,
  type Aggregates,
} from './_aggregate.js';

/** Distinct evolution lines represented by a set of ids (unknown ids count as
 *  their own line). Mirrors the client's countEvoLines so server-derived depth
 *  matches what the beacon reports. */
function countEvoLines(ids: number[]): number {
  const chains = new Set<number>();
  for (const id of ids) chains.add(EVOLUTION_CHAIN_BY_ID[id] ?? -id);
  return chains.size;
}

// Date the onboarding suite (intro card + milestone progress bar + funnel
// beacons) shipped to prod — deploy-branch merge on 2026-07-08 (commit
// f5f4e55). The pre/post cohort slider defaults here. Update if it's re-dated.
const ONBOARDING_LAUNCH_TS = Date.UTC(2026, 6, 8); // 2026-07-08 UTC (month is 0-based)

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

/** UTC Monday (ms) of the week a timestamp falls in. Weeks, not days, because
 *  a per-day crossover rate on this traffic is mostly noise. */
function weekStart(ts: number): number {
  const day = dayStart(ts);
  const dow = new Date(day).getUTCDay(); // 0 = Sunday
  return day - ((dow + 6) % 7) * DAY_MS;
}

/** Where a browser's two tools sit relative to each other. `same-day` covers
 *  the common case of finding the second tool from the first one's page. */
export type ToolOrder = 'dex-first' | 'league-first' | 'same-day';

function toolOrder(dexFirstTs: number, leagueFirstTs: number): ToolOrder {
  const gap = leagueFirstTs - dexFirstTs;
  if (Math.abs(gap) < DAY_MS) return 'same-day';
  return gap > 0 ? 'dex-first' : 'league-first';
}

/** One browser's league record, trimmed to what the per-user card shows. */
interface LeagueUser {
  firstTs: number;
  firstAt: string;
  lastTs: number;
  lastAt: string;
  sessions: number;
  maxSessionMs: number;
  maxCards: number;
  maxSeats: number;
  latest: LeagueRecord['latest'];
  exportsCard: number;
  exportsLeague: number;
  exportedCardAt?: string;
  exportedLeagueAt?: string;
  /** Each session's end state, so the card can diff visit to visit. */
  sessionLog: LeagueRecord['sessionLog'];
  order: ToolOrder;
  /** Signed days from the first dex beacon to the first league one. */
  gapDays: number;
}

function leagueUser(r: LeagueRecord, dexFirstTs: number): LeagueUser {
  return {
    firstTs: r.firstTs,
    firstAt: r.firstAt,
    lastTs: r.lastTs,
    lastAt: r.lastAt,
    sessions: r.sessions,
    maxSessionMs: r.maxSessionMs,
    maxCards: r.maxCards,
    maxSeats: r.maxSeats,
    latest: r.latest,
    exportsCard: r.exportsCard,
    exportsLeague: r.exportsLeague,
    exportedCardAt: r.exportedCardAt,
    exportedLeagueAt: r.exportedLeagueAt,
    sessionLog: r.sessionLog,
    order: toolOrder(dexFirstTs, r.firstTs),
    gapDays: Math.round(((r.firstTs - dexFirstTs) / DAY_MS) * 10) / 10,
  };
}

export interface Journeys {
  /** Browsers with a record in both stores. */
  both: number;
  dexFirst: number;
  leagueFirst: number;
  sameDay: number;
  /** Days between the two first beacons, ignoring direction. */
  medianGapDays: number;
  p75GapDays: number;
  /** Per UTC week: how many browsers each tool gained, and how many of them
   *  opened the other tool within 7 days of that first beacon. */
  weekly: {
    week: number;
    newDex: number;
    dexToLeague7d: number;
    newLeague: number;
    leagueToDex7d: number;
  }[];
}

/**
 * The number the launch was for: does one tool feed the other?
 *
 * Read from `firstTs` in both stores, so it reaches back to each tool's first
 * beacon. "Within 7 days" is deliberately one-directional — a browser counts
 * as converted only when the second tool's first beacon comes AFTER the
 * first tool's and inside the window. Someone who already used both before
 * the week in question is not a conversion.
 */
function crossToolJourneys(dexFirst: Map<string, number>, leagueFirst: Map<string, number>): Journeys {
  const gaps: number[] = [];
  let dexFirstCount = 0;
  let leagueFirstCount = 0;
  let sameDay = 0;
  for (const [cid, dts] of dexFirst) {
    const lts = leagueFirst.get(cid);
    if (lts === undefined) continue;
    gaps.push(Math.abs(lts - dts) / DAY_MS);
    const order = toolOrder(dts, lts);
    if (order === 'same-day') sameDay += 1;
    else if (order === 'dex-first') dexFirstCount += 1;
    else leagueFirstCount += 1;
  }
  gaps.sort((a, b) => a - b);

  const weeks = new Map<number, { newDex: number; dexToLeague7d: number; newLeague: number; leagueToDex7d: number }>();
  const week = (ts: number) => {
    const k = weekStart(ts);
    let w = weeks.get(k);
    if (!w) weeks.set(k, (w = { newDex: 0, dexToLeague7d: 0, newLeague: 0, leagueToDex7d: 0 }));
    return w;
  };
  const crossed = (from: number, to: number | undefined) =>
    to !== undefined && to >= from && to - from <= 7 * DAY_MS;
  for (const [cid, dts] of dexFirst) {
    const w = week(dts);
    w.newDex += 1;
    if (crossed(dts, leagueFirst.get(cid))) w.dexToLeague7d += 1;
  }
  for (const [cid, lts] of leagueFirst) {
    const w = week(lts);
    w.newLeague += 1;
    if (crossed(lts, dexFirst.get(cid))) w.leagueToDex7d += 1;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    both: gaps.length,
    dexFirst: dexFirstCount,
    leagueFirst: leagueFirstCount,
    sameDay,
    medianGapDays: round1(quantile(gaps, 0.5)),
    p75GapDays: round1(quantile(gaps, 0.75)),
    weekly: [...weeks.entries()]
      .map(([week, v]) => ({ week, ...v }))
      .sort((a, b) => a.week - b.week),
  };
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

    const now = Date.now();
    // The gym leader maker's records, in their own hash. A person who used
    // both tools is one cid present in both, so overlap is a set
    // intersection at read time — retroactive by construction.
    const leagueAll = (await redis.hgetall(LEAGUE_CLIENTS_KEY)) as Record<string, unknown> | null;
    const leagueRecords: LeagueRecord[] = Object.values(leagueAll ?? {})
      .map(parseLeagueRecord)
      .filter((r): r is LeagueRecord => r !== null);
    const dexCids = new Set(records.map((r) => r.cid.split('::')[0]));
    const leagueCids = new Set(leagueRecords.map((r) => r.cid));
    const both = [...leagueCids].filter((c) => dexCids.has(c));
    const dexExporters = records.filter((r) => r.exported).map((r) => r.cid.split('::')[0]);
    const leagueExporters = leagueRecords.filter((r) => r.exportsCard + r.exportsLeague > 0).map((r) => r.cid);
    const tools = {
      dex: dexCids.size,
      league: leagueCids.size,
      both: both.length,
      leagueOnly: leagueCids.size - both.length,
      dexOnly: dexCids.size - both.length,
      dexExporters: dexExporters.length,
      dexExportersWhoOpenedLeague: dexExporters.filter((c) => leagueCids.has(c)).length,
      leagueExporters: leagueExporters.length,
      leagueExportersWithDex: leagueExporters.filter((c) => dexCids.has(c)).length,
    };
    // Earliest beacon per browser in each store, keyed by the bare cid so a
    // country-split dex record still matches its league record.
    const dexFirstTs = new Map<string, number>();
    for (const r of records) {
      const cid = r.cid.split('::')[0];
      dexFirstTs.set(cid, Math.min(dexFirstTs.get(cid) ?? Infinity, r.firstTs));
    }
    const leagueFirstTs = new Map(leagueRecords.map((r) => [r.cid, r.firstTs]));
    const journeys = crossToolJourneys(dexFirstTs, leagueFirstTs);

    // The league funnel, from the records: opened is a record at all (the
    // first beacon needs a seated line), then named, then exported.
    const leagueDaily: Record<number, Set<string>> = {};
    for (const r of leagueRecords) {
      for (const s of r.sessionLog) {
        const day = Math.floor(s.ts / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
        (leagueDaily[day] ??= new Set()).add(r.cid);
      }
    }
    const league = {
      users: leagueRecords.length,
      named: leagueRecords.filter((r) => r.latest.named > 0).length,
      typed: leagueRecords.filter((r) => r.latest.typed > 0).length,
      fullLeague: leagueRecords.filter((r) => r.maxCards >= 11).length,
      exportedCard: leagueRecords.filter((r) => r.exportsCard > 0).length,
      exportedLeague: leagueRecords.filter((r) => r.exportsLeague > 0).length,
      returning: leagueRecords.filter((r) => r.sessions > 1).length,
      activeLast7: leagueRecords.filter((r) => now - r.lastTs <= 7 * 24 * 60 * 60 * 1000).length,
      activity: Object.entries(leagueDaily)
        .map(([day, set]) => ({ day: Number(day), dau: set.size }))
        .sort((a, b) => a.day - b.day),
      recent: leagueRecords
        .sort((a, b) => b.lastTs - a.lastTs)
        .slice(0, 50)
        .map((r) => ({
          cid: r.cid,
          firstAt: r.firstAt,
          lastAt: r.lastAt,
          sessions: r.sessions,
          maxSessionMs: r.maxSessionMs,
          latest: r.latest,
          exportsCard: r.exportsCard,
          exportsLeague: r.exportsLeague,
          country: r.country,
          device: r.device,
          hasDex: dexCids.has(r.cid),
        })),
    };

    // Newest-active first.
    records.sort((a, b) => b.lastTs - a.lastTs);

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
      const sessSecs = sessionSeconds(r);
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
    }

    // --- Survival (drop-off) curves -------------------------------------
    // S(t) = fraction of sessions still active at t. The steepest part of the
    // curve is where people churn — that's where to intervene. See
    // api/_aggregate.ts for how the x-axis is sampled.

    // Every record-agnostic aggregate, once per tool. `all` is one record per
    // browser with both tools' sessions merged, so a person who used both is
    // one user with one set of days — not two.
    const dexAgg = aggregate(records, now);
    const leagueAgg = aggregate(leagueRecords, now);
    const allAgg = aggregate(mergeByCid([records, leagueRecords]), now);
    const byTool: Record<'dex' | 'league' | 'all', Aggregates> = {
      dex: dexAgg,
      league: leagueAgg,
      all: allAgg,
    };

    // Back-compat surface: the dex slice, where it has always been.
    const timeCurves = dexAgg.timeCurves;
    const timeSurvival = timeCurves.longest.survival;
    const timeStats = timeCurves.longest.stats;

    // Depth survival: x in evolution lines, 0..maxObserved.
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

    // League depth: how far a league gets, on the dex builder's pattern. Two
    // metrics, because a league can be wide (11 cards, one line each) or deep
    // (a few cards, six lines each) and the two fail differently.
    const leagueCurves = {
      cards: buildDepthCurve(leagueRecords.map((r) => r.maxCards)),
      seats: buildDepthCurve(leagueRecords.map((r) => r.maxSeats)),
    };

    const totalUsers = records.length;
    const page = records.slice(offset, offset + limit);

    // The league record for each browser on this page of dex users, so the
    // per-user card can show that person's other tool. Only the page's cids,
    // so the payload does not carry the whole league store twice.
    const leagueByCidAll = new Map(leagueRecords.map((r) => [r.cid, r]));
    const leagueByCid: Record<string, LeagueUser> = {};
    for (const r of page) {
      const lr = leagueByCidAll.get(r.cid.split('::')[0]);
      if (lr) leagueByCid[r.cid] = leagueUser(lr, r.firstTs);
    }

    // Self-scaling qualification thresholds: median per-Pokemon count per list.
    const popularMin = tailThreshold(picksFinal);
    const droppedMin = tailThreshold(droppedCounts);

    // The dex builder's daily active-users series (see api/_aggregate.ts for
    // why rolling7 is a distinct-over-window count, not a sum of DAUs).
    const activity = dexAgg.activity;

    // Private data — never cache.
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({
      totalUsers,
      offset,
      limit,
      funnel: { users: totalUsers, completed, exported },
      funnelEvents,
      tools,
      league,
      cohort,
      activity,
      onboardingLaunchTs: ONBOARDING_LAUNCH_TS,
      exportSettings: exportSettingsAgg,
      retention: dexAgg.retention,
      multiSession,
      timeSurvival,
      timeStats,
      timeCurves,
      depthSurvival,
      depthStats,
      depthCurves,
      lineCurves,
      monCurves,
      // The dex slice, kept at the top level where every existing card reads
      // it. `byTool.dex` is the same object.
      countries: dexAgg.countries,
      languages: dexAgg.languages,
      devices: dexAgg.devices,
      os: dexAgg.os,
      hours: dexAgg.hours,
      heatmap: dexAgg.heatmap,
      byTool,
      journeys,
      leagueCurves,
      leagueByCid,
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
