import {aggregate as aggregateRecords} from '../../../../api/_aggregate';
import {favoritePicks,favoriteSummary,favoriteUsageFunnel,favoriteUser} from '../../../../api/_favoriteAggregate';
import {mergeFavoriteRecord,parseFavoriteSnapshot,type FavoriteRecord} from '../../../../api/_favoriteRecord';
import { bareCid } from '../../../../api/_archive';
import { browserIndex } from '../../../../api/_dashboard';
import type { BrowserRecords } from '../browserRecords';
import favoriteCells from '../../../../api/_favoriteCells.json';
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
import { leaguePicks } from '../../../../api/_leaguePicks';
import { PREVIEW_FIT } from '../userPreview';
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 10, 18, 0, 0);
const FIRST = Date.UTC(2026, 5, 12, 0, 0, 0);
const iso = (ts: number) => new Date(ts).toISOString();

function curve(points: [number, number][], n: number): SurvivalCurve {
  const base = points[0]?.[1] || n || 1;
  const survival = points.map(([t, s]) => ({ t, s: s / base }));
  const at = (frac: number) => {
    const start = points[0][1] || 1;
    for (const [t, s] of points) if (s / start <= frac) return t;
    return points[points.length - 1][0];
  };
  return { survival, stats: { p50: at(0.5), p75: at(0.25), p90: at(0.1) }, n };
}

function tally(labels: string[], pct: number[], base: number): Record<string, number> {
  const out: Record<string, number> = {};
  labels.forEach((l, i) => {
    out[l] = Math.round((pct[i] / 100) * base);
  });
  return out;
}

function activitySeries(): { day: number; dau: number; rolling7: number }[] {
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const end = Math.max(NOW, today);
  const days = Math.round((end - FIRST) / DAY);
  const raw: { day: number; dau: number }[] = [];
  for (let i = 0; i <= days; i += 1) {
    const day = FIRST + i * DAY;
    const trend = 30 + (i / days) * 22;
    const weekday = new Date(day).getUTCDay();
    const dip = weekday === 0 || weekday === 6 ? -6 : 2;
    const wobble = Math.round(6 * Math.sin(i / 2.3));
    raw.push({ day, dau: Math.max(8, Math.round(trend + dip + wobble)) });
  }
  return raw.map((r, i) => {
    const from = Math.max(0, i - 6);
    const window = raw.slice(from, i + 1);
    const rolling7 = Math.round(window.reduce((a, b) => a + b.dau, 0) / Math.max(window.length, 1));
    return { day: r.day, dau: r.dau, rolling7 };
  });
}

const ACTIVITY = activitySeries();

function hourlySeries(): { hour: number; unique: number; pastHour?: number }[] {
  const hour = DAY / 24;
  const now = Date.now();
  const last = Math.floor(now / hour) * hour;
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const first = today - 6 * DAY;
  const out: { hour: number; unique: number; pastHour?: number }[] = [];
  for (let h = first; h <= last; h += hour) {
    const utcH = new Date(h).getUTCHours();
    const weekday = new Date(h).getUTCDay();
    const evening = Math.exp(-((utcH - 20) ** 2) / 18);
    const lunch = 0.45 * Math.exp(-((utcH - 13) ** 2) / 8);
    const weekend = weekday === 0 || weekday === 6 ? 0.65 : 1;
    out.push({ hour: h, unique: Math.max(0, Math.round((evening + lunch) * 14 * weekend + (utcH % 5 === 0 ? 2 : 0))) });
  }
  // The past 60 minutes reach back into the previous hour, so they count at least as many as either hour.
  out[out.length - 1].pastHour = Math.max(out[out.length - 1].unique, out[out.length - 2].unique) + 1;
  return out;
}

const HOURLY = hourlySeries();

const DEV_LABELS = ['Desktop', 'Mobile', 'Tablet'];
const BR_LABELS = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Other'];

const DEX_JOINTS = [
  { device: 'Desktop', os: 'Windows', browser: 'Chrome', n: 150 },
  { device: 'Desktop', os: 'Windows', browser: 'Edge', n: 31 },
  { device: 'Desktop', os: 'macOS', browser: 'Chrome', n: 40 },
  { device: 'Desktop', os: 'macOS', browser: 'Safari', n: 6 },
  { device: 'Desktop', os: 'Linux', browser: 'Firefox', n: 12 },
  { device: 'Mobile', os: 'iOS', browser: 'Safari', n: 70 },
  { device: 'Mobile', os: 'iOS', browser: 'Chrome', n: 8 },
  { device: 'Mobile', os: 'Android', browser: 'Chrome', n: 50 },
  { device: 'Tablet', os: 'iOS', browser: 'Safari', n: 9 },
  { device: 'Tablet', os: 'Android', browser: 'Chrome', n: 12 },
];
const LEAGUE_JOINTS = [
  { device: 'Desktop', os: 'Windows', browser: 'Chrome', n: 3 },
  { device: 'Mobile', os: 'iOS', browser: 'Safari', n: 1 },
  { device: 'Desktop', os: 'macOS', browser: 'Edge', n: 1 },
];

function scaleJoints(src: typeof DEX_JOINTS, base: number): typeof DEX_JOINTS {
  const total = src.reduce((s, j) => s + j.n, 0) || 1;
  return src
    .map((j) => ({ ...j, n: Math.round((j.n * base) / total) }))
    .filter((j) => j.n > 0);
}

function mixFromJoints(joints: typeof DEX_JOINTS, key: 'device' | 'os' | 'browser'): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of joints) {
    const k = j[key];
    out[k] = (out[k] ?? 0) + j.n;
  }
  return out;
}

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
        ? { returning: 2, newUsers: 5 }
        : { returning: 63, newUsers: 388 },
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
    joints: kind === 'league' ? LEAGUE_JOINTS : scaleJoints(DEX_JOINTS, c.base),
    heatmaps: HEATMAPS,
    hourly: HOURLY,
  };
}

const HOUR_SHAPE = Array.from({ length: 24 }, (_, h) => Math.exp(-((h - 20) ** 2) / 20) + 0.5 * Math.exp(-((h - 13) ** 2) / 8));
const LOCAL_WEEK: number[][] = Array.from({ length: 7 }, (_, d) =>
  Array.from({ length: 24 }, (_, h) => Math.round(HOUR_SHAPE[h] * (d === 0 || d === 6 ? 13 : 10)) + ((d * 5 + h) % 3)),
);
const HEATMAPS = {
  local: LOCAL_WEEK,
  eastern: LOCAL_WEEK.map((row) => row.map((_, h) => row[(h + 23) % 24])),
};

const byTool: Record<ToolSlice, Aggregates> = {
  all: aggregate('all'),
  dex: aggregate('dex'),
  league: aggregate('league'),
  favorites:aggregateRecords([],Date.UTC(2026,9,4)),
};

const cohortCountries = (base: number): Record<string, number> =>
  tally(['US', 'GB', 'DE', 'IT', 'CA', 'FR', 'SE', 'JP', 'AU', 'Other'], [33, 11, 9, 7, 6, 6, 5, 4, 4, 15], base);

const cohort = (base: number, dev: number[], br: number[]) => {
  const joints = scaleJoints(DEX_JOINTS, base);
  return {
    users: base,
    devices: tally(DEV_LABELS, dev, base),
    os: mixFromJoints(joints, 'os'),
    countries: cohortCountries(base),
    browsers: tally(BR_LABELS, br, base),
    joints,
  };
};
const cohorts = {
  built: cohort(388, [63, 31, 6], [52, 27, 9, 8, 4]),
  incomplete: cohort(323, [55, 39, 6], [50, 29, 9, 8, 4]),
  completed: cohort(65, [72, 23, 5], [55, 25, 8, 8, 4]),
};

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
  archived?: boolean;
  sessionMs?: number[];
  locale?: string;
  switched?: string;
};
const TZ: Record<string, string> = {
  US: 'America/New_York',
  IT: 'Europe/Rome',
  SE: 'Europe/Stockholm',
  CA: 'America/Toronto',
  GB: 'Europe/London',
  AU: 'Australia/Sydney',
  FR: 'Europe/Paris',
};
const NEWEST: NewestSeed[] = [
  {
    cid: 'c0de…ff',
    c: 'US',
    dev: 'Mobile',
    os: 'iOS',
    browser: 'Safari',
    lang: 'en-US',
    sess: PREVIEW_FIT.sessions,
    dex: PREVIEW_FIT.dex,
    comp: true,
    exp: true,
    hoursAgo: 1,
    sessionMs: [PREVIEW_FIT.totalMs],
  },
  { cid: '74d5…68', c: 'US', dev: 'Desktop', os: 'Windows', browser: 'Chrome', lang: 'en-US', sess: 11, dex: 151, comp: true, exp: false, hoursAgo: 2 },
  { cid: '70cd…a7', c: 'IT', dev: 'Desktop', os: 'Windows', browser: 'Chrome', lang: 'it-IT', sess: 6, dex: 90, comp: false, exp: false, hoursAgo: 4 },
  { cid: '14c0…85', c: 'IT', dev: 'Desktop', os: 'Windows', browser: 'Chrome', lang: 'it-IT', sess: 1, dex: 139, comp: true, exp: true, hoursAgo: 5 },
  { cid: 'bea3…4e', c: 'US', dev: 'Mobile', os: 'iOS', browser: 'Safari', lang: 'en-US', sess: 9, dex: 151, comp: true, exp: false, hoursAgo: 6, switched: 'ja' },
  { cid: '0f91…4a', c: 'SE', dev: 'Desktop', os: 'macOS', browser: 'Safari', lang: 'sv-SE', sess: 3, dex: 68, comp: false, exp: false, hoursAgo: 8 },
  { cid: 'f269…9a', c: 'CA', dev: 'Mobile', os: 'Android', browser: 'Chrome', lang: 'en-CA', sess: 4, dex: 9, comp: false, exp: false, hoursAgo: 26, archived: true },
  { cid: '4eab…af', c: 'GB', dev: 'Desktop', os: 'Windows', browser: 'Edge', lang: 'el-GR', locale: 'en', sess: 1, dex: 3, comp: false, exp: false, hoursAgo: 27 },
];

const SECTION_IDS = ['starter', 'early-bird', 'forest', 'cave-pokemon', 'ocean'];
function sectionsOf(ids: number[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
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
  const ids = Array.from({ length: Math.min(s.dex, 151) }, (_, i) => i + 1);
  const sessionMs = s.sessionMs ?? Array.from({ length: s.sess }, (_, i) => 180_000 + ((i * 73) % 12) * 60_000);
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
      count += Math.round(Math.sin(i * 1.7) * ids.length * 0.05);
      if (s.sess >= 5 && i === Math.floor(s.sess / 2)) count -= Math.round(ids.length * 0.25);
      count = Math.max(1, Math.min(ids.length, count));
      if (isLast) count = ids.length;
      let upto = ids.slice(0, count);
      if (s.sess >= 6 && i === Math.floor(s.sess / 2) + 1 && count > 40) {
        const dropped = new Set(ids.slice(10, 22));
        const swapIn = ids.slice(count, Math.min(ids.length, count + 12));
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
    maxDepth: s.dex,
    localHour: 20,
    localDow: 3,
    country: s.c,
    region: s.c === 'US' || s.c === 'CA' ? 'N. America' : 'Europe',
    tz: TZ[s.c],

    lang: s.lang,
    locale: s.locale ?? s.lang.split('-')[0],
    switched: s.switched,
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
    archived: s.archived,
  };
}

const records = NEWEST.map(record);
{
  const rec = records.find((r) => r.cid === '14c0…85');
  if (!rec) throw new Error('missing 14c0 dex fixture');
  rec.exportSurveySkips = [{ t: rec.lastTs, tool: 'pokedex', reason: 'not_now' }];
}

const CARD_TYPES = ['fire', 'water', 'grass', 'electric', 'psychic', 'rock', 'dragon', 'fairy', 'ghost', 'steel', 'ground', 'ice', 'bug', 'poison'];
const SEATS_PER_CARD = 6;
function mkCards(n: number): import('../AdminPage').LeagueCard[] {
  let id = 1;
  const next = () => {
    const v = id;
    id = (id % 151) + 1;
    return v;
  };
  return Array.from({ length: n }, (_, i) => {
    const l = Array.from({ length: 6 }, (_, si) => {
      const b = [next(), next(), next()];
      return si === 5 ? { b, bd: [1, 10, 11] } : { b };
    });
    const card: import('../AdminPage').LeagueCard = {
      i,
      t: i === 1 ? 'none' : CARD_TYPES[i % CARD_TYPES.length],
      l,
    };
    if (i % 3 !== 2) {
      const line = l[i % 3].b;
      card.ace = (i % 3) + 1;
      card.aceId = line[line.length - 1];
    }
    return card;
  });
}

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
    tz: TZ[c],
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
    exportedCardAt: cards >= 8 ? iso(lastTs - 3_600_000) : undefined,
    exportedLeagueAt: cards >= 11 ? iso(lastTs) : undefined,
    sessionLog: Array.from({ length: sess }, (_, i) => {
      const c2 = Math.max(1, Math.round((cards * (i + 1)) / sess));
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
  leagueUser('c0de…ff', 'US', 14, 0, 1, true),
  leagueUser('70cd…a7', 'IT', 14, 3, 3, true),
  leagueUser('74d5…68', 'US', 8, 2, 5, true),
  leagueUser('bea3…4e', 'US', 6, 1, 9, true),
  leagueUser('1b2f…ea', 'AU', 3, 2, 28, true),
  leagueUser('9d19…10', 'FR', 1, 1, 50, false),
];

{
  const u = leagueUsers.find((row) => row.cid === '70cd…a7');
  if (!u) throw new Error('missing 70cd league fixture');
  const last = u.sessionLog[u.sessionLog.length - 1];
  const prev = u.sessionLog[u.sessionLog.length - 2];
  prev.summary = { ...last.summary };
  prev.events = ['league-nudge-card-shown', 'league-nudge-card-cta'];
  if (!prev.cards || !last.cards) throw new Error('70cd fixture missing card structure');
  prev.cards[0].l[3] = { b: [133, 134] };
  last.cards[0].l[3] = { b: [133, 136] };
  [last.cards[0].l[4], last.cards[1].l[4]] = [last.cards[1].l[4], last.cards[0].l[4]];
  u.sessionLog.splice(u.sessionLog.length - 1, 0, {
    ts: Math.round((prev.ts + last.ts) / 2),
    summary: { cards: 1, seats: 1, typed: 0, named: 0, aces: 0, leagueNamed: false },
    country: last.country,
  });
  if (!u.exportedCardAt) throw new Error('70cd fixture missing exportedCardAt');
  u.exportSurveySkips = [
    { t: u.sessionLog[0].ts, tool: 'card', reason: 'abandon' },
    { t: u.lastTs, tool: 'league', reason: 'close' },
  ];
}

const popularFinal: [string, number][] = [
  ['25', 84], ['1', 80], ['4', 73], ['7', 72], ['133', 70], ['6', 66], ['9', 65],
  ['3', 64], ['5', 64], ['150', 64], ['143', 63], ['94', 60], ['131', 58], ['149', 58], ['130', 52],
  ['448', 48], ['282', 44], ['212', 44], ['376', 43], ['160', 40],
];
const mostDropped: [string, number][] = [
  ['821', 80], ['736', 70], ['587', 58], ['504', 44], ['659', 40], ['633', 36],
  ['401', 32], ['290', 28], ['172', 24], ['16', 20], ['777', 18], ['311', 14],
];
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
const depthPts: [number, number][] = [
  [1, 388], [10, 300], [20, 250], [40, 200], [60, 150], [80, 120], [100, 100], [120, 85], [151, 65],
];
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
  { host: 'google.com', total: 184, dex: 171, league: 13, favorites:2 },
  { host: 'reddit.com', total: 97, dex: 88, league: 9, favorites:1 },
  { host: 'youtube.com', total: 41, dex: 39, league: 2 },
  { host: 't.co', total: 24, dex: 21, league: 4 },
  { host: 'bing.com', total: 15, dex: 14, league: 1 },
  { host: 'referrer not known', total: 93, dex: 85, league: 6, favorites:3 },
];

export const sampleResponse: ApiResponse = {
  totalUsers: 388,
  funnel: { users: 646, completed: 65, exported: 17 },
  funnelEvents: {
    intro_shown: 646,
    intro_cta: 512,
    builder_open: 420,
    milestone_50: 240,
    milestone_100: 150,
    'league-open': 8,
  },
  dexFunnel: {
    opened: 646,
    built: 388,
    bounced: 258,
    buckets: [
      { label: '1–30', count: 140, exported: 8 },
      { label: '31–60', count: 80, exported: 6 },
      { label: '61–90', count: 50, exported: 4 },
      { label: '91–120', count: 33, exported: 3 },
      { label: '121–150', count: 20, exported: 2 },
    ],
    completed: 65,
    exported: 17,
    keptPrivate: 48,
  },
  leagueFunnel: {
    opened: 9,
    placed: 6,
    bounced: 3,
    oneGymFull: 5,
    cardNotFinished: 1,
    gymBuckets: [
      { label: '1–4 gyms', count: 1, exports: { league: 0, both: 0, card: 0 } },
      { label: '5–8 gyms', count: 1, exports: { league: 0, both: 0, card: 1 } },
      { label: '9–12 gyms', count: 1, exports: { league: 0, both: 0, card: 0 } },
      { label: 'Full league', count: 2, exports: { league: 0, both: 1, card: 0 } },
    ],
    fullLeague: 2,
    exports: { league: 0, both: 1, card: 1 },
    keptPrivate: 1,
  },
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
    users: leagueUsers.length,
    named: 4,
    typed: 5,
    fullLeague: 1,
    returning: 3,
    activity: ACTIVITY.slice(-30).map((a) => ({ day: a.day, dau: Math.max(0, Math.round(a.dau / 12)) })),
    picks: leaguePicks(leagueUsers),
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
  retention: { returning: 63, newUsers: 388 },
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
  crossTool: {
    catalog: [
      { id: 'dex', label: 'Dex builder', short: 'Dex', launchedAt: 0 },
      { id: 'league', label: 'Gym leader maker', short: 'League', launchedAt: Date.UTC(2026, 8, 8) },
    ],
    kpis: [
      {
        key: 'dex-to-league',
        label: 'Dex → League',
        hint: 'of dex users active after 8 Sep 2026',
        n: 4,
        of: 50,
        pct: 8,
      },
      {
        key: 'league-has-earlier',
        label: 'League has a dex',
        hint: 'of league browsers',
        n: 4,
        of: 5,
        pct: 80,
      },
      {
        key: 'league-from-dex',
        label: 'Only dex Pokémon',
        hint: 'of dual-tool leagues with a stored team',
        n: 3,
        of: 4,
        pct: 75,
      },
    ],
    eras: [
      {
        key: 'before-league',
        label: 'Arrived before 8 Sep 2026',
        shortLabel: 'Before 8 Sep',
        since: null,
        until: Date.UTC(2026, 8, 8),
        browsers: 339,
        regions: { dex: 336, 'dex+league': 3 },
      },
      {
        key: 'since-league',
        label: 'Arrived after 8 Sep 2026',
        shortLabel: 'After 8 Sep',
        since: Date.UTC(2026, 8, 8),
        until: null,
        browsers: 50,
        regions: { dex: 48, league: 1, 'dex+league': 1 },
      },
    ],
  },
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
};

const fullFills:Record<string,number> = {};
for(const [key,cell] of Object.entries(favoriteCells)) {
  const c = cell as {kind:string;ids?:number[];sources?:string[]};
  if(c.kind==='pick' && c.ids?.length)fullFills[key]=c.ids[0];
}
for(const [key,cell] of Object.entries(favoriteCells)) {
  const c = cell as {kind:string;sources?:string[]};
  if(c.kind==='pointer')for(const source of c.sources ?? [])if(fullFills[source]){fullFills[key]=fullFills[source];break;}
}
const pickerNow=Date.UTC(2026,9,4,18);
const pickerRecords:FavoriteRecord[] = [0,24,80,150,220,257].map((depth,i)=>{
  const fills=Object.fromEntries(Object.entries(fullFills).slice(0,depth));
  const initial=parseFavoriteSnapshot({v:1,fills:{}})!;
  const selected=parseFavoriteSnapshot({v:1,fills})!;
  const cid=`demo-picker-${i+1}`;
  let r=mergeFavoriteRecord(null,{cid,id:`open-${i}`,now:pickerNow-86400000,kind:'progress',snapshot:initial,events:['favorites-open'],country:i%2?'GB':'US',device:i%2?'desktop':'mobile',os:i%2?'Windows':'iOS',browser:i%2?'Chrome':'Safari',tz:'America/New_York',locale:'en',lang:'en-US'});
  r=mergeFavoriteRecord(r,{cid,id:`pick-${i}`,now:pickerNow,kind:'progress',snapshot:selected,events:[]});
  if(i===5)r=mergeFavoriteRecord(r,{cid,id:`nudge-${i}`,now:pickerNow+15000,kind:'nudge-shown',snapshot:selected,events:['favorites-nudge-complete-shown']});
  if(i>0)r=mergeFavoriteRecord(r,{cid,id:`shown-${i}`,now:pickerNow+30000,kind:'export-shown',snapshot:selected,events:['favorites-export-shown']});
  if(i>1)r=mergeFavoriteRecord(r,{cid,id:`full-${i}`,now:pickerNow+60000,kind:'export',exportKind:i===3?'simplified':'full',snapshot:selected,events:[i===3?'favorites-export-simplified':'favorites-export-full',...(i===4?['favorites-export-stats']:[])]});
  if(i===5)r=mergeFavoriteRecord(r,{cid,id:`simple-${i}`,now:pickerNow+120000,kind:'export',exportKind:'simplified',snapshot:selected,events:['favorites-export-simplified']});
  return r;
});
const favoriteUsers = pickerRecords.map((r) => favoriteUser(r, false));
sampleResponse.browsers = browserIndex(records, leagueUsers, favoriteUsers, new Set(records.filter((r) => r.archived).map((r) => bareCid(r.cid))));

export function sampleBrowser(cid: string, country?: string): BrowserRecords {
  const dex = records.find((r) => r.cid === `${cid}::${country}`) ?? records.find((r) => r.cid === cid);
  return {
    cid,
    dex: dex ?? null,
    league: leagueUsers.find((u) => u.cid === cid) ?? null,
    favorite: favoriteUsers.find((u) => u.cid === cid) ?? null,
  };
}
sampleResponse.favorite=favoriteSummary(pickerRecords);
sampleResponse.favoritePicks=favoritePicks(pickerRecords);
sampleResponse.favoriteFunnel=favoriteUsageFunnel(pickerRecords,0);
sampleResponse.byTool!.favorites=aggregateRecords(pickerRecords,pickerNow+120000);
sampleResponse.byTool!.all!.users+=pickerRecords.length;
if(sampleResponse.crossTool){
  sampleResponse.crossTool.catalog.push({id:'favorites',label:'Favorite Pokémon Picker',short:'Picker',launchedAt:null});
  const era=sampleResponse.crossTool.eras.at(-1)!;
  era.regions.favorites=pickerRecords.length;era.browsers+=pickerRecords.length;
}
