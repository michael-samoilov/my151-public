// Demo fixture for the admin dashboard, reached at `/?admin&demo`.
//
// It renders the redesign without a live token, so a preview deploy shows the
// whole page and the design can be reviewed on the real app instead of a
// mockup. Every number is fabricated but self-consistent: the funnel stages
// sum (646 = 388 built + 258 bounced; 388 = 65 completed + 323 incomplete;
// 65 = 17 exported + 48 kept private), and each cohort's per-segment counts sum
// to its base. The cids are obviously fake. This module is dynamically imported
// only when the `demo` query flag is present, so it never ships in the real
// admin bundle.
import { BUILD_GROUPS } from '@/data/slot-template';
import { getPokemonById } from '@/hooks/usePokemonData';
import type {
  ApiResponse,
  Aggregates,
  ClientRecord,
  LeagueUser,
  SurvivalCurve,
  ToolSlice,
} from '../AdminPage';
import { lineKey, poolIdsForSection } from '../picksStats';

const DAY = 86_400_000;
// Anchor "now" to the data window's end so relative times read sensibly.
const NOW = Date.UTC(2026, 8, 10, 18, 0, 0); // 2026-09-10
const FIRST = Date.UTC(2026, 5, 12, 0, 0, 0); // 2026-06-12
const iso = (ts: number) => new Date(ts).toISOString();

/** Build a survival curve from raw (t, survivors) points, with percentile
 *  stats derived so the existing readouts have something to show. `s` is stored
 *  as a surviving fraction (0–1), matching the real aggregation — consumers
 *  multiply by `n` to recover a count. */
function curve(points: [number, number][], n: number): SurvivalCurve {
  const base = points[0]?.[1] || n || 1;
  const survival = points.map(([t, s]) => ({ t, s: s / base }));
  const at = (frac: number) => {
    // First t whose survivor share drops to/below `frac` of the start.
    const start = points[0][1] || 1;
    for (const [t, s] of points) if (s / start <= frac) return t;
    return points[points.length - 1][0];
  };
  return { survival, stats: { p50: at(0.5), p75: at(0.25), p90: at(0.1) }, n };
}

/** Turn a share vector (percent) over labels into a raw count map on a base. */
function tally(labels: string[], pct: number[], base: number): Record<string, number> {
  const out: Record<string, number> = {};
  labels.forEach((l, i) => {
    out[l] = Math.round((pct[i] / 100) * base);
  });
  return out;
}

// Daily active series: ~90 days that rise from the low 30s to the mid 50s, with
// weekday texture, so the weekly rollup in the hero trend reads like the mockup.
function activitySeries(): { day: number; dau: number; rolling7: number }[] {
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const end = Math.max(NOW, today);
  const days = Math.round((end - FIRST) / DAY);
  const raw: { day: number; dau: number }[] = [];
  for (let i = 0; i <= days; i += 1) {
    const day = FIRST + i * DAY;
    const trend = 30 + (i / days) * 22; // 30 → 52 over the window
    const weekday = new Date(day).getUTCDay();
    const dip = weekday === 0 || weekday === 6 ? -6 : 2; // weekend dip
    const wobble = Math.round(6 * Math.sin(i / 2.3));
    raw.push({ day, dau: Math.max(8, Math.round(trend + dip + wobble)) });
  }
  return raw.map((r, i) => {
    const from = Math.max(0, i - 6);
    const window = raw.slice(from, i + 1);
    const rolling7 = Math.round(window.reduce((a, b) => a + b.dau, 0) / window.length);
    return { day: r.day, dau: r.dau, rolling7 };
  });
}

const ACTIVITY = activitySeries();

const DEV_LABELS = ['Desktop', 'Mobile', 'Tablet'];
const BR_LABELS = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Other'];

// Per-cohort share vectors from the mockup's Who card.
const COHORTS = {
  dex: { base: 388, dev: [63, 31, 6], geo: [44, 33, 15, 8], br: [52, 27, 9, 8, 4] },
  league: { base: 5, dev: [80, 20, 0], geo: [60, 20, 20, 0], br: [60, 20, 0, 20, 0] },
  all: { base: 389, dev: [63, 31, 6], geo: [44, 33, 15, 8], br: [52, 27, 9, 8, 4] },
};

function aggregate(kind: 'all' | 'dex' | 'league'): Aggregates {
  const c = COHORTS[kind];
  const timeCurve = curve(
    [
      [0, c.base],
      [60, Math.round(c.base * 0.72)],
      [180, Math.round(c.base * 0.5)],
      [420, Math.round(c.base * 0.3)],
      [900, Math.round(c.base * 0.14)],
    ],
    c.base,
  );
  return {
    users: c.base,
    activity: ACTIVITY,
    retention:
      kind === 'league'
        ? { returning: 2, activeLast7: 3, newUsers: 5 }
        : { returning: 63, activeLast7: 52, newUsers: 388 },
    timeCurves: { longest: timeCurve, first: timeCurve, all: timeCurve },
    countries:
      kind === 'league'
        ? { US: 2, IT: 1, GB: 1, SE: 1 }
        : { US: 128, GB: 44, DE: 33, IT: 27, CA: 25, FR: 22, SE: 18, JP: 16, AU: 15, Other: 60 },
    languages:
      kind === 'league'
        ? { 'en-US': 3, 'it-IT': 1, 'sv-SE': 1 }
        : { 'en-US': 168, 'en-GB': 40, 'de-DE': 33, 'it-IT': 27, 'fr-FR': 22, 'ja-JP': 16, Other: 82 },
    locales:
      kind === 'league'
        ? { en: 4, it: 1 }
        : { en: 248, de: 33, it: 27, fr: 22, ja: 16, Other: 42 },
    devices: tally(DEV_LABELS, c.dev, c.base),
    os:
      kind === 'league'
        ? { Windows: 3, iOS: 1, macOS: 1 }
        : { Windows: 190, iOS: 78, Android: 62, macOS: 46, Linux: 12 },
    browsers: tally(BR_LABELS, c.br, c.base),
    hours: HOURS,
    heatmap: HEATMAP,
  };
}

// Local-time heatmap: a plausible evening-and-weekend build pattern.
const HOURS = Array.from({ length: 24 }, (_, h) => {
  const evening = Math.exp(-((h - 20) ** 2) / 20);
  const lunch = 0.5 * Math.exp(-((h - 13) ** 2) / 8);
  return Math.round((evening + lunch) * 60);
});
const HEATMAP: number[][] = Array.from({ length: 7 }, (_, d) =>
  Array.from({ length: 24 }, (_, h) => {
    const weekend = d === 0 || d === 6 ? 1.3 : 1;
    return Math.round(HOURS[h] * weekend * (0.4 + Math.random() * 0.2));
  }),
);

const byTool: Record<ToolSlice, Aggregates> = {
  all: aggregate('all'),
  dex: aggregate('dex'),
  league: aggregate('league'),
};

// Fixed country distribution reused across cohorts (region rollup maps codes).
const cohortCountries = (base: number): Record<string, number> =>
  tally(['US', 'GB', 'DE', 'IT', 'CA', 'FR', 'SE', 'JP', 'AU', 'Other'], [33, 11, 9, 7, 6, 6, 5, 4, 4, 15], base);

// Dex cohorts: built (all), incomplete, completed. Completers skew desktop.
const cohort = (base: number, dev: number[], br: number[]) => ({
  users: base,
  devices: tally(DEV_LABELS, dev, base),
  countries: cohortCountries(base),
  browsers: tally(BR_LABELS, br, base),
});
const cohorts = {
  built: cohort(388, [63, 31, 6], [52, 27, 9, 8, 4]),
  incomplete: cohort(323, [55, 39, 6], [50, 29, 9, 8, 4]),
  completed: cohort(65, [72, 23, 5], [55, 25, 8, 8, 4]),
};

// A handful of per-user records mirroring the mockup's "Newest browsers" list.
type NewestSeed = {
  cid: string;
  c: string;
  dev: string;
  os: string;
  browser: string;
  lang: string;
  sess: number;
  dex: number;
  comp: boolean;
  exp: boolean;
  hoursAgo: number;
};
const NEWEST: NewestSeed[] = [
  { cid: '74d5…68', c: 'US', dev: 'Desktop', os: 'Windows', browser: 'Chrome', lang: 'en-US', sess: 11, dex: 151, comp: true, exp: false, hoursAgo: 2 },
  { cid: '14c0…85', c: 'IT', dev: 'Desktop', os: 'Windows', browser: 'Chrome', lang: 'it-IT', sess: 1, dex: 139, comp: true, exp: true, hoursAgo: 5 },
  { cid: 'bea3…4e', c: 'US', dev: 'Mobile', os: 'iOS', browser: 'Safari', lang: 'en-US', sess: 9, dex: 151, comp: true, exp: false, hoursAgo: 6 },
  { cid: '0f91…4a', c: 'SE', dev: 'Desktop', os: 'macOS', browser: 'Safari', lang: 'sv-SE', sess: 3, dex: 68, comp: false, exp: false, hoursAgo: 8 },
  { cid: 'f269…9a', c: 'CA', dev: 'Mobile', os: 'Android', browser: 'Chrome', lang: 'en-CA', sess: 4, dex: 9, comp: false, exp: false, hoursAgo: 26 },
  { cid: '4eab…af', c: 'GB', dev: 'Desktop', os: 'Windows', browser: 'Edge', lang: 'en-GB', sess: 1, dex: 3, comp: false, exp: false, hoursAgo: 27 },
];

// Bucket a run of ids into a few real build sections so the scrubber shows a
// grouped "build at this moment", not a flat row.
const SECTION_IDS = ['starter', 'early-bird', 'forest', 'cave-pokemon', 'ocean'];
function sectionsOf(ids: number[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  // Assign a leading run into named sections; leave the trailing remainder
  // unsectioned, so the detail page's "Other sections" box has content.
  const sectioned = Math.ceil(ids.length * 0.6);
  ids.slice(0, sectioned).forEach((id, i) => {
    const sid = SECTION_IDS[i % SECTION_IDS.length];
    (out[sid] ??= []).push(id);
  });
  return out;
}

function record(s: NewestSeed): ClientRecord {
  const lastTs = NOW - s.hoursAgo * 3_600_000;
  const firstTs = lastTs - (s.sess + 2) * DAY;
  const ids = Array.from({ length: s.dex }, (_, i) => i + 1);
  const sessionMs = Array.from({ length: s.sess }, () => 120_000 + Math.round(Math.random() * 600_000));
  return {
    cid: s.cid,
    firstTs,
    firstAt: iso(firstTs),
    lastTs,
    lastAt: iso(lastTs),
    submits: s.sess * 3,
    sessions: s.sess,
    maxSessionMs: Math.max(...sessionMs),
    sessionMs,
    sessionLog: sessionMs.map((_ms, i) => {
      const isLast = i === s.sess - 1;
      let count = Math.round((ids.length * (i + 1)) / s.sess);
      // Deterministic wobble so session bars vary in height, like real runs.
      count += Math.round(Math.sin(i * 1.7) * ids.length * 0.05);
      // One larger mid-run pruning so the timeline shows a clear loss (gray)
      // bar, not only gains — up vs down is the diff chart's whole point.
      if (s.sess >= 5 && i === Math.floor(s.sess / 2)) count -= Math.round(ids.length * 0.25);
      count = Math.max(1, Math.min(ids.length, count));
      if (isLast) count = ids.length; // land on the true final total
      let upto = ids.slice(0, count);
      // One session both swaps members out and in, so the diff chart shows red
      // deletions and green insertions in the same bar — not just a net change.
      if (s.sess >= 6 && i === Math.floor(s.sess / 2) + 1 && count > 40) {
        const dropped = new Set(ids.slice(10, 22)); // remove a mid-run block
        const swapIn = ids.slice(count, Math.min(ids.length, count + 12)); // add beyond the prefix
        upto = [...upto.filter((id) => !dropped.has(id)), ...swapIn];
      }
      return {
        ts: firstTs + i * DAY,
        ids: upto,
        country: s.c,
        dev: `${s.dev} · ${s.os} · ${s.browser}`,
        events: i === 0 ? ['intro-shown', 'intro-cta'] : i === 1 ? ['milestone-25'] : i === s.sess - 1 ? ['view-visit'] : [],
        sections: sectionsOf(upto),
      };
    }),
    maxDepth: Math.min(151, s.dex),
    localHour: 20,
    localDow: 3,
    country: s.c,
    region: s.c === 'US' || s.c === 'CA' ? 'N. America' : 'Europe',
    lang: s.lang,
    locale: s.lang.split('-')[0],
    device: s.dev,
    os: s.os,
    browser: s.browser,
    everIds: ids,
    latestIds: ids,
    completed: s.comp,
    completedAt: s.comp ? iso(lastTs) : undefined,
    completedIds: s.comp ? ids : undefined,
    exported: s.exp,
    exportedAt: s.exp ? iso(lastTs) : undefined,
    exportedIds: s.exp ? ids : undefined,
  };
}

const records = NEWEST.map(record);

// Build n trainer cards, each with distinct seated members (three lines of
// 3, 3, 2 stages), so the league scrubber shows a real board and the seated
// count grows with the cards — like real leagues, where members don't repeat.
const CARD_TYPES = ['fire', 'water', 'grass', 'electric', 'psychic', 'rock', 'dragon', 'fairy', 'ghost', 'steel', 'ground', 'ice', 'bug', 'poison'];
const SEATS_PER_CARD = 8; // 3 + 3 + 2
function mkCards(n: number): import('../AdminPage').LeagueCard[] {
  let id = 1;
  const next = () => {
    const v = id;
    id = (id % 151) + 1; // stay within Kanto ids that have sprites
    return v;
  };
  return Array.from({ length: n }, (_, i) => {
    const l = [
      { b: [next(), next(), next()] },
      { b: [next(), next(), next()] },
      { b: [next(), next()] },
    ];
    const card: import('../AdminPage').LeagueCard = {
      i,
      // A card carries a type theme, which tints the slot's swatch.
      t: CARD_TYPES[i % CARD_TYPES.length],
      l,
    };
    // Most trainers mark an ace: the final evolution of a varied line. Skip
    // roughly every third card.
    if (i % 3 !== 2) {
      const line = l[i % 3].b;
      card.aceId = line[line.length - 1];
    }
    return card;
  });
}

// Five league browsers.
function leagueUser(cid: string, c: string, cards: number, sess: number, hoursAgo: number, hasDex: boolean): LeagueUser {
  const lastTs = NOW - hoursAgo * 3_600_000;
  const firstTs = lastTs - sess * DAY;
  const latest = { cards, seats: cards * SEATS_PER_CARD, typed: cards, named: cards, aces: cards, leagueNamed: cards >= 8 };
  const region = c === 'US' || c === 'CA' ? 'N. America' : c === 'AU' ? 'Oceania' : 'Europe';
  const lang = c === 'IT' ? 'it-IT' : c === 'FR' ? 'fr-FR' : c === 'AU' ? 'en-AU' : 'en-US';
  return {
    cid,
    submits: sess * 2,
    sessionMs: Array.from({ length: sess }, () => 300_000),
    country: c,
    region,
    lang,
    locale: lang.split('-')[0],
    device: 'Desktop',
    os: 'Windows',
    browser: 'Chrome',
    hasDex,
    firstTs,
    firstAt: iso(firstTs),
    lastTs,
    lastAt: iso(lastTs),
    sessions: sess,
    maxSessionMs: 300_000,
    maxCards: cards,
    maxSeats: cards * SEATS_PER_CARD,
    latest,
    latestCards: mkCards(cards),
    exportsCard: cards >= 8 ? 1 : 0,
    exportsLeague: cards >= 11 ? 1 : 0,
    sessionLog: Array.from({ length: sess }, (_, i) => {
      const c2 = Math.max(1, Math.round((cards * (i + 1)) / sess));
      // Older beacons carried only summary counts, no card structure. Model that
      // for the earliest sessions, so the diff chart's structure-less fallback
      // is exercised (bars from the seat-count delta, a consistent size line).
      const hasStructure = i >= Math.floor(sess / 2);
      return {
        ts: firstTs + i * DAY,
        summary: {
          cards: c2,
          seats: c2 * SEATS_PER_CARD,
          typed: c2,
          named: c2,
          aces: c2,
          leagueNamed: false,
        },
        country: c,
        cards: hasStructure ? mkCards(c2) : undefined,
      };
    }),
    order: hasDex ? 'dex-first' : undefined,
    gapDays: hasDex ? 3 : undefined,
  };
}
const leagueUsers: LeagueUser[] = [
  leagueUser('70cd…a7', 'IT', 11, 3, 3, true),
  leagueUser('74d5…68', 'US', 8, 2, 5, true),
  leagueUser('bea3…4e', 'US', 6, 1, 9, true),
  leagueUser('1b2f…ea', 'AU', 3, 2, 28, true),
  leagueUser('9d19…10', 'FR', 1, 1, 50, false),
];

// Popular / dropped picks — a slice of the mockup's grid, real Pokémon ids.
const popularFinal: [string, number][] = [
  ['25', 84], ['1', 80], ['4', 73], ['7', 72], ['133', 70], ['6', 66], ['9', 65],
  ['3', 64], ['5', 64], ['150', 64], ['143', 63], ['94', 60], ['131', 58], ['149', 58], ['130', 52],
  ['448', 48], ['282', 44], ['212', 44], ['376', 43], ['160', 40],
];
const mostDropped: [string, number][] = [
  ['821', 80], ['736', 70], ['587', 58], ['504', 44], ['659', 40], ['633', 36],
  ['401', 32], ['290', 28], ['172', 24], ['16', 20], ['777', 18], ['311', 14],
];
/** Per-section placement counts for demo. Line-aware: stage-1 is ~28% of the
 *  fully-evolved count so the Pichu-dropped case is visible. */
function demoPicksBySection(): Record<string, [string, number][]> {
  const out: Record<string, [string, number][]> = {};
  for (const g of BUILD_GROUPS) {
    const pool = g.filterType === null ? [129, 130, 16, 17, 18, 143, 131] : [...poolIdsForSection(g.id)];
    const byLine = new Map<string, number[]>();
    for (const id of pool) {
      const k = lineKey(id);
      const list = byLine.get(k);
      if (list) list.push(id);
      else byLine.set(k, [id]);
    }
    const lines = [...byLine.values()];
    const rows: [string, number][] = [];
    lines.forEach((ids, i) => {
      const peak = Math.max(1, Math.round(95 * (1 - i / Math.max(1, lines.length))));
      const ordered = [...ids].sort(
        (a, b) => (getPokemonById(a)?.evolutionStage ?? 1) - (getPokemonById(b)?.evolutionStage ?? 1) || a - b,
      );
      ordered.forEach((id, stage) => {
        const factor = ordered.length > 1 && stage === 0 ? 0.28 : 1 - stage * 0.06;
        rows.push([String(id), Math.max(0, Math.round(peak * factor))]);
      });
    });
    if (g.id === 'evil-team') {
      rows.push(['129', 19], ['130', 8], ['1', 4], ['4', 1]);
    }
    if (g.id === 'starter') {
      rows.push(['25', 11], ['172', 2]);
    }
    out[g.id] = rows;
  }
  return out;
}

const picksBySectionAll = demoPicksBySection();

function curveRec(points: [number, number][], n: number) {
  return curve(points, n);
}
// Build depth by dex size (1–151): where builders stop.
const depthPts: [number, number][] = [
  [1, 388], [10, 300], [20, 250], [40, 200], [60, 150], [80, 120], [100, 100], [120, 85], [151, 65],
];
// Build depth by distinct evolution lines.
const linePts: [number, number][] = [
  [1, 388], [3, 320], [5, 270], [8, 210], [11, 170], [20, 120], [40, 90], [80, 72], [151, 65],
];
const depthFullCurves = {
  total: curveRec(depthPts, 388),
  first: curveRec(depthPts, 388),
  longest: curveRec(depthPts, 388),
  all: curveRec(depthPts, 388),
};
const lineFullCurves = {
  total: curveRec(linePts, 388),
  first: curveRec(linePts, 388),
  longest: curveRec(linePts, 388),
  all: curveRec(linePts, 388),
};
// Build depth by device: mobile drops off sooner, desktop goes deeper.
const mobilePts: [number, number][] = [
  [1, 120], [10, 82], [20, 60], [40, 40], [60, 26], [80, 18], [100, 13], [120, 10], [151, 8],
];
const desktopPts: [number, number][] = [
  [1, 244], [10, 205], [20, 178], [40, 148], [60, 116], [80, 95], [100, 82], [120, 71], [151, 55],
];
const depthByDevice = {
  all: curveRec(depthPts, 388),
  mobile: curveRec(mobilePts, 120),
  desktop: curveRec(desktopPts, 244),
};
const referrerFlow = [
  { host: 'google.com', total: 182, dex: 171, league: 13 },
  { host: 'reddit.com', total: 96, dex: 88, league: 9 },
  { host: 'youtube.com', total: 41, dex: 39, league: 2 },
  { host: 't.co', total: 24, dex: 21, league: 4 },
  { host: 'bing.com', total: 15, dex: 14, league: 1 },
];

export const sampleResponse: ApiResponse = {
  totalUsers: 388,
  offset: 0,
  limit: records.length,
  funnel: { users: 646, completed: 65, exported: 17 },
  funnelEvents: { intro_shown: 646, intro_cta: 512, builder_open: 420, milestone_50: 240, milestone_100: 150 },
  tools: {
    dex: 388,
    league: 5,
    both: 4,
    leagueOnly: 1,
    dexOnly: 384,
    dexExporters: 17,
    dexExportersWhoOpenedLeague: 3,
    leagueExporters: 2,
    leagueExportersWithDex: 2,
  },
  league: {
    users: 5,
    named: 4,
    typed: 5,
    fullLeague: 1,
    exportedCard: 3,
    exportedLeague: 1,
    returning: 3,
    activeLast7: 3,
    activity: ACTIVITY.slice(-30).map((a) => ({ day: a.day, dau: Math.max(0, Math.round(a.dau / 12)) })),
    recent: leagueUsers.map((u) => ({
      cid: u.cid,
      firstAt: u.firstAt,
      lastAt: u.lastAt,
      sessions: u.sessions,
      maxSessionMs: u.maxSessionMs,
      latest: {
        cards: u.latest.cards,
        seats: u.latest.seats,
        typed: u.latest.typed,
        named: u.latest.named,
        aces: u.latest.aces,
        leagueNamed: u.latest.leagueNamed,
      },
      exportsCard: u.exportsCard,
      exportsLeague: u.exportsLeague,
      country: u.country,
      device: u.device,
      hasDex: u.hasDex,
    })),
  },
  activity: ACTIVITY,
  onboardingLaunchTs: Date.UTC(2026, 6, 15),
  exportSettings: {
    tracked: 17,
    outlines: 9,
    groupSpecial: 12,
    showStats: 6,
    sorts: { dex: 8, type: 5, name: 4 },
  },
  retention: { returning: 63, activeLast7: 52, newUsers: 388 },
  multiSession: 210,
  timeSurvival: byTool.dex.timeCurves.longest.survival,
  timeStats: byTool.dex.timeCurves.longest.stats,
  timeCurves: byTool.dex.timeCurves,
  depthSurvival: depthFullCurves.total.survival,
  depthStats: depthFullCurves.total.stats,
  depthCurves: depthFullCurves,
  lineCurves: lineFullCurves,
  monCurves: depthFullCurves,
  countries: byTool.dex.countries,
  languages: byTool.dex.languages,
  devices: byTool.dex.devices,
  os: byTool.dex.os,
  hours: HOURS,
  heatmap: HEATMAP,
  popularFinal,
  mostDropped,
  popularMin: 40,
  droppedMin: 14,
  popularBySection: picksBySectionAll,
  droppedBySection: { 'early-bird': mostDropped },
  picksBySectionAll,
  byTool,
  cohorts,
  depthByDevice,
  referrerFlow,
  journeys: {
    both: 4,
    dexFirst: 3,
    leagueFirst: 1,
    sameDay: 0,
    medianGapDays: 2.5,
    p75GapDays: 6,
    weekly: ACTIVITY.filter((_, i) => i % 7 === 0).map((a, i) => ({
      week: a.day,
      newDex: 24 + (i % 5) * 3,
      dexToLeague7d: i % 3 === 0 ? 1 : 0,
      newLeague: i % 4 === 0 ? 1 : 0,
      leagueToDex7d: 0,
    })),
  },
  leagueCurves: {
    cards: curve(
      [
        [1, 5], [3, 4], [6, 3], [8, 2], [11, 1],
      ],
      5,
    ),
    seats: curve(
      [
        [1, 5], [12, 4], [30, 3], [48, 2], [66, 1],
      ],
      5,
    ),
  },
  leagueByCid: Object.fromEntries(leagueUsers.filter((u) => u.hasDex).map((u) => [u.cid, u])),
  leagueUsers,
  totalLeagueUsers: 5,
  records,
};

export default sampleResponse;
