import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FeedbackCard } from '@/components/admin/FeedbackCard';
import { TrendChart } from '@/components/admin/charts/TrendChart';
import { FlowSankey } from '@/components/admin/charts/FlowSankey';
import { BuildDepthChart } from '@/components/admin/charts/BuildDepthChart';
import { Panel, Seg, Kpi, Delta, Rollup, type RollupRow } from '@/components/admin/ui';
import { Input } from '@/components/ui/input';
import { getAllPokemon, getPokemonById } from '@/hooks/usePokemonData';
import { BUILD_GROUPS } from '@/data/slot-template';
import { ARCHETYPES } from '@/data/archetypes';
import { getCategoryById } from '@/data/categories';
import { cn, displayName } from '@/lib/utils';
import { regionOf, REGION_COLORS, type Region } from '@/lib/countryRegions';
import { DROP_REASON_INFO, DROP_TOOL_LABEL, liveDropReasons } from '@/lib/beaconDrops';
import { CARD_COUNT } from '../../../api/_leagueRecord';
import { sortSessions, withoutDropRestorePhantoms, type SessionCounts } from '../../../api/_sessionize';
import { SessionTimeline, type TimelinePoint } from '@/components/admin/charts/SessionTimeline';
import { OutlinedDex } from '@/components/admin/OutlinedDex';
import { LeagueVisitBoard } from '@/components/admin/LeagueVisitBoard';
import { DeviceIcon, OsIcon, BrowserIcon, FlagIcon, InfoChip, TooltipScope } from '@/components/admin/platformIcons';
import { Globe, Languages } from 'lucide-react';

const SECTION_META: Record<string, { name: string; color: string }> = Object.fromEntries(
  BUILD_GROUPS.map((g) => [g.id, { name: g.name, color: g.color }]),
);

// Human labels for the onboarding/funnel events shown per session.

// Set of section ids each Pokemon is a DEFAULT option for (its archetype /
// category memberships). Used only to FLAG when a user placed a Pokemon in a
// section it isn't a default for — not to reassign or group anything.
const DEFAULT_SECTIONS_OF = (() => {
  const map = new Map<number, Set<string>>();
  const archIds = new Map<string, Set<number>>();
  for (const a of ARCHETYPES) archIds.set(a.id, new Set(a.pokemonIds));
  for (const p of getAllPokemon()) {
    const set = new Set<string>();
    for (const g of BUILD_GROUPS) {
      if (g.filterType === 'archetype' && g.filterId && archIds.get(g.filterId)?.has(p.id)) set.add(g.id);
      else if (g.filterType === 'category' && g.filterId && getCategoryById(g.filterId)?.filter(p)) set.add(g.id);
      else if (g.filterType === null) set.add(g.id); // 'other' catch-all accepts anything
    }
    map.set(p.id, set);
  }
  return map;
})();

/** True when the user placed this Pokemon in a section it is NOT a default
 *  option for — the signal of interest. The catch-all 'other' never counts. */
function isOffSection(id: number, sectionId: string): boolean {
  if (sectionId === 'other') return false;
  return !(DEFAULT_SECTIONS_OF.get(id)?.has(sectionId) ?? false);
}

/**
 * Admin-only analytics dashboard. Reached at `my151.app/?admin` (gated in
 * main.tsx). Reads the token-protected /api/submissions endpoint, which returns
 * one record per anonymous client plus precomputed aggregates.
 */

const TOKEN_KEY = 'p151-admin-token';
// Beside the token, so the dashboard opens on the tool you were last reading.
const TOOL_KEY = 'p151-admin-tool';
const PAGE_SIZE = 50;

/** Which tool's records every shared card reads. */
export type ToolSlice = 'all' | 'dex' | 'league';

export type SurvivalCurve = { survival: { t: number; s: number }[]; stats: { p50: number; p75: number; p90: number }; n: number };

interface BarGroup {
  label: string;
  count: number;
  color?: string;
  children: { label: string; count: number }[];
}

const SORT_LABELS: Record<string, string> = {
  'build-order': 'Build Order',
  regional: 'Regional',
  national: 'National',
  type: 'Type',
  custom: 'Custom',
};
const TOOL_TABS: { key: ToolSlice; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'dex', label: 'Dex builder' },
  { key: 'league', label: 'Gym leader maker' },
];

/**
 * The selected tool's aggregates, falling back to the top-level fields for a
 * deploy that predates `byTool`. The fallback is the dex slice, which is what
 * those fields have always held.
 */
function sliceOf(data: ApiResponse, tool: ToolSlice): Aggregates {
  const slice = data.byTool?.[tool];
  if (slice) return slice;
  return {
    users: data.totalUsers,
    activity: data.activity ?? [],
    retention: data.retention,
    timeCurves: data.timeCurves ?? {
      longest: { survival: data.timeSurvival, stats: data.timeStats, n: 0 },
      first: { survival: data.timeSurvival, stats: data.timeStats, n: 0 },
      all: { survival: data.timeSurvival, stats: data.timeStats, n: 0 },
    },
    countries: data.countries,
    languages: data.languages ?? {},
    locales: {},
    devices: data.devices,
    os: data.os,
    browsers: {},
    hours: data.hours,
    heatmap: data.heatmap,
  };
}

function loadToolSlice(): ToolSlice {
  try {
    const v = localStorage.getItem(TOOL_KEY);
    if (v === 'all' || v === 'dex' || v === 'league') return v;
  } catch {
    // localStorage may be unavailable
  }
  return 'all';
}

export interface ClientRecord {
  cid: string;
  firstTs: number;
  firstAt: string;
  lastTs: number;
  lastAt: string;
  submits: number;
  sessions?: number;
  maxSessionMs?: number;
  sessionMs?: number[];
  sessionLog?: { ts: number; ids: number[]; country?: string; dev?: string; events?: string[]; sections?: Record<string, number[]> }[];
  maxDepth: number;
  localHour: number;
  localDow?: number;
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
  switched?: string;
  device?: string;
  os?: string;
  browser?: string;
  everIds: number[];
  everSections?: Record<string, number[]>;
  latestIds: number[];
  latestSections?: Record<string, number[]>;
  completed: boolean;
  completedAt?: string;
  completedIds?: number[];
  exported: boolean;
  exportedAt?: string;
  exportedIds?: number[];
  exportSettings?: {
    sort: string;
    outlines: boolean;
    groupSpecial: boolean;
    showStats?: boolean;
  };
}

/** One tool's slice of every aggregate that does not care which tool it came
 *  from. `all` is one record per browser with both tools' sessions merged. */
export interface Aggregates {
  users: number;
  activity: { day: number; dau: number; rolling7: number }[];
  retention: { returning: number; activeLast7: number; newUsers: number };
  timeCurves: Record<'longest' | 'first' | 'all', SurvivalCurve>;
  countries: Record<string, number>;
  languages: Record<string, number>;
  locales: Record<string, number>;
  devices: Record<string, number>;
  os: Record<string, number>;
  browsers: Record<string, number>;
  hours: number[];
  heatmap: number[][];
}

/** One browser's gym leader maker record. Attached to their dex card when
 *  they have one, and a card of its own under the League slice. */
export interface LeagueUser {
  cid: string;
  submits: number;
  sessionMs: number[];
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
  switched?: string;
  device?: string;
  os?: string;
  browser?: string;
  hasDex: boolean;
  firstTs: number;
  firstAt: string;
  lastTs: number;
  lastAt: string;
  sessions: number;
  maxSessionMs: number;
  maxCards: number;
  maxSeats: number;
  latest: LeagueSummary;
  latestCards?: LeagueCard[];
  exportsCard: number;
  exportsLeague: number;
  exportedCardAt?: string;
  exportedLeagueAt?: string;
  sessionLog: { ts: number; summary: LeagueSummary; country?: string; dev?: string; page?: string; cards?: LeagueCard[] }[];
  order?: 'dex-first' | 'league-first' | 'same-day';
  gapDays?: number;
}

/** One seated evolution line: member ids, and the per-stage first row when the
 *  user dragged a stage off the level curve's default. */
export interface LeagueLine {
  b: number[];
  bd?: number[];
}

/** One trainer card's structure. No typed text by design — see describeLeague
 *  in src/league/model/leagueSummary.ts. */
export interface LeagueCard {
  i: number;
  t?: string;
  l: LeagueLine[];
  ace?: number;
  aceId?: number;
  pa?: number;
  tm?: number;
  /** [seat, pokemonId]. */
  lg?: [number, number][];
  /** [row, seat, formIndex, 0 mega | 1 dynamax]. */
  pw?: [number, number, number, number][];
}

export interface LeagueSummary {
  cards: number;
  seats: number;
  typed: number;
  named: number;
  aces: number;
  leagueNamed: boolean;
}

export interface ApiResponse {
  totalUsers: number;
  offset: number;
  limit: number;
  funnel: { users: number; completed: number; exported: number };
  funnelEvents?: Record<string, number>;
  /** Cross-tool identity, from the intersection of the two record hashes. */
  tools?: {
    dex: number;
    league: number;
    both: number;
    leagueOnly: number;
    dexOnly: number;
    dexExporters: number;
    dexExportersWhoOpenedLeague: number;
    leagueExporters: number;
    leagueExportersWithDex: number;
  };
  /** The gym leader maker's own funnel, from its records. */
  league?: {
    users: number;
    named: number;
    typed: number;
    fullLeague: number;
    exportedCard: number;
    exportedLeague: number;
    returning: number;
    activeLast7: number;
    activity: { day: number; dau: number }[];
    recent: {
      cid: string;
      firstAt: string;
      lastAt: string;
      sessions: number;
      maxSessionMs: number;
      latest: { cards: number; seats: number; typed: number; named: number; aces: number; leagueNamed: boolean };
      exportsCard: number;
      exportsLeague: number;
      country?: string;
      device?: string;
      hasDex: boolean;
    }[];
  };
  /** Per-user cohort samples: [firstTs, peakMon, peakLines, completed, exported]. */
  cohort?: [number, number, number, 0 | 1, 0 | 1][];
  /** Daily activity: per-day DAU and trailing-7-day rolling active count. */
  activity?: { day: number; dau: number; rolling7: number }[];
  /** Onboarding launch timestamp — the default cutoff for the pre/post slider. */
  onboardingLaunchTs?: number;
  exportSettings?: {
    tracked: number;
    outlines: number;
    groupSpecial: number;
    showStats: number;
    sorts: Record<string, number>;
  };
  retention: { returning: number; activeLast7: number; newUsers: number };
  multiSession?: number;
  timeSurvival: { t: number; s: number }[];
  timeStats: { p50: number; p75: number; p90: number };
  timeCurves?: Record<
    'longest' | 'first' | 'all',
    { survival: { t: number; s: number }[]; stats: { p50: number; p75: number; p90: number }; n: number }
  >;
  depthSurvival: { t: number; s: number }[];
  depthStats: { p50: number; p75: number; p90: number };
  depthCurves?: Record<
    'total' | 'first' | 'longest' | 'all',
    { survival: { t: number; s: number }[]; stats: { p50: number; p75: number; p90: number }; n: number }
  >;
  lineCurves?: Record<
    'total' | 'first' | 'longest' | 'all',
    { survival: { t: number; s: number }[]; stats: { p50: number; p75: number; p90: number }; n: number }
  >;
  monCurves?: Record<
    'total' | 'first' | 'longest' | 'all',
    { survival: { t: number; s: number }[]; stats: { p50: number; p75: number; p90: number }; n: number }
  >;
  countries: Record<string, number>;
  /** Raw Accept-Language tags (`en-US`, `pt-BR`, …) → user count. Folded into
   *  shipped locales client-side, using the app's own negotiation rules. */
  languages?: Record<string, number>;
  devices: Record<string, number>;
  os: Record<string, number>;
  hours: number[];
  heatmap: number[][];
  popularFinal: [string, number][];
  mostDropped: [string, number][];
  popularMin?: number;
  droppedMin?: number;
  popularBySection: Record<string, [string, number][]>;
  droppedBySection: Record<string, [string, number][]>;
  picksBySectionAll: Record<string, [string, number][]>;
  /** Every shared aggregate, per tool. Absent on an older deploy. */
  byTool?: Record<ToolSlice, Aggregates>;
  /** Dex cohort breakdowns (built / incomplete / completed). No "bounced" —
   *  a browser that never built has no record, so its device is unknowable. */
  cohorts?: Record<
    'built' | 'incomplete' | 'completed',
    { users: number; devices: Record<string, number>; countries: Record<string, number>; browsers: Record<string, number> }
  >;
  /** Build-depth survival by dex size, split by device. */
  depthByDevice?: Record<'all' | 'mobile' | 'desktop', SurvivalCurve>;
  /** Acquisition: referring host → dex / league landings. Forward-only, so
   *  empty until referrers accumulate. */
  referrerFlow?: { host: string; total: number; dex: number; league: number }[];
  /** Cross-tool order and weekly crossover, for browsers in both stores. */
  journeys?: {
    both: number;
    dexFirst: number;
    leagueFirst: number;
    sameDay: number;
    medianGapDays: number;
    p75GapDays: number;
    weekly: { week: number; newDex: number; dexToLeague7d: number; newLeague: number; leagueToDex7d: number }[];
  };
  /** How far a league gets: cards with a line, and seats. */
  leagueCurves?: { cards: SurvivalCurve; seats: SurvivalCurve };
  /** The dex record for each browser on this page of league users. */
  dexByCid?: Record<string, ClientRecord>;
  /** The league record for each browser on this page of dex users. */
  leagueByCid?: Record<string, LeagueUser>;
  /** The gym leader maker's own user list, paged like `records`. */
  leagueUsers?: LeagueUser[];
  totalLeagueUsers?: number;
  records: ClientRecord[];
}

function relativeTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Format a whole-seconds value as a compact duration: 45s, 3m, 1h 5m. */
function activeDayCount(rec: ClientRecord): number {
  const days = new Set<string>();
  for (const s of rec.sessionLog ?? []) days.add(new Date(s.ts).toDateString());
  if (days.size === 0) {
    days.add(new Date(rec.firstTs).toDateString());
    days.add(new Date(rec.lastTs).toDateString());
  }
  return days.size;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
}


function flag(country?: string): string {
  if (!country || country.length !== 2) return '';
  const cc = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Human-readable language for a BCP-47 tag: "es-ES" → "Spanish (es-ES)".
 *  This is the browser's Accept-Language preference — i.e. the language the
 *  app would auto-detect for this user — not an in-app selection. Falls back
 *  to the raw tag when Intl can't resolve the subtag. */
let langNames: Intl.DisplayNames | null | undefined;
function langLabel(tag?: string): string | undefined {
  if (!tag) return undefined;
  if (langNames === undefined) {
    try {
      langNames = new Intl.DisplayNames(['en'], { type: 'language' });
    } catch {
      langNames = null;
    }
  }
  const base = tag.split('-')[0];
  try {
    const name = langNames?.of(base);
    if (name && name.toLowerCase() !== base.toLowerCase()) return `${name} (${tag})`;
  } catch {
    /* unresolvable subtag — fall through to the raw tag */
  }
  return tag;
}

/** Language name only, no tag: "es-ES" → "Spanish". Falls back to the tag. */
function langName(tag?: string): string | undefined {
  if (!tag) return undefined;
  if (langNames === undefined) {
    try {
      langNames = new Intl.DisplayNames(['en'], { type: 'language' });
    } catch {
      langNames = null;
    }
  }
  try {
    const name = langNames?.of(tag.split('-')[0]);
    if (name) return name;
  } catch {
    /* unresolvable subtag */
  }
  return tag;
}

/** Country name from an ISO code: "CZ" → "Czechia". Falls back to the code. */
let regionNames: Intl.DisplayNames | null | undefined;
function countryName(code?: string): string | undefined {
  if (!code) return undefined;
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    const name = regionNames?.of(code.toUpperCase());
    if (name) return name;
  } catch {
    /* unresolvable code */
  }
  return code;
}

/** Same primary language subtag, ignoring script/region — so a served
 *  "zh-Hans" is not reported as disagreeing with a browser's "zh-CN". */
function sameBaseLang(a: string, b: string): boolean {
  return a.split('-')[0].toLowerCase() === b.split('-')[0].toLowerCase();
}

function localTime(when: number, tz?: string): string | null {
  if (!tz) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(when);
  } catch {
    return null;
  }
}

async function fetchDashboard(token: string, limit: number, offset: number): Promise<ApiResponse> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`/api/submissions?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Invalid admin token.');
  if (res.status === 503) throw new Error('Admin access is not configured on the server (ADMIN_TOKEN is not set).');
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return res.json() as Promise<ApiResponse>;
}

// ---------- presentational bits ----------

/**
 * The tools since the launch of the hub and the gym leader maker: how many
 * browsers used each, how many used both, and whether one tool's exporters
 * try the other. Every number is computed on read from the two record
 * hashes, so it reaches back to each tool's first beacon.
 */
function InfoDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="bg-card rounded-lg shadow-elevated max-w-md w-full max-h-[80vh] overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="text-sm font-medium">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Beacons the server received but could not record — the only losses it can
 * see. Silence here does not mean nothing was lost: it means nothing was lost
 * *after* the request arrived, which is the point of the counter.
 */
function BeaconDropNotice({ events }: { events?: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const live = liveDropReasons(events);
  const total = live.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return null;

  return (
    <>
      {/* One flowing paragraph, not a flex row: the reason list now names each
          tool, so it fills the width and a flex sibling button is pushed onto a
          line of its own. Inline, the button stays with the text it explains. */}
      <p className="text-[0.65rem] text-amber-600 mt-2">
        ⚠ {total} beacons dropped server-side (
        {live.map((d) => `${DROP_TOOL_LABEL[d.tool]} ${d.reason} ${d.count}`).join(' · ')}){' '}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="What does this mean?"
          className="w-4 h-4 shrink-0 rounded-full border border-amber-600 text-amber-600 leading-none text-[0.6rem] cursor-pointer align-middle"
        >
          i
        </button>
      </p>
      {open && (
        <InfoDialog title="Beacons dropped server-side" onClose={() => setOpen(false)}>
          <p className="text-xs text-muted-foreground mb-3">
            A beacon is one progress report from someone's browser. These reached the server but
            were not recorded, so the activity they described is missing from every number on this
            page. Each tool keeps its own counters, so a drop names the store that lost it.
          </p>
          <div className="flex flex-col gap-3">
            {live.map(({ tool, reason, count }) => {
              const info = DROP_REASON_INFO[reason];
              return (
                <div key={`${tool}:${reason}`}>
                  <p className="text-xs font-medium">
                    {DROP_TOOL_LABEL[tool]} · {info ? info.title : reason} · {count}
                  </p>
                  {info ? (
                    <>
                      <p className="text-xs text-muted-foreground mt-0.5">{info.what}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium text-foreground">Reading the stats: </span>
                        {info.reading}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      No description for this reason yet. It was added to the server after this
                      panel was written.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
            These are only the losses the server can see. If someone is missing from the dashboard
            and this notice is absent, the loss happened earlier — in their browser, or the request
            never left their device.
          </p>
        </InfoDialog>
      )}
    </>
  );
}

/** Grid of small sprites with the pick-count beneath — ~9-10 per row. */
function PopularGrid({ rows }: { rows: [string, number][] }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No data yet.</p>;
  return (
    <div className="grid grid-cols-9 gap-1">
      {rows.map(([id, n]) => {
        const p = getPokemonById(Number(id));
        return (
          <div
            key={id}
            className="flex flex-col items-center"
            title={p ? `#${id} ${displayName(p.name)}: ${n}` : `#${id}: ${n}`}
          >
            <div className="w-full aspect-square flex items-center justify-center">
              {p ? (
                <img
                  src={p.sprite}
                  alt={p.name}
                  width={36}
                  height={36}
                  loading="lazy"
                  className="w-full h-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <span className="text-[0.55rem] text-muted-foreground">#{id}</span>
              )}
            </div>
            <span className="text-[0.65rem] tabular-nums leading-none">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A preview grid (top N) with a "View all" modal. An optional "By section"
 *  toggle (shown only when section data exists) groups picks under the section
 *  users actually placed them in, in the build page's current order. */
function SectionGroupedGrids({ bySection }: { bySection: Record<string, [string, number][]> }) {
  const order = BUILD_GROUPS.map((g) => g.id);
  const sids = Object.keys(bySection).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return (
    <div className="flex flex-col gap-3">
      {sids.map((sid) => {
        const meta = SECTION_META[sid];
        const rows = bySection[sid];
        const subtotal = rows.reduce((a, [, n]) => a + n, 0);
        return (
          <div key={sid}>
            <div className="text-xs font-medium mb-1 flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: meta?.color ?? '#9ca3af' }} />
              {meta?.name ?? sid} <span className="text-muted-foreground font-normal">· {subtotal}</span>
            </div>
            <PopularGrid rows={rows} />
          </div>
        );
      })}
    </div>
  );
}

/** Survival (drop-off) curve: % of sessions still active at each x. The
 *  steepest segment = where users churn. Renders an SVG line with a shaded
 *  area, gridlines, and the biggest single-step drop highlighted. `fmtX`
 *  formats the x-axis (seconds → time, or a raw count). */
function SpriteRow({ ids }: { ids: number[] }) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {ids.map((id, idx) => {
        const p = getPokemonById(id);
        return (
          <div
            key={`${id}-${idx}`}
            title={p ? `#${id} ${displayName(p.name)}` : `#${id}`}
            className="w-6 h-6 shrink-0 flex items-center justify-center"
          >
            {p ? (
              <img
                src={p.sprite}
                alt={p.name}
                width={24}
                height={24}
                loading="lazy"
                decoding="async"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <span className="text-[0.5rem] text-muted-foreground">#{id}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Facts a detail header renders: id plus geo, platform, and languages. */
interface HeaderRec {
  cid: string;
  country?: string;
  region?: string;
  device?: string;
  os?: string;
  browser?: string;
  lang?: string;
  locale?: string;
  switched?: string;
}

/** Middle-truncate a long id to first two + last four, so it never wraps. A
 *  short, already-elided fixture id is left as-is. */
function middleId(cid: string): string {
  if (cid.length <= 8 || cid.includes('…')) return cid;
  return `${cid.slice(0, 2)}…${cid.slice(-4)}`;
}

const KIND_WORD = { browser: 'Browser', served: 'Served', switched: 'Switched' } as const;
const langAbbr = (tag: string) => tag.split('-')[0].toUpperCase();

const POKEBALL_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" width={13} height={13} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h6M15 12h6" />
    <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
  </svg>
);

/** The languages chip, abbreviated with a press/hover tooltip. Three sources —
 *  the browser default (globe), the language we served (poké ball), and any
 *  manual switch (translation) — collapse to one code when they agree, else list
 *  browser › served › switched; the tooltip spells the full names. */
function LanguageChip({ lang, locale, switched }: { lang?: string; locale?: string; switched?: string }) {
  const items = [
    lang ? { tag: lang, name: langName(lang), kind: 'browser' as const } : null,
    locale ? { tag: locale, name: langName(locale), kind: 'served' as const } : null,
    switched ? { tag: switched, name: langName(switched), kind: 'switched' as const } : null,
  ].filter(Boolean) as { tag: string; name?: string; kind: 'browser' | 'served' | 'switched' }[];
  if (items.length === 0) return null;
  const allSame = items.every((it) => sameBaseLang(it.tag, items[0].tag));
  if (allSame) {
    return (
      <InfoChip label={items[0].name ?? items[0].tag}>
        <Globe className="h-[13px] w-[13px]" />
        <span className="text-xs font-medium">{langAbbr(items[0].tag)}</span>
      </InfoChip>
    );
  }
  const label = items.map((it) => `${KIND_WORD[it.kind]} ${it.name ?? it.tag}`).join(' › ');
  return (
    <InfoChip label={label}>
      {items.map((it, i) => (
        <span key={it.kind} className="flex items-center gap-0.5">
          {i > 0 && <span className="px-0.5 text-muted-foreground/50">›</span>}
          {it.kind === 'browser' && <Globe className="h-[13px] w-[13px]" />}
          {it.kind === 'served' && <span className="[&>svg]:h-[13px] [&>svg]:w-[13px]">{POKEBALL_SVG}</span>}
          {it.kind === 'switched' && <Languages className="h-[13px] w-[13px]" />}
          <span className="text-xs font-medium">{langAbbr(it.tag)}</span>
        </span>
      ))}
    </InfoChip>
  );
}

/** Dex / League switch on a user page. A tool the browser never used stays
 *  visible and greyed, so the control's shape does not jump. */
function UserToolSeg({
  value,
  onChange,
  hasDex,
  hasLeague,
}: {
  value: 'dex' | 'league';
  onChange: (k: 'dex' | 'league') => void;
  hasDex: boolean;
  hasLeague: boolean;
}) {
  const opts = [
    { key: 'dex' as const, label: 'Dex', on: hasDex },
    { key: 'league' as const, label: 'League', on: hasLeague },
  ];
  return (
    <div role="group" aria-label="This browser's tools" className="flex shrink-0 items-center gap-0.5">
      {opts.map((o) => {
        const pressed = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={pressed}
            disabled={!o.on}
            title={o.on ? undefined : `No ${o.label.toLowerCase()} for this browser`}
            onClick={() => o.on && onChange(o.key)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold',
              !o.on && 'cursor-not-allowed opacity-40',
              o.on && pressed && 'border-foreground bg-foreground text-card',
              o.on && !pressed && 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Consolidated detail header: Back, the middle-truncated id, the dex/league
 *  toggle, and the geo / platform / language chips on one rail. */
function DetailHeader({
  rec,
  onBack,
  tool,
  onTool,
  hasDex,
  hasLeague,
}: {
  rec: HeaderRec;
  onBack: () => void;
  tool: 'dex' | 'league';
  onTool: (k: 'dex' | 'league') => void;
  hasDex: boolean;
  hasLeague: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
    <div className="flex flex-nowrap items-center gap-x-2 overflow-hidden">
      <button type="button" onClick={onBack} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        ‹ Back
      </button>
      <span className="shrink-0 text-sm font-bold tabular-nums" title={rec.cid}>
        {middleId(rec.cid)}
      </span>
      <span className="hidden md:inline-flex">
        <UserToolSeg value={tool} onChange={onTool} hasDex={hasDex} hasLeague={hasLeague} />
      </span>
      <TooltipScope>
        <div className="ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto">
          {rec.country && (
            <InfoChip label={`${countryName(rec.country)}${rec.region ? ' · ' + rec.region : ''}`}>
              <FlagIcon country={rec.country} />
            </InfoChip>
          )}
          {rec.device && (
            <InfoChip label={rec.device}>
              <DeviceIcon value={rec.device} />
            </InfoChip>
          )}
          {rec.os && (
            <InfoChip label={rec.os}>
              <OsIcon value={rec.os} />
            </InfoChip>
          )}
          {rec.browser && (
            <InfoChip label={rec.browser}>
              <BrowserIcon value={rec.browser} />
            </InfoChip>
          )}
          <LanguageChip lang={rec.lang} locale={rec.locale} switched={rec.switched} />
        </div>
      </TooltipScope>
    </div>
    <div className="md:hidden">
      <UserToolSeg value={tool} onChange={onTool} hasDex={hasDex} hasLeague={hasLeague} />
    </div>
    </div>
  );
}

/** Two compact, fixed-width stat chips that flank the scrubber rail (or, for a
 *  single-session browser, split the width where the scrubber would be). Both
 *  share one two-row layout with fixed row heights, so the top values and the
 *  bottom captions line up across the pair. */
function RailStat({ top, bottom, width, full }: { top: React.ReactNode; bottom: React.ReactNode; width: string; full?: boolean }) {
  return (
    <div className={`flex h-9 flex-col items-center justify-center rounded-lg border border-border bg-card px-2 text-center tabular-nums ${full ? 'flex-1' : width}`}>
      <div className="flex h-[16px] items-center leading-none whitespace-nowrap">{top}</div>
      <div className="flex h-[11px] items-center whitespace-nowrap text-[0.6rem] leading-none text-muted-foreground">{bottom}</div>
    </div>
  );
}
function SessionsChip({ sessions, days, full }: { sessions: number; days: number; full?: boolean }) {
  return (
    <RailStat
      width="w-[82px] md:w-[8.5rem]"
      full={full}
      top={
        <>
          <span className="text-sm font-bold leading-none">{sessions}</span>&nbsp;<span className="text-[0.6rem] leading-none text-muted-foreground">{sessions === 1 ? 'session' : 'sessions'}</span>
        </>
      }
      bottom={days === 1 ? '1 day' : `${days} days`}
    />
  );
}
function TimeChip({ ms, full }: { ms: number; full?: boolean }) {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return <RailStat width="w-[72px] md:w-[7rem]" full={full} top={<span className="text-[0.8rem] font-bold leading-none">{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>} bottom="time spent" />;
}

function tidySessions<T extends { ts: number }>(
  raw: T[],
  sessionMs: number[] | undefined,
  idsOf: (s: T) => number[],
  countsOf?: (s: T) => SessionCounts,
): { log: T[]; ms: number[] } {
  const sorted = sortSessions(raw, sessionMs ?? []);
  const kept = withoutDropRestorePhantoms(sorted.log, idsOf, countsOf);
  const keep = new Set(kept);
  return {
    log: kept,
    ms: sorted.log.flatMap((s, i) => (keep.has(s) ? [sorted.ms[i]] : [])),
  };
}

function leagueSessionIds(s: { cards?: LeagueCard[] }): number[] {
  return (s.cards ?? []).flatMap((c) => c.l.flatMap((line) => line.b));
}

/** Dex user body: session timeline + the build at the scrubbed moment. */
function DexDetailBody({ rec }: { rec: ClientRecord }) {
  const { log, ms } = tidySessions(rec.sessionLog ?? [], rec.sessionMs, (s) => s.ids);
  const [i, setI] = useState(Math.max(0, log.length - 1));
  const points: TimelinePoint[] = log.map((s, k) => {
    const prev = k ? new Set(log[k - 1].ids) : new Set<number>();
    const now = new Set(s.ids);
    const added = s.ids.filter((id) => !prev.has(id)).length;
    const removed = k ? log[k - 1].ids.filter((id) => !now.has(id)).length : 0;
    return {
      t: s.ts,
      count: s.ids.length,
      net: s.ids.length,
      added,
      removed,
      dur: ms[k] != null ? ms[k] / 1000 : undefined,
      ev: s.events,
    };
  });
  const idx = Math.min(i, Math.max(0, log.length - 1));
  const cur = log[idx];
  const sections = cur?.sections ?? rec.latestSections;
  const presentIds = cur?.ids ?? rec.latestIds ?? [];
  const sectionedSet = new Set(Object.values(sections ?? {}).flat());
  const offIds = presentIds.filter((id) => !sectionedSet.has(id));
  const peak = Math.max(0, ...points.map((p) => p.count));
  const totalMs = ms.reduce((a, b) => a + b, 0);

  const t0 = log.length ? log[0].ts : 0;
  const t1 = log.length ? log[log.length - 1].ts : 0;
  const clampT = (t: number) => Math.max(t0, Math.min(t1, t));
  const milestones: { t: number; label: string; tone?: 'export' | 'muted' }[] =
    rec.exported && rec.exportedAt
      ? [{ t: clampT(Date.parse(rec.exportedAt)), label: 'export', tone: 'export' }]
      : log.length
        ? [{ t: t1, label: 'no exports', tone: 'muted' }]
        : [];

  const snapshot = (
    <>
      {sections && Object.keys(sections).length > 0 ? (
        <OutlinedDex sections={sections} presentIds={presentIds} />
      ) : presentIds.length > 0 ? (
        <SpriteRow ids={presentIds} />
      ) : (
        <p className="text-xs text-muted-foreground">Empty at this point.</p>
      )}
      {offIds.length > 0 && (
        <div className="rounded-lg border border-dashed border-[var(--color-off)]/60 p-3">
          <div className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'var(--color-border)' }} />
            Section not captured
            <span className="text-muted-foreground/70">{offIds.length}</span>
          </div>
          <p className="mb-1.5 text-[0.7rem] text-muted-foreground/80">These sit in this session's recorded build, but their section was not captured. Older sessions and exports from before a recent update can omit it. In the app, every Pokémon is in a section.</p>
          <SpriteRow ids={offIds} />
        </div>
      )}
    </>
  );

  if (points.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">No session history.</p>
        <div className="min-h-0 flex-1 overflow-auto">{snapshot}</div>
      </div>
    );
  }

  return (
    <SessionTimeline
      points={points}
      index={idx}
      onIndex={setI}
      countUnit="of 151"
      peakLabel={`${peak} / 151`}
      milestones={milestones}
      tz={rec.tz}
      leftChip={<SessionsChip sessions={rec.sessions ?? log.length} days={activeDayCount(rec)} full={log.length <= 1} />}
      rightChip={<TimeChip ms={totalMs} full={log.length <= 1} />}
    >
      {snapshot}
    </SessionTimeline>
  );
}

/** The league timeline + board, reused as a page and as the dex page's league
 *  section. */
function LeagueDetailBody({ league }: { league: LeagueUser }) {
  const { log, ms } = tidySessions(
    league.sessionLog ?? [],
    league.sessionMs,
    leagueSessionIds,
    (s) => s.summary,
  );
  const [i, setI] = useState(Math.max(0, log.length - 1));
  const memberSet = (cards?: LeagueCard[]) => new Set((cards ?? []).flatMap((c) => c.l.flatMap((line) => line.b)));
  const cardsOf = (k: number) => {
    const c = log[k]?.cards;
    return c && c.length ? c : null;
  };
  const nets = log.map((s, k) => {
    const c = cardsOf(k);
    return c ? memberSet(c).size : s.summary.seats;
  });
  const points: TimelinePoint[] = log.map((s, k) => {
    const nowCards = cardsOf(k);
    const prevCards = k > 0 ? cardsOf(k - 1) : null;
    let added = 0;
    let removed = 0;
    if (nowCards && prevCards) {
      const now = memberSet(nowCards);
      const prev = memberSet(prevCards);
      added = [...now].filter((x) => !prev.has(x)).length;
      removed = [...prev].filter((x) => !now.has(x)).length;
    } else if (k === 0) {
      added = nets[0];
    } else {
      added = Math.max(0, nets[k] - nets[k - 1]);
      removed = Math.max(0, nets[k - 1] - nets[k]);
    }
    return {
      t: s.ts,
      count: s.summary.cards,
      net: nets[k],
      added,
      removed,
      dur: ms[k] != null ? ms[k] / 1000 : undefined,
    };
  });
  const idx = Math.min(i, Math.max(0, log.length - 1));
  const cur = log[idx];
  const peak = Math.max(0, ...points.map((p) => p.net));
  const totalMs = ms.reduce((a, b) => a + b, 0);
  const t0 = log.length ? log[0].ts : 0;
  const t1 = log.length ? log[log.length - 1].ts : 0;
  const clampT = (t: number) => Math.max(t0, Math.min(t1, t));
  const days = Math.max(1, Math.round((t1 - t0) / 86_400_000) + 1);
  const milestones: { t: number; label: string; tone?: 'export' | 'muted' }[] = [];
  if (league.exportedCardAt) {
    milestones.push({ t: clampT(Date.parse(league.exportedCardAt)), label: 'card', tone: 'export' });
  }
  if (league.exportedLeagueAt) {
    milestones.push({ t: clampT(Date.parse(league.exportedLeagueAt)), label: 'league', tone: 'export' });
  }
  if (milestones.length === 0 && log.length) {
    milestones.push({ t: t1, label: 'no exports', tone: 'muted' });
  }

  const board =
    cur?.cards && cur.cards.length > 0 ? (
      <LeagueVisitBoard cards={cur.cards} />
    ) : league.latestCards && league.latestCards.length > 0 ? (
      <LeagueVisitBoard cards={league.latestCards} />
    ) : (
      <p className="text-xs text-muted-foreground">Structure not captured for this session.</p>
    );

  if (points.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
        <p className="text-xs text-muted-foreground">No session history.</p>
        {board}
      </div>
    );
  }

  return (
    <SessionTimeline
      points={points}
      index={idx}
      onIndex={setI}
      countUnit={`of ${CARD_COUNT}`}
      peakLabel={`${peak} seated`}
      milestones={milestones}
      tz={league.tz}
      leftChip={<SessionsChip sessions={log.length} days={days} full={log.length <= 1} />}
      rightChip={<TimeChip ms={totalMs} full={log.length <= 1} />}
    >
      {board}
    </SessionTimeline>
  );
}

function headerFrom(dex?: ClientRecord, league?: LeagueUser): HeaderRec | null {
  const src = dex ?? league;
  if (!src) return null;
  return {
    cid: src.cid,
    country: src.country,
    region: src.region,
    device: src.device,
    os: src.os,
    browser: src.browser,
    lang: src.lang,
    locale: src.locale,
    switched: src.switched,
  };
}

/** One browser: header, tool toggle, then that tool's timeline. */
function UserDetailPage({
  tool,
  onTool,
  dex,
  league,
  onBack,
}: {
  tool: 'dex' | 'league';
  onTool: (k: 'dex' | 'league') => void;
  dex?: ClientRecord;
  league?: LeagueUser;
  onBack: () => void;
}) {
  const rec = headerFrom(dex, league);
  if (!rec) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      <div className="shrink-0">
        <DetailHeader rec={rec} onBack={onBack} tool={tool} onTool={onTool} hasDex={!!dex} hasLeague={!!league} />
      </div>
      {tool === 'dex' && dex && <DexDetailBody rec={dex} />}
      {tool === 'league' && league && <LeagueDetailBody league={league} />}
    </div>
  );
}

function regionGroups(countries: Record<string, number>): BarGroup[] {
  const byRegion = new Map<string, { label: string; count: number }[]>();
  for (const [cc, n] of Object.entries(countries)) {
    const list = byRegion.get(regionOf(cc)) ?? [];
    list.push({ label: `${flag(cc)} ${cc}`, count: n });
    byRegion.set(regionOf(cc), list);
  }
  return [...byRegion.entries()]
    .map(([label, children]) => ({
      label,
      count: children.reduce((sum, c) => sum + c.count, 0),
      color: REGION_COLORS[label as Region],
      children: children.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Fold raw Accept-Language tags into one row per language.
 *
 * Tags run through the app's own negotiation, so `en-GB`, `en-CA` and `en-US`
 * land on the single locale they would actually be served, and `zh-CN` lands on
 * `zh-Hans` rather than being lumped with `zh-Hant`. A tag that matches nothing
 * we ship folds to its primary subtag instead and is marked — those rows are
 * the localisation backlog, ranked by how many users are waiting in it.
 */
function fmtExportSettings(s: NonNullable<ClientRecord['exportSettings']>): string {
  const parts = [SORT_LABELS[s.sort] ?? s.sort];
  if (s.outlines) parts.push('outlines');
  parts.push(s.groupSpecial ? 'specials grouped' : 'specials inline');
  if (s.showStats) parts.push('stats');
  return parts.join(' · ');
}

function UserCard({ rec, league, onDelete, onOpen, zIndex, stickyOffset }: { rec: ClientRecord; league?: LeagueUser; onDelete: (rec: ClientRecord) => void; onOpen: () => void; zIndex: number; stickyOffset: number }) {
  // Two-step delete: first click arms, second confirms. Auto-disarms after a
  // few seconds so a forgotten armed button can't be hit later by accident.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!confirmingDelete) return;
    const t = setTimeout(() => setConfirmingDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingDelete]);
  const cardRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const userLocal = localTime(rec.lastTs, rec.tz);
  const ctx = [
    rec.country && `${flag(rec.country)} ${rec.country}${rec.region ? '/' + rec.region : ''}`,
    [rec.device, rec.os, rec.browser].filter(Boolean).join(' · '),
    // What the app actually rendered in. Records predating locale reporting
    // have only the Accept-Language header, which is labelled as such so a
    // browser preference is never misread as the language we served.
    rec.locale ? `🗣 ${langLabel(rec.locale)}` : rec.lang && `🗣 ${langLabel(rec.lang)} · browser`,
    // When the browser asked for something else, the difference is the user's
    // own choice — a picker selection or a ?lang= link.
    rec.locale && rec.lang && !sameBaseLang(rec.locale, rec.lang)
      ? `browser: ${langLabel(rec.lang)}`
      : undefined,
  ].filter(Boolean);

  return (
    <section ref={cardRef} style={{ zIndex, scrollMarginTop: stickyOffset }}>
      <div ref={headerRef} className="sticky z-[5]" style={{ top: stickyOffset }}>
        <div className="h-4 bg-background" />
        <div className="rounded-lg bg-card p-3 shadow-elevated">
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <div className="text-sm">
              <span className="font-semibold">{new Date(rec.lastTs).toLocaleString()}</span>
              <span className="text-muted-foreground">
                {' '}· {relativeTime(rec.lastTs)} · {rec.submits} edit{rec.submits === 1 ? '' : 's'} · depth {rec.maxDepth}
              </span>
              {(rec.sessionMs?.length || rec.sessions) && (
                <span className="block text-xs text-muted-foreground">
                  {rec.sessions ?? rec.sessionMs?.length} session
                  {(rec.sessions ?? rec.sessionMs?.length) === 1 ? '' : 's'}
                  {/* Distinct calendar days this record was active on. Vercel
                      counts a *daily* unique visitor, so one person returning
                      over N days is roughly N visitors there and exactly one
                      user here — the single most confusing gap between the two
                      dashboards. Printing the day count makes the two numbers
                      reconcilable instead of contradictory. */}
                  {(() => {
                    const days = activeDayCount(rec);
                    return days > 1 ? ` across ${days} days` : '';
                  })()}
                  {rec.sessionMs?.length ? `: ${rec.sessionMs.map((ms) => fmtDuration(ms)).join(', ')}` : ''}
                </span>
              )}
              <span className="block text-xs text-muted-foreground">
                {rec.completed && <span className="text-primary font-medium">✓ completed </span>}
                {rec.exported && (
                  <span>
                    📷 exported
                    {rec.exportSettings && (
                      <span className="text-muted-foreground"> ({fmtExportSettings(rec.exportSettings)})</span>
                    )}{' '}
                  </span>
                )}
                {rec.lastTs - rec.firstTs >= 86_400_000 && <span>· returning</span>}
                {league && (
                  <span className="text-primary"> · 🏅 league ({league.maxCards}/{CARD_COUNT})</span>
                )}
                {userLocal && <> · their {userLocal}</>}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onOpen}>
                Builds ›
              </Button>
              {confirmingDelete ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setConfirmingDelete(false);
                      onDelete(rec);
                    }}
                  >
                    Confirm delete
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
          {ctx.length > 0 && (
            <div className="text-xs text-muted-foreground mb-1 flex flex-wrap gap-x-2">
              {ctx.map((c, i) => (
                <span key={i}>{c}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${Math.abs(n) === 1 ? one : many}`;
}

function LeagueUserCard({
  rec,
  onOpen,
  zIndex,
  stickyOffset,
}: {
  rec: LeagueUser;
  onOpen: () => void;
  zIndex: number;
  stickyOffset: number;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const userLocal = localTime(rec.lastTs, rec.tz);
  const ctx = [
    rec.country && `${flag(rec.country)} ${rec.country}${rec.region ? '/' + rec.region : ''}`,
    [rec.device, rec.os, rec.browser].filter(Boolean).join(' · '),
    rec.locale ? `🗣 ${langLabel(rec.locale)}` : rec.lang && `🗣 ${langLabel(rec.lang)} · browser`,
  ].filter(Boolean);

  return (
    <section ref={cardRef} style={{ zIndex, scrollMarginTop: stickyOffset }}>
      <div className="sticky z-[5]" style={{ top: stickyOffset }}>
        <div className="h-4 bg-background" />
        <div className="rounded-lg bg-card p-3 shadow-elevated">
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <div className="text-sm">
              <span className="font-semibold">{new Date(rec.lastTs).toLocaleString()}</span>
              <span className="text-muted-foreground">
                {' '}· {relativeTime(rec.lastTs)} · {rec.submits} edit{rec.submits === 1 ? '' : 's'}
              </span>
              <span className="block text-xs text-muted-foreground">
                {countLabel(rec.maxCards, 'trainer card', 'trainer cards')} filled of {CARD_COUNT} ·{' '}
                {countLabel(rec.maxSeats, 'seat', 'seats')} · {rec.sessions} session
                {rec.sessions === 1 ? '' : 's'}
                {rec.sessionMs.length > 0 && `: ${rec.sessionMs.map((ms) => fmtDuration(ms)).join(', ')}`}
              </span>
              <span className="block text-xs text-muted-foreground">
                {rec.maxCards >= CARD_COUNT && (
                  <span className="text-primary font-medium">✓ full league </span>
                )}
                {(rec.exportsCard > 0 || rec.exportsLeague > 0) && (
                  <span>📷 exported </span>
                )}
                {rec.lastTs - rec.firstTs >= 86_400_000 && <span>· returning </span>}
                {rec.hasDex ? (
                  <span className="text-primary">· 📕 has a dex</span>
                ) : (
                  <span>· league only</span>
                )}
                {userLocal && <> · their {userLocal}</>}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={onOpen}>
              Visits ›
            </Button>
          </div>
          {ctx.length > 0 && (
            <div className="text-xs text-muted-foreground mb-1 flex flex-wrap gap-x-2">
              {ctx.map((c, i) => (
                <span key={i}>{c}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Dashboard entry for picks: a one-row preview of the overall most-picked, with
 *  a button that opens the full per-section page. Kept short so it doesn't run
 *  the dashboard long with every section expanded. */
function WhatPeoplePick({
  mostBySection,
  n,
  onOpen,
}: {
  mostBySection: Record<string, [string, number][]>;
  n: number;
  onOpen: () => void;
}) {
  const top = useMemo<[string, number][]>(() => {
    const totals: Record<string, number> = {};
    for (const rows of Object.values(mostBySection)) for (const [id, c] of rows) totals[id] = (totals[id] ?? 0) + c;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 9);
  }, [mostBySection]);
  return (
    <Panel
      title="What people pick"
      sub={[`of ${n} dexes`]}
      actions={
        <Button variant="ghost" size="sm" onClick={onOpen}>
          Most picked ›
        </Button>
      }
    >
      {top.length > 0 ? <PopularGrid rows={top} /> : <p className="text-sm text-muted-foreground">No picks yet.</p>}
    </Panel>
  );
}

/** Full picks page: per-section grids, toggled between most-picked and the picks
 *  placed off their section. Reached from the dashboard entry. */
function PicksDetailPage({
  mostBySection,
  offBySection,
  n,
  onBack,
}: {
  mostBySection: Record<string, [string, number][]>;
  offBySection: Record<string, [string, number][]>;
  n: number;
  onBack: () => void;
}) {
  const [view, setView] = useState<'most' | 'off'>('most');
  const [excludeOneOffs, setExcludeOneOffs] = useState(false);
  const hasOff = Object.keys(offBySection).length > 0;
  // Off-section picks with the single-occurrence noise dropped, when asked.
  const offShown = useMemo<Record<string, [string, number][]>>(() => {
    if (!excludeOneOffs) return offBySection;
    const out: Record<string, [string, number][]> = {};
    for (const [sid, rows] of Object.entries(offBySection)) {
      const kept = rows.filter(([, c]) => c > 1);
      if (kept.length) out[sid] = kept;
    }
    return out;
  }, [offBySection, excludeOneOffs]);
  const offHasAny = Object.keys(offShown).length > 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
          ‹ Back
        </button>
        <span className="text-sm font-bold">What people pick</span>
        <span className="text-xs text-muted-foreground">of {n} dexes</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Seg
          ariaLabel="Picks metric"
          options={[
            { key: 'most', label: 'Most picked' },
            { key: 'off', label: 'Off-section' },
          ]}
          value={view}
          onChange={setView}
        />
        {/* Only meaningful once off-section is chosen — disclosed then. */}
        {view === 'off' && (
          <button
            type="button"
            aria-pressed={excludeOneOffs}
            onClick={() => setExcludeOneOffs((v) => !v)}
            className={cn(
              'h-7 rounded-full border px-2.5 text-xs font-medium',
              excludeOneOffs ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            Exclude one-offs
          </button>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{view === 'off' ? 'Off-section picks, grouped by the section they landed in.' : 'Most-picked, grouped by section.'}</div>
      {view === 'off' ? (
        hasOff && offHasAny ? (
          <SectionGroupedGrids bySection={offShown} />
        ) : (
          <p className="text-xs text-muted-foreground">{hasOff ? 'No off-section picks chosen more than once.' : 'No off-section picks.'}</p>
        )
      ) : (
        <SectionGroupedGrids bySection={mostBySection} />
      )}
    </div>
  );
}

export type AdminNavKey = ToolSlice | 'feedback';

/** Section nav: a bottom bar on mobile, an inline row on desktop. Splits the
 *  dashboard into All / Dex / League analytics and the Feedback page. */
function AdminNav({ value, onChange }: { value: AdminNavKey; onChange: (k: AdminNavKey) => void }) {
  const items: { key: AdminNavKey; label: string }[] = [
    { key: 'all', label: 'Suite' },
    { key: 'dex', label: 'Dex' },
    { key: 'league', label: 'League' },
    { key: 'feedback', label: 'Feedback' },
  ];
  return (
    <nav
      aria-label="Admin section"
      className="fixed inset-x-0 bottom-0 z-[90] flex justify-around gap-1 border-t border-border bg-card/95 px-2 py-2 backdrop-blur md:sticky md:top-0 md:mx-auto md:max-w-5xl md:justify-start md:border-t-0 md:border-b md:bg-card md:px-4 md:py-2 md:backdrop-blur-none"
    >
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(it.key)}
            className={cn(
              'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors md:flex-none',
              on ? 'bg-foreground text-card' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

// ---------- main ----------

/** What the detail pane shows: one browser's dex or league, or the picks page. */
type Detail = { kind: 'dex' | 'league'; cid: string } | { kind: 'picks' };

export function AdminPage() {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [tokenInput, setTokenInput] = useState('');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [tool, setTool] = useState<ToolSlice>(() => loadToolSlice());
  const [page, setPage] = useState<'analytics' | 'feedback'>('analytics');
  const [depthDevice, setDepthDevice] = useState<'all' | 'mobile' | 'desktop'>('all');
  const [cohort, setCohort] = useState<'built' | 'incomplete' | 'completed'>('built');
  const [flowView, setFlowView] = useState<'usage' | 'referrer'>('usage');
  // Clicking a preview opens a full detail page ({kind, cid}); Back clears it.
  const [detail, setDetail] = useState<Detail | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageHeaderRef = useRef<HTMLElement>(null);
  const [pageHeaderH, setPageHeaderH] = useState(0);

  useLayoutEffect(() => {
    if (pageHeaderRef.current) setPageHeaderH(pageHeaderRef.current.offsetHeight);
  });

  // Open a detail page from the dashboard, remembering the scroll position so
  // Back returns the reader to exactly where they were, not the top.
  const dashScrollRef = useRef(0);
  const openDetail = useCallback((d: Detail) => {
    dashScrollRef.current = window.scrollY;
    setDetail(d);
    window.scrollTo(0, 0);
  }, []);
  useLayoutEffect(() => {
    if (!detail) window.scrollTo(0, dashScrollRef.current);
  }, [detail]);

  const load = useCallback(async (tok: string, limit = PAGE_SIZE) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchDashboard(tok, limit, 0);
      setData(resp);
      setAuthed(true);
      setToken(tok);
      try {
        localStorage.setItem(TOKEN_KEY, tok);
      } catch {
        // localStorage may be unavailable
      }
    } catch (e) {
      setAuthed(false);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Demo mode (`/?admin&demo`): render the redesign against a fabricated,
    // self-consistent fixture, with no token and no network. The fixture chunk
    // is dynamically imported so it never ships in the real admin bundle. Used
    // for preview review of the design; production still requires the token.
    if (new URLSearchParams(window.location.search).has('demo')) {
      void import('./__fixtures__/sampleResponse').then((m) => {
        setData(m.sampleResponse);
        setAuthed(true);
      });
      return;
    }
    if (token) void load(token);
    // Run only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (!token || !data) return;
    setLoadingMore(true);
    try {
      const resp = await fetchDashboard(token, data.records.length + PAGE_SIZE, 0);
      setData(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoadingMore(false);
    }
  }, [token, data]);

  const deleteUser = useCallback(
    async (rec: ClientRecord) => {
      // Guarded by the two-step arm/confirm in UserCard; this just performs it.
      if (!token) return;
      setError(null);
      try {
        const res = await fetch('/api/delete-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cid: rec.cid }),
        });
        if (!res.ok) throw new Error(`Delete failed (${res.status}).`);
        setData((prev) =>
          prev
            ? { ...prev, totalUsers: Math.max(0, prev.totalUsers - 1), records: prev.records.filter((r) => r.cid !== rec.cid) }
            : prev,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed.');
      }
    },
    [token],
  );

  const pickTool = useCallback((next: ToolSlice) => {
    setTool(next);
    try {
      localStorage.setItem(TOOL_KEY, next);
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // localStorage may be unavailable
    }
    setToken(null);
    setAuthed(false);
    setData(null);
    setTokenInput('');
  }, []);

  // Off-section picks kept grouped by the section they landed in, so the picks
  // card can show them per section — the mirror of the most-picked-per-section
  // view. A section with no off-section picks is dropped.
  const offBySection = useMemo<Record<string, [string, number][]>>(() => {
    const bySec = data?.picksBySectionAll;
    if (!bySec) return {};
    const out: Record<string, [string, number][]> = {};
    for (const [sid, entries] of Object.entries(bySec)) {
      const offs = entries.filter(([id]) => isOffSection(Number(id), sid)).sort((a, b) => b[1] - a[1]);
      if (offs.length) out[sid] = offs;
    }
    return out;
  }, [data?.picksBySectionAll]);

  if (!authed) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 bg-background">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = tokenInput.trim();
            if (t) void load(t);
          }}
          className="w-full max-w-sm flex flex-col gap-3"
        >
          <h1 className="text-xl font-bold">
            <span className="text-primary">my151</span> · Analytics admin
          </h1>
          <p className="text-sm text-muted-foreground">Enter your admin token to view analytics.</p>
          <Input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Admin token"
            autoFocus
          />
          <Button type="submit" disabled={loading || !tokenInput.trim()}>
            {loading ? 'Checking…' : 'View analytics'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </div>
    );
  }

  const navKey: AdminNavKey = page === 'feedback' ? 'feedback' : tool;
  const onNav = (k: AdminNavKey) => {
    if (k === 'feedback') {
      setPage('feedback');
    } else {
      setPage('analytics');
      pickTool(k);
    }
  };
  const lockUser = detail?.kind === 'dex' || detail?.kind === 'league';

  return (
    <div className={cn('flex flex-col bg-background', lockUser ? 'h-dvh overflow-hidden' : 'min-h-dvh')}>
      <header ref={pageHeaderRef} className="sticky top-0 z-[100] border-b bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <h1 className="whitespace-nowrap text-lg font-bold">
            <span className="text-primary">my151</span> · Analytics
          </h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => token && void load(token)} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <AdminNav value={navKey} onChange={onNav} />

      <main
        className={cn(
          'mx-auto flex w-full max-w-5xl flex-1 flex-col px-4',
          lockUser ? 'min-h-0 gap-2 overflow-hidden pb-20 pt-2 md:pb-8' : 'gap-4 pb-24 pt-4 md:pb-8',
        )}
      >
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* A clicked preview opens a full detail page; Back returns here. */}
        {detail && data && (
          <div className={cn((detail.kind === 'league' || detail.kind === 'dex') && 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
          {(() => {
          if (detail.kind === 'picks') {
            const nDex = data.tools?.dex ?? data.funnel.users;
            return <PicksDetailPage mostBySection={data.popularBySection} offBySection={offBySection} n={nDex} onBack={() => setDetail(null)} />;
          }
          const bare = detail.cid.split('::')[0];
          const dex =
            data.records.find((r) => r.cid === detail.cid || r.cid.split('::')[0] === bare) ??
            data.dexByCid?.[detail.cid] ??
            data.dexByCid?.[bare];
          const league =
            data.leagueByCid?.[detail.cid] ??
            data.leagueByCid?.[bare] ??
            data.leagueUsers?.find((r) => r.cid === detail.cid || r.cid === bare);
          return (
            <UserDetailPage
              tool={detail.kind}
              onTool={(k) => setDetail({ kind: k, cid: detail.cid })}
              dex={dex}
              league={league}
              onBack={() => setDetail(null)}
            />
          );
          })()}
          </div>
        )}

        {!detail && page === 'feedback' &&
          (token ? <FeedbackCard token={token} /> : <p className="text-sm text-muted-foreground">Sign in to read feedback.</p>)}

        {!detail && page === 'analytics' && data && (() => {
          const slice = sliceOf(data, tool);
          const showDex = tool !== 'league';

          const f = data.funnel;
          const built = data.tools?.dex ?? f.users;
          const sawIntro = f.users;
          const bounced = Math.max(0, sawIntro - built);
          const incomplete = Math.max(0, built - f.completed);
          const keptPrivate = Math.max(0, f.completed - f.exported);

          const act = data.activity ?? slice.activity;
          const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const dateRange = act.length ? `${fmtDate(act[0].day)} – ${fmtDate(act[act.length - 1].day)} · as of ${fmtDate(act[act.length - 1].day)}` : '';

          const xt = data.tools;
          const xtTotal = xt ? xt.dexOnly + xt.both + xt.leagueOnly : 0;

          // Rollup helpers.
          const toRollup = (rec: Record<string, number>, max = 6): RollupRow[] => {
            const total = Object.values(rec).reduce((a, b) => a + b, 0) || 1;
            return Object.entries(rec)
              .sort((a, b) => b[1] - a[1])
              .slice(0, max)
              .map(([label, n]) => ({ label, pct: Math.round((n / total) * 100) }));
          };
          const regionRollup = (countries: Record<string, number>): RollupRow[] => {
            const groups = regionGroups(countries);
            const total = groups.reduce((s, g) => s + g.count, 0) || 1;
            return groups.slice(0, 5).map((g) => ({ label: g.label, pct: Math.round((g.count / total) * 100) }));
          };

          // Who: use cohort breakdowns when the endpoint provides them, else the
          // slice's own rollups (league, or an older deploy).
          const cohorts = showDex ? data.cohorts : undefined;
          const whoSrc = cohorts ? cohorts[cohort] : { devices: slice.devices, countries: slice.countries, browsers: slice.browsers, users: slice.users };
          const whoBuilt = cohorts?.built;
          const deltaVs = (rows: RollupRow[], baseRows: RollupRow[] | null): RollupRow[] =>
            !baseRows ? rows : rows.map((r) => {
              const b = baseRows.find((x) => x.label === r.label);
              return { ...r, delta: b ? r.pct - b.pct : undefined };
            });
          const baseDev = whoBuilt ? toRollup(whoBuilt.devices, 3) : null;
          const baseGeo = whoBuilt ? regionRollup(whoBuilt.countries) : null;
          const baseBr = whoBuilt ? toRollup(whoBuilt.browsers, 5) : null;
          const showDelta = !!cohorts && cohort !== 'built';

          // Build depth: device split when available, else the slice total.
          const depthCurve =
            (showDex && data.depthByDevice?.[depthDevice]) ?? data.monCurves?.total ?? data.depthCurves?.total ??
            (tool === 'league' ? data.leagueCurves?.cards : undefined);

          return (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-sm">
                <b className="tabular-nums">{sawIntro}</b> <span className="text-muted-foreground">saw intro</span>
              </span>
              <span className="text-sm">
                <b className="tabular-nums">{built}</b> <span className="text-muted-foreground">built a dex</span>
              </span>
              {xt && (
                <span className="text-sm">
                  <b className="tabular-nums">{xt.league}</b> <span className="text-muted-foreground">league</span>
                </span>
              )}
              {dateRange && <span className="text-[0.7rem] font-semibold text-muted-foreground">{dateRange}</span>}
            </div>

            {slice.activity.length > 0 && (
              <Panel title="Active browsers" sub={['daily', '7-day sum']}>
                <TrendChart key={tool} series={slice.activity} />
              </Panel>
            )}

            {showDex && <BeaconDropNotice events={data.funnelEvents} />}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {!showDex && (
                <Panel title="League activity" sub={[`${slice.users} browsers`]}>
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <Kpi emphasis value={slice.users} label="Browsers" />
                    <Kpi value={slice.retention.activeLast7} label="Active · 7d" />
                    <Kpi value={slice.retention.returning} label="Returning" />
                    {data.league && (
                      <Kpi value={data.league.exportedCard + data.league.exportedLeague} label="Exports" />
                    )}
                  </div>
                </Panel>
              )}

              {xt && (
                <Panel
                  title="Cross-tool"
                  sub={['dex & league']}
                  actions={<span className="text-[0.7rem] font-semibold tabular-nums text-muted-foreground">{xtTotal} browsers</span>}
                >
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <Kpi value={xt.dexOnly} label="Dex only" />
                    <Kpi value={xt.both} label="Both" denom={`n=${xt.league}`} />
                    <Kpi value={xt.leagueOnly} label="League only" denom={`n=${xt.league}`} />
                  </div>
                  {data.journeys && (
                    <div className="mt-4 flex flex-col gap-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">League → Dex</span>
                        <span className="flex items-center gap-1.5 font-bold tabular-nums">
                          {data.journeys.leagueFirst} / {xt.league}
                          {xt.league <= 5 && <Delta>n={xt.league} · too few to trend</Delta>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Dex → League</span>
                        <span className="font-bold tabular-nums">{data.journeys.dexFirst} / {built}</span>
                      </div>
                    </div>
                  )}
                </Panel>
              )}
            </div>

            {showDex && built > 0 && (
              <Panel
                title="Flows"
                sub={[flowView === 'referrer' ? 'referrer → landing' : 'usage funnel', tool === 'all' ? 'all tools' : 'dex']}
                actions={
                  data.referrerFlow && data.referrerFlow.length > 0 ? (
                    <Seg
                      ariaLabel="Flow"
                      options={[
                        { key: 'usage', label: 'Usage funnel' },
                        { key: 'referrer', label: 'Referrer → landing' },
                      ]}
                      value={flowView}
                      onChange={setFlowView}
                    />
                  ) : undefined
                }
              >
                {flowView === 'referrer' && data.referrerFlow && data.referrerFlow.length > 0 ? (
                  <FlowSankey
                    nodes={[
                      ...data.referrerFlow.map((r) => ({ name: r.host, role: 'neutral' as const })),
                      { name: 'Dex', role: 'success' as const },
                      { name: 'League', role: 'priv' as const },
                    ]}
                    links={data.referrerFlow.flatMap((r) => [
                      ...(r.dex > 0 ? [{ source: r.host, target: 'Dex', value: r.dex, role: 'success' as const }] : []),
                      ...(r.league > 0 ? [{ source: r.host, target: 'League', value: r.league, role: 'priv' as const }] : []),
                    ])}
                    ariaLabel={`Referrer to landing: ${data.referrerFlow.length} referring hosts split into dex and league landings.`}
                  />
                ) : (
                  <FlowSankey
                    // Order per depth: survivor first (top), sink after (bottom),
                    // so the trunk runs straight along the top and every
                    // drop-off peels downward without crossing.
                    nodes={[
                      { name: 'Saw intro', role: 'neutral' },
                      { name: 'Built', role: 'neutral' },
                      { name: 'Bounced', role: 'sink' },
                      { name: 'Completed', role: 'success' },
                      { name: 'Incomplete', role: 'sink' },
                      { name: 'Exported', role: 'success' },
                      { name: 'Kept private', role: 'priv' },
                    ]}
                    links={[
                      { source: 'Saw intro', target: 'Built', value: built, role: 'neutral' },
                      { source: 'Saw intro', target: 'Bounced', value: bounced, role: 'sink' },
                      { source: 'Built', target: 'Completed', value: f.completed, role: 'success' },
                      { source: 'Built', target: 'Incomplete', value: incomplete, role: 'sink' },
                      { source: 'Completed', target: 'Exported', value: f.exported, role: 'success' },
                      { source: 'Completed', target: 'Kept private', value: keptPrivate, role: 'priv' },
                    ]}
                    ariaLabel={`Usage funnel: ${sawIntro} saw intro, ${built} built, ${bounced} bounced; of ${built} built, ${f.completed} completed and ${incomplete} incomplete; of ${f.completed} completed, ${f.exported} exported and ${keptPrivate} kept private.`}
                  />
                )}
              </Panel>
            )}

            {depthCurve && (
              <Panel
                title="Build depth"
                sub={['where builders stop', `of ${depthCurve.n}`]}
                actions={
                  showDex && data.depthByDevice ? (
                    <Seg
                      ariaLabel="Device"
                      options={[
                        { key: 'all', label: 'All' },
                        { key: 'mobile', label: 'Mobile' },
                        { key: 'desktop', label: 'Desktop' },
                      ]}
                      value={depthDevice}
                      onChange={setDepthDevice}
                    />
                  ) : undefined
                }
              >
                <BuildDepthChart
                  curve={depthCurve}
                  xLabel={tool === 'league' ? 'cards' : 'Pokémon'}
                  ariaLabel="Build depth: browsers still building by size"
                />
              </Panel>
            )}

            <Panel
              title="Who"
              sub={cohorts ? [cohort, String(whoSrc.users ?? slice.users)] : [TOOL_TABS.find((t) => t.key === tool)?.label ?? '', String(slice.users)]}
              actions={
                cohorts ? (
                  <Seg
                    ariaLabel="Cohort"
                    options={[
                      { key: 'built', label: 'Built' },
                      { key: 'incomplete', label: 'Incomplete' },
                      { key: 'completed', label: 'Completed' },
                    ]}
                    value={cohort}
                    onChange={setCohort}
                  />
                ) : undefined
              }
            >
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-3">
                <div>
                  <div className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">Device</div>
                  <Rollup rows={showDelta ? deltaVs(toRollup(whoSrc.devices, 3), baseDev) : toRollup(whoSrc.devices, 3)} />
                </div>
                <div>
                  <div className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">Region</div>
                  <Rollup rows={showDelta ? deltaVs(regionRollup(whoSrc.countries), baseGeo) : regionRollup(whoSrc.countries)} />
                </div>
                <div>
                  <div className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">Browser</div>
                  <Rollup rows={showDelta ? deltaVs(toRollup(whoSrc.browsers, 5), baseBr) : toRollup(whoSrc.browsers, 5)} />
                </div>
              </div>
            </Panel>

            {showDex && (
              <WhatPeoplePick mostBySection={data.popularBySection} n={built} onOpen={() => openDetail({ kind: 'picks' })} />
            )}

            <Panel title="Newest browsers" sub={[showDex ? 'dex' : 'league', 'newest first']}>
              {showDex && data.records.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground">No users yet.</p>
              )}
              {showDex && (
                <div className="-mt-2 flex flex-col">
                  {data.records.map((rec, i) => (
                    <UserCard
                      key={rec.cid}
                      rec={rec}
                      league={data.leagueByCid?.[rec.cid]}
                      onDelete={deleteUser}
                      onOpen={() => openDetail({ kind: 'dex', cid: rec.cid })}
                      zIndex={data.records.length - i}
                      stickyOffset={pageHeaderH}
                    />
                  ))}
                </div>
              )}
              {!showDex && data.leagueUsers && (
                <div className="-mt-2 flex flex-col">
                  {data.leagueUsers.map((rec, i) => (
                    <LeagueUserCard
                      key={rec.cid}
                      rec={rec}
                      onOpen={() => openDetail({ kind: 'league', cid: rec.cid })}
                      zIndex={data.leagueUsers!.length - i}
                      stickyOffset={pageHeaderH}
                    />
                  ))}
                </div>
              )}
              {!showDex && (data.leagueUsers?.length ?? 0) === 0 && !loading && (
                <p className="text-sm text-muted-foreground">No league users yet.</p>
              )}
              {showDex && data.records.length < data.totalUsers && (
                <Button className="mt-3" variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : `Load more (${data.records.length} / ${data.totalUsers})`}
                </Button>
              )}
            </Panel>
          </>
          );
        })()}
      </main>
    </div>
  );
}
