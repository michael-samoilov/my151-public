import type {buildBrowser,RecordedUsage} from '../../../api/_dashboard';
import {RecordedUsagePanel} from './RecordedUsagePanel';
import {FavoriteDetailBody} from './FavoriteDetailBody';
import type {FavoritePicks,FavoriteUser,FavoriteUsageFunnel} from '../../../api/_favoriteAggregate';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { FeedbackCard } from '@/components/admin/FeedbackCard';
import { LeaguePicksPage, PicksDetailPage } from '@/components/admin/PicksDetailPage';
import { PickerPicksPage } from '@/components/admin/PickerPicksPage';
import { formatPreferenceStrength, pickerFace, preferencePreview } from '@/components/admin/pickerPicks';
import { ActiveUsersPanel } from '@/components/admin/charts/TrendChart';
import { applyActivityLabels } from '@/components/admin/charts/trendSeries';
import { FlowSankey } from '@/components/admin/charts/FlowSankey';
import { dexFunnelSankey, leagueFunnelSankey, favoriteFunnelSankey, referrerFlowSankey } from '@/lib/usageFunnels';
import type { Aggregates as ApiAggregates, DexUsageFunnel, LeagueUsageFunnel, SurvivalCurve as ApiSurvivalCurve } from '../../../api/_aggregate';
import { BuildDepthChart } from '@/components/admin/charts/BuildDepthChart';
import { Panel, Seg, Kpi } from '@/components/admin/ui';
import { ClampChip, PlatformStacks } from '@/components/admin/PlatformStacks';
import { WhoOrigin } from '@/components/admin/WhoOrigin';
import { HeatmapCard } from '@/components/admin/HeatmapCard';
import { clampedN, type PlatformJoint } from '@/lib/platformStacks';
import { filteredN, type WhoFilter } from '@/lib/whoOrigin';
import { Input } from '@/components/ui/input';
import { getPokemonById } from '@/hooks/usePokemonData';
import { getPokemonById as getLeaguePokemonById } from '@/league/data/catalog';
import { cn, displayName } from '@/lib/utils';
import { DROP_REASON_INFO, DROP_TOOL_LABEL, liveDropReasons, nearCapRows } from '@/lib/beaconDrops';
import { CARD_COUNT } from '../../../api/_leagueRecord';
import type { LeagueCardShape as ApiLeagueCard, LeagueSummary as ApiLeagueSummary } from '../../../api/_leagueRecord';
import type { ClientRecord as ApiClientRecord } from '../../../api/_shared';
import { sortSessions, withoutDropRestorePhantoms, type SessionCounts } from '../../../api/_sessionize';
import { SessionTimeline, type TimelinePoint } from '@/components/admin/charts/SessionTimeline';
import { distinctCalendarDays } from '@/components/admin/charts/sessionTimelineMath';
import { exportSurveySkipMarks, feedbackMarks, leagueSittingEv, type ChartMilestone } from '@/components/admin/charts/sessionMilestones';
import { useFeedbackList, type FeedbackItem, type FeedbackTool } from '@/components/admin/feedbackList';
import { apiBrowserLoader, useBrowserRecords, type BrowserLoader } from '@/components/admin/browserRecords';
import { OutlinedDex } from '@/components/admin/OutlinedDex';
import { SessionsChip, TimeChip } from '@/components/admin/SessionRailChips';
import { idsOutsideSections, keepMountedSections, useDexPresence } from '@/components/admin/dexPresence';
import { LeagueVisitBoard } from '@/components/admin/LeagueVisitBoard';
import { sessionCards } from '@/components/admin/leaguePlayhead';
import { CrossToolCard } from '@/components/admin/CrossToolCard';
import { SearchPerformancePanel } from '@/components/admin/SearchPerformancePanel';
import { RangeRibbon } from '@/components/admin/RangeRibbon';
import { RangeSlotContext } from '@/components/admin/rangeSlot';
import { isDashboardRange, type DashboardRange } from '../../../api/_range';
import { DeviceIcon, OsIcon, BrowserIcon, FlagIcon, InfoChip, TooltipScope } from '@/components/admin/platformIcons';
import type { SearchPerformanceView } from '@/lib/searchPerformanceView';
import {
  ARCHIVE_FILTER_OPTIONS,
  bareCid,
  FACET_KEYS,
  FACET_LABEL,
  FACET_UNKNOWN,
  facetLabel,
  formatWhen,
  langName,
  matchesArchiveFilter,
  suspectText,
  matchesFacetFilters,
  matchesToolFilter,
  previewLanguage,
  sameBaseLang,
  geoChipLabel,
  uiLanguage,
  TOOL_FILTER_OPTIONS,
  uniqueFacetValues,
  type ArchiveFilter,
  type FacetFilters,
  type FacetKey,
  type ToolFilter,
} from '@/components/admin/userPreview';
import { PreviewFilterMenu } from '@/components/admin/PreviewFilterMenu';
import { FitNowrap } from '@/components/admin/FitNowrap';
import { BrowserUsage, PreviewUsageScale } from '@/components/admin/PreviewUsage';
import { UsageCard } from '@/components/admin/UsageCard';
import { toolCells, totalTime, whenShapes, widestRow, type CardTime, type UsageSource, type ToolCell } from '@/components/admin/browserUsage';
import { VirtualRows } from '@/components/admin/VirtualRows';
import { Archive, ArchiveRestore, Globe, Languages, MessageSquare, Compass, MonitorSmartphone } from 'lucide-react';
import type { CrossToolSnapshot } from '../../../api/_crossTool';
import type { BrowserIndex, BrowserRow } from '../../../api/_dashboard';
import type { ExportSurveySkip } from '../../../api/_events';
import type { LeaguePicks } from '../../../api/_leaguePicks';

const TOKEN_KEY = 'p151-admin-token';
const TOOL_KEY = 'p151-admin-tool';
const RANGE_KEY = 'p151-admin-range';
const STALE_ON_RETURN_MS = 60_000;
const REFRESH_INTERVAL_MS = 5 * 60_000;
let latestLoad = 0;
const rangeCache = new Map<DashboardRange, { data: ApiResponse; at: number }>();

export type ToolSlice = 'all' | 'dex' | 'league' | 'favorites';

export type SurvivalCurve = ApiSurvivalCurve;

const TOOL_TABS: { key: ToolSlice; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'dex', label: 'Dex builder' },
  { key: 'league', label: 'Gym leader maker' },
  { key: 'favorites', label: 'Favorite Pokémon Picker' },
];

function sliceOf(data: ApiResponse, tool: ToolSlice): Aggregates {
  const slice = data.byTool?.[tool];
  if (slice) return slice;
  if(tool === 'favorites') return {users:0,activity:[],retention:{returning:0,newUsers:0},timeCurves:{longest:{survival:[],stats:{p50:0,p75:0,p90:0},n:0},first:{survival:[],stats:{p50:0,p75:0,p90:0},n:0},all:{survival:[],stats:{p50:0,p75:0,p90:0},n:0}},countries:{},languages:{},locales:{},devices:{},os:{},browsers:{}};
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
    joints: [],
    whoBuckets: [],
    hourly: [],
  };
}

function loadToolSlice(): ToolSlice {
  try {
    const v = localStorage.getItem(TOOL_KEY);
    if (v === 'all' || v === 'dex' || v === 'league' || v === 'favorites') return v;
  } catch {
    return 'all';
  }
  return 'all';
}

function loadRange(): DashboardRange {
  try {
    const v = localStorage.getItem(RANGE_KEY);
    if (v && isDashboardRange(v)) return v;
  } catch {
    return 'all';
  }
  return 'all';
}

export interface ClientRecord extends ApiClientRecord {
  exportSurveySkips?: ExportSurveySkip[];
  archived?: boolean;
}

export type Aggregates = Omit<ApiAggregates, 'hourly' | 'joints' | 'whoBuckets' | 'heatmaps'>
  & Partial<Pick<ApiAggregates, 'hourly' | 'joints' | 'whoBuckets' | 'heatmaps'>>;

export type LeagueUser = NonNullable<ReturnType<typeof buildBrowser>['league']>;

export type LeagueCard = ApiLeagueCard;

export type LeagueSummary = ApiLeagueSummary;

export interface ApiResponse {
  recordedUsage?: RecordedUsage;
  attentionUsage?: RecordedUsage;
  range?: DashboardRange;
  rangeStart?: number | null;
  totalUsers: number;
  funnel: { users: number; completed: number; exported: number };
  funnelEvents?: Record<string, number>;
  dexFunnel?: DexUsageFunnel;
  leagueFunnel?: LeagueUsageFunnel;
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
  league?: {
    users: number;
    named: number;
    typed: number;
    fullLeague: number;
    returning: number;
    activity: { day: number; dau: number }[];
    picks?: LeaguePicks;
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
  cohort?: [number, number, number, 0 | 1, 0 | 1][];
  activity?: { day: number; dau: number; rolling7: number; label24h?: number | null; label168h?: number | null }[];
  lastPointLabels?: { label24h: number | null; label168h: number | null };
  onboardingLaunchTs?: number;
  exportSettings?: {
    tracked: number;
    outlines: number;
    groupSpecial: number;
    showStats: number;
    sorts: Record<string, number>;
  };
  retention: { returning: number; newUsers: number };
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
  languages?: Record<string, number>;
  devices: Record<string, number>;
  os: Record<string, number>;
  popularFinal: [string, number][];
  mostDropped: [string, number][];
  popularMin?: number;
  droppedMin?: number;
  popularBySection: Record<string, [string, number][]>;
  droppedBySection: Record<string, [string, number][]>;
  picksBySectionAll: Record<string, [string, number][]>;
  byTool?: Partial<Record<ToolSlice, Aggregates>>;
  favoriteFunnel?:FavoriteUsageFunnel;
  favorite?: {users:number;started:number;completed:number;exporters:number;fullExporters:number;simplifiedExporters:number;exportsFull:number;exportsSimplified:number;depth:SurvivalCurve;unique:SurvivalCurve};
  favoritePicks?:FavoritePicks;
  cohorts?: Record<
    'built' | 'incomplete' | 'completed',
    {
      users: number;
      devices: Record<string, number>;
      os?: Record<string, number>;
      countries: Record<string, number>;
      browsers: Record<string, number>;
      joints?: PlatformJoint[];
    }
  >;
  depthByDevice?: Record<'all' | 'mobile' | 'desktop', SurvivalCurve>;
  referrerFlow?: { host: string; total: number; dex: number; league: number; favorites?:number }[];
  crossTool?: CrossToolSnapshot;
  crossToolSince?: Record<string, CrossToolSnapshot>;
  journeys?: {
    both: number;
    dexFirst: number;
    leagueFirst: number;
    sameDay: number;
    medianGapDays: number;
    p75GapDays: number;
    weekly: { week: number; newDex: number; dexToLeague7d: number; newLeague: number; leagueToDex7d: number }[];
  };
  leagueCurves?: { cards: SurvivalCurve; seats: SurvivalCurve };
  browsers?: BrowserIndex;
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

function activeDayCount(rec: { sessionLog?: { ts: number }[]; firstTs: number; lastTs: number; tz?: string }): number {
  const stamps = (rec.sessionLog ?? []).map((s) => s.ts);
  if (stamps.length === 0) {
    stamps.push(rec.firstTs, rec.lastTs);
  }
  return distinctCalendarDays(stamps, rec.tz);
}

const saveCount = (n: number) => `${n} ${n === 1 ? 'save' : 'saves'}`;

class UnauthorizedError extends Error {}

async function fetchDashboard(token: string, range: DashboardRange): Promise<ApiResponse> {
  const qs = new URLSearchParams({ range });
  const res = await fetch(`/api/submissions?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new UnauthorizedError('Invalid admin token.');
  if (res.status === 503) throw new Error('Admin access is not configured on the server (ADMIN_TOKEN is not set).');
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return res.json() as Promise<ApiResponse>;
}

async function fetchSearchPerformance(token: string, refresh: boolean): Promise<SearchPerformanceView> {
  const qs = refresh ? '?refresh=1' : '';
  const res = await fetch(`/api/search-performance${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Search data request failed (${res.status}).`);
  return res.json() as Promise<SearchPerformanceView>;
}

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

function BeaconDropNotice({ events }: { events?: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const live = liveDropReasons(events);
  const total = live.reduce((sum, d) => sum + d.count, 0);
  const nearCap = nearCapRows(events);
  if (total === 0 && nearCap.length === 0) return null;

  return (
    <>
      {nearCap.length > 0 && (
        <p className="text-[0.65rem] text-amber-600 mt-2">
          ⚠ The browser store passed 40,000 of its 50,000 limit ({nearCap.map((r) => `${r.label} ${r.count} new browsers since`).join(' · ')})
        </p>
      )}
      {total > 0 && <p className="text-[0.65rem] text-amber-600 mt-2">
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
      </p>}
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

type PopularFace = { sprite: string; alt: string; name: string };

function dexFace(id: number): PopularFace | undefined {
  const p = getPokemonById(id);
  return p ? { sprite: p.sprite, alt: p.name, name: displayName(p.name) } : undefined;
}

function leagueFace(id: number): PopularFace | undefined {
  const p = getLeaguePokemonById(id);
  return p ? { sprite: p.sprite, alt: p.name, name: displayName(p.name) } : undefined;
}

function PopularGrid({ rows, face = dexFace, formatValue = String }: {
  rows: [string, number][];
  face?: (id: number) => PopularFace | undefined;
  formatValue?: (value: number) => string;
}) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No data yet.</p>;
  return (
    <div className="grid grid-cols-9 gap-1">
      {rows.map(([id, n]) => {
        const p = face(Number(id));
        const label = formatValue(n);
        return (
          <div
            key={id}
            className="flex flex-col items-center"
            title={p ? `#${id} ${p.name}: ${label}` : `#${id}: ${label}`}
          >
            <div className="w-full aspect-square flex items-center justify-center">
              {p ? (
                <img
                  src={p.sprite}
                  alt={p.alt}
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
            <span className="text-[0.65rem] tabular-nums leading-none">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function SpriteRow({ ids }: { ids: number[] }) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {ids.map((id) => {
        const p = getPokemonById(id);
        return (
          <div
            key={id}
            data-dex-id={id}
            title={p ? `#${id} ${displayName(p.name)}` : `#${id}`}
            className="w-6 h-6 shrink-0 flex items-center justify-center"
          >
            {p ? (
              <img
                src={p.sprite}
                alt={p.name}
                width={24}
                height={24}
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

function LanguageChip({ lang, locale, switched }: { lang?: string; locale?: string; switched?: string }) {
  const items = [
    lang ? { tag: lang, name: langName(lang), kind: 'browser' as const } : null,
    locale ? { tag: locale, name: langName(locale), kind: 'served' as const } : null,
    switched ? { tag: switched, name: langName(switched), kind: 'switched' as const } : null,
  ].filter(Boolean) as { tag: string; name?: string; kind: 'browser' | 'served' | 'switched' }[];
  const current = uiLanguage(lang, locale, switched);
  if (items.length === 0 || !current) return null;
  const allSame = items.every((it) => sameBaseLang(it.tag, items[0].tag));
  const label = allSame
    ? (items[0].name ?? items[0].tag)
    : items.map((it) => `${KIND_WORD[it.kind]} ${it.name ?? it.tag}`).join(' › ');
  return (
    <InfoChip label={label}>
      <Globe className="h-[13px] w-[13px] shrink-0" />
      <span className="text-xs font-medium">{langAbbr(current)}</span>
    </InfoChip>
  );
}

function UserToolSeg({
  value,
  onChange,
  hasDex,
  hasLeague,
  hasFavorites=false,
}: {
  value: 'dex' | 'league' | 'favorites';
  onChange: (k: 'dex' | 'league' | 'favorites') => void;
  hasDex: boolean;
  hasLeague: boolean;
  hasFavorites?:boolean;
}) {
  const opts = [
    { key: 'dex' as const, label: 'Dex', on: hasDex },
    { key: 'league' as const, label: 'League', on: hasLeague },
    { key: 'favorites' as const, label: 'Picker', on:hasFavorites },
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

function PreviewLanguageChip({
  lang,
  locale,
  switched,
  fillMd,
}: {
  lang?: string;
  locale?: string;
  switched?: string;
  fillMd?: boolean;
}) {
  const preview = previewLanguage(lang, locale, switched);
  if (!preview) return null;
  const name = langName(preview.tag) ?? preview.tag;
  const icon =
    preview.kind === 'switched' ? (
      <Languages className="h-[13px] w-[13px]" />
    ) : preview.kind === 'unsupported' ? (
      <Globe className="h-[13px] w-[13px]" />
    ) : (
      <span className="[&>svg]:h-[13px] [&>svg]:w-[13px]" aria-hidden>
        {POKEBALL_SVG}
      </span>
    );
  const kindLabel =
    preview.kind === 'switched' ? 'Switched' : preview.kind === 'unsupported' ? 'Browser' : 'Served';
  return (
    <InfoChip fillMd={fillMd} label={`${kindLabel} ${name}`}>
      {icon}
      <span className="text-xs font-medium">{langAbbr(preview.tag)}</span>
    </InfoChip>
  );
}

function DetailHeader({
  rec,
  onBack,
  tool,
  onTool,
  hasDex,
  hasLeague,
  hasFavorites=false,
  reports = 0,
  onFeedback,
}: {
  rec: HeaderRec;
  onBack: () => void;
  tool: 'dex' | 'league' | 'favorites';
  onTool: (k: 'dex' | 'league' | 'favorites') => void;
  hasDex: boolean;
  hasLeague: boolean;
  hasFavorites?:boolean;
  reports?: number;
  onFeedback?: () => void;
}) {
  const feedbackChip = reports > 0 && <FeedbackChip reports={reports} onFeedback={onFeedback} />;
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
        <UserToolSeg value={tool} onChange={onTool} hasDex={hasDex} hasLeague={hasLeague} hasFavorites={hasFavorites} />
      </span>
      <TooltipScope>
        <div className="ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto">
          {rec.country && (
            <InfoChip label={geoChipLabel(rec.country, rec.region)}>
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
          {feedbackChip && <span className="hidden md:inline-flex">{feedbackChip}</span>}
        </div>
      </TooltipScope>
    </div>
    <div className="flex items-center justify-between gap-2 md:hidden">
      <UserToolSeg value={tool} onChange={onTool} hasDex={hasDex} hasLeague={hasLeague} hasFavorites={hasFavorites} />
      {feedbackChip}
    </div>
    </div>
  );
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

function leagueLinesByChain(cards: LeagueCard[]): Map<number, number> {
  const seats = new Map<number, number>();
  for (const { b } of cards.flatMap((c) => c.l)) {
    const chain = getLeaguePokemonById(b[0])?.evolutionChainId ?? -b[0];
    seats.set(chain, (seats.get(chain) ?? 0) + 1);
  }
  return seats;
}

function seatsBeyond(a: Map<number, number>, b: Map<number, number>): number {
  let n = 0;
  for (const [chain, seats] of a) n += Math.max(0, seats - (b.get(chain) ?? 0));
  return n;
}

function DexDetailBody({ rec, reports }: { rec: ClientRecord; reports: FeedbackItem[] }) {
  const { log, ms } = useMemo(
    () => tidySessions(rec.sessionLog ?? [], rec.sessionMs, (s) => s.ids),
    [rec.sessionLog, rec.sessionMs],
  );
  const [i, setI] = useState(Math.max(0, log.length - 1));
  const sessionIds = useMemo(() => log.map((s) => s.ids), [log]);
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
  const recordedIds = useMemo(() => {
    const ids = new Set<number>(rec.latestIds ?? []);
    for (const s of log) for (const id of s.ids) ids.add(id);
    return ids;
  }, [rec.latestIds, log]);
  const mountedSections = useMemo(
    () =>
      keepMountedSections(
        rec.latestSections ?? log[log.length - 1]?.sections,
        [rec.everSections, ...log.map((s) => s.sections)],
        recordedIds,
      ),
    [rec.latestSections, rec.everSections, log, recordedIds],
  );
  const presentIds = useMemo(
    () => log[idx]?.ids ?? rec.latestIds ?? [],
    [log, idx, rec.latestIds],
  );
  const sectionedSet = useMemo(
    () => new Set(Object.values(mountedSections).flat()),
    [mountedSections],
  );
  const keepOffIds = useMemo(
    () => idsOutsideSections(sessionIds.length > 0 ? sessionIds : [presentIds], sectionedSet),
    [sessionIds, presentIds, sectionedSet],
  );
  const presenceRef = useRef<HTMLDivElement | null>(null);
  useDexPresence(presenceRef, presentIds, sessionIds);
  const hasSections = Object.keys(mountedSections).length > 0;
  const peak = Math.max(0, ...points.map((p) => p.count));
  const totalMs = ms.reduce((a, b) => a + b, 0);

  const t0 = log.length ? log[0].ts : 0;
  const t1 = log.length ? log[log.length - 1].ts : 0;
  const clampT = (t: number) => Math.max(t0, Math.min(t1, t));
  const milestones: ChartMilestone[] =
    rec.exported && rec.exportedAt
      ? [{ t: clampT(Date.parse(rec.exportedAt)), label: 'export', tone: 'export' }]
      : [];
  milestones.push(...exportSurveySkipMarks(rec.exportSurveySkips, clampT, 'dex'));
  milestones.push(...feedbackMarks(reports, log.map((e, k) => ({ start: e.ts - (ms[k] ?? 0), end: e.ts })), clampT));

  const snapshot = (
    <div ref={presenceRef}>
      {hasSections ? (
        <OutlinedDex sections={mountedSections} presentIds={presentIds} />
      ) : presentIds.length > 0 ? (
        <SpriteRow ids={presentIds} />
      ) : (
        <p className="text-xs text-muted-foreground">Empty at this point.</p>
      )}
      {hasSections && keepOffIds.length > 0 && (
        <div
          className="mt-3 rounded-lg border border-dashed border-[var(--color-off)]/60 p-3"
          data-testid="admin-dex-uncaptured"
          data-count={keepOffIds.length}
        >
          <div className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'var(--color-border)' }} />
            Section not captured
            <span className="text-muted-foreground/70">{keepOffIds.length}</span>
          </div>
          <p className="mb-1.5 text-[0.7rem] text-muted-foreground/80">These Pokémon appeared in a recorded build, but their section was not captured. Older sessions and exports from before a recent update can omit it. In the app, every Pokémon is in a section.</p>
          <SpriteRow ids={keepOffIds} />
        </div>
      )}
    </div>
  );

  if (points.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">No session history.</p>
        <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto">{snapshot}</div>
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

function LeagueDetailBody({ league, reports }: { league: LeagueUser; reports: FeedbackItem[] }) {
  const { log, ms } = useMemo(
    () =>
      tidySessions(
        league.sessionLog ?? [],
        league.sessionMs,
        leagueSessionIds,
        (s) => s.summary,
      ),
    [league.sessionLog, league.sessionMs],
  );
  const [i, setI] = useState(Math.max(0, log.length - 1));
  const points: TimelinePoint[] = useMemo(() => {
    const lines = log.map((s) => (s.cards?.length ? leagueLinesByChain(s.cards) : null));
    const nets = log.map((s, k) => {
      const l = lines[k];
      return l ? [...l.values()].reduce((a, b) => a + b, 0) : s.summary.seats;
    });
    return log.map((s, k) => {
      const now = lines[k];
      const prev = k > 0 ? lines[k - 1] : null;
      let added = 0;
      let removed = 0;
      if (now && prev) {
        added = seatsBeyond(now, prev);
        removed = seatsBeyond(prev, now);
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
        ev: leagueSittingEv(s.events),
      };
    });
  }, [log, ms]);
  const idx = Math.min(i, Math.max(0, log.length - 1));
  const peak = Math.max(0, ...points.map((p) => p.net));
  const totalMs = ms.reduce((a, b) => a + b, 0);
  const t0 = log.length ? log[0].ts : 0;
  const t1 = log.length ? log[log.length - 1].ts : 0;
  const clampT = (t: number) => Math.max(t0, Math.min(t1, t));
  const days = Math.max(1, distinctCalendarDays(log.map((s) => s.ts), league.tz));
  const milestones: ChartMilestone[] = [];
  if (league.exportedCardAt) {
    milestones.push({ t: clampT(Date.parse(league.exportedCardAt)), label: 'card', tone: 'export' });
  }
  if (league.exportedLeagueAt) {
    milestones.push({ t: clampT(Date.parse(league.exportedLeagueAt)), label: 'league', tone: 'export' });
  }
  milestones.push(...exportSurveySkipMarks(league.exportSurveySkips, clampT, 'league'));
  milestones.push(...feedbackMarks(reports, log.map((e, k) => ({ start: e.ts - (ms[k] ?? 0), end: e.ts })), clampT));

  const snapshots = useMemo(() => {
    if (log.length === 0) {
      const latest = sessionCards(league.latestCards);
      return latest ? [latest] : [];
    }
    return log.map((s) => sessionCards(s.cards));
  }, [log, league.latestCards]);
  const board = (
    <LeagueVisitBoard sessions={snapshots} playhead={idx} />
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
      peakLabel={`${peak} lines`}
      milestones={milestones}
      tz={league.tz}
      leftChip={<SessionsChip sessions={log.length} days={days} full={log.length <= 1} />}
      rightChip={<TimeChip ms={totalMs} full={log.length <= 1} />}
    >
      {board}
    </SessionTimeline>
  );
}

function headerFrom(dex?: ClientRecord, league?: LeagueUser, favorite?:FavoriteUser): HeaderRec | null {
  const src = dex ?? league ?? favorite;
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

interface UserRecords {
  dex?: ClientRecord;
  league?: LeagueUser;
  favorite?: FavoriteUser;
}

function hasRecord(u: UserRecords): boolean {
  return !!(u.dex || u.league || u.favorite);
}

function userTools(u: UserRecords): FeedbackTool[] {
  return (['dex', 'league', 'favorites'] as const).filter((k) => (k === 'dex' ? u.dex : k === 'league' ? u.league : u.favorite));
}

function UserStatus({ cid, onBack, children }: { cid: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2" data-testid="admin-user-status">
      <div className="flex items-center gap-x-2">
        <button type="button" onClick={onBack} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
          ‹ Back
        </button>
        <span className="shrink-0 text-sm font-bold tabular-nums" title={cid}>
          {middleId(cid)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function UserDetailPage({
  tool,
  onTool,
  dex,
  league,
  favorite,
  onBack,
  reports,
  onFeedback,
}: {
  tool: 'dex' | 'league' | 'favorites';
  onTool: (k: 'dex' | 'league' | 'favorites') => void;
  dex?: ClientRecord;
  league?: LeagueUser;
  favorite?:FavoriteUser;
  onBack: () => void;
  reports: FeedbackItem[];
  onFeedback: () => void;
}) {
  const rec = headerFrom(dex, league, favorite);
  if (!rec) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      <div className="shrink-0">
        <DetailHeader rec={rec} onBack={onBack} tool={tool} onTool={onTool} hasDex={!!dex} hasLeague={!!league} hasFavorites={!!favorite} reports={reports.length} onFeedback={onFeedback} />
      </div>
      {tool === 'dex' && dex && <DexDetailBody rec={dex} reports={reports} />}
      {tool === 'league' && league && <LeagueDetailBody league={league} reports={reports} />}
      {tool === 'favorites' && favorite && <FavoriteDetailBody user={favorite} reports={reports} />}
    </div>
  );
}

const PREVIEW_TABLE =
  'relative flex w-full flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto] md:gap-x-1 md:gap-y-2';

const FACET_COL: Record<FacetKey, string> = {
  country: 'md:col-start-2',
  device: 'md:col-start-3',
  os: 'md:col-start-4',
  browser: 'md:col-start-5',
  language: 'md:col-start-6',
};

const FACET_ANY = '__any__';

function facetIcon(key: FacetKey, value: string): ReactNode {
  if (value === FACET_UNKNOWN) return facetLeadIcon(key);
  if (key === 'country') return <FlagIcon country={value} />;
  if (key === 'device') return <DeviceIcon value={value} />;
  if (key === 'os') return <OsIcon value={value} />;
  if (key === 'browser') return <BrowserIcon value={value} />;
  return <Globe className="h-3 w-3" />;
}

function facetLeadIcon(key: FacetKey): ReactNode {
  const cls = 'h-3.5 w-3.5';
  if (key === 'country') return <Globe className={cls} />;
  if (key === 'device') return <MonitorSmartphone className={cls} />;
  if (key === 'os') return <span className="text-[0.65rem] font-semibold leading-none">OS</span>;
  if (key === 'browser') return <Compass className={cls} />;
  return <Languages className={cls} />;
}

function PreviewFacetMenus({
  listed,
  facets,
  setFacets,
}: {
  listed: HeaderRec[];
  facets: FacetFilters;
  setFacets: (next: FacetFilters | ((prev: FacetFilters) => FacetFilters)) => void;
}) {
  return (
    <>
      {FACET_KEYS.map((key) => {
        const recs = listed.filter((rec) => matchesFacetFilters(rec, { ...facets, [key]: undefined }));
        return (
          <PreviewFilterMenu
            key={key}
            name={FACET_LABEL[key]}
            className={cn('md:justify-self-stretch', FACET_COL[key], 'md:row-start-1')}
            value={facets[key] ?? FACET_ANY}
            anyKey={FACET_ANY}
            clearable
            compactMd
            fillMd
            leadIcon={facetLeadIcon(key)}
            options={[
              { key: FACET_ANY, label: 'Any' },
              ...uniqueFacetValues(recs, key).map((v) => ({
                key: v,
                label: facetLabel(key, v),
                chipLabel: key === 'country' || key === 'language' ? (v === FACET_UNKNOWN ? 'Unknown' : v.toUpperCase()) : facetLabel(key, v),
                icon: facetIcon(key, v),
              })),
            ]}
            onChange={(next) => {
              setFacets((prev) => {
                const out = { ...prev };
                if (next === FACET_ANY) delete out[key];
                else out[key] = next;
                return out;
              });
            }}
          />
        );
      })}
    </>
  );
}

function PreviewStatusMenus({
  archiveFilter,
  setArchiveFilter,
  toolFilter,
  setToolFilter,
}: {
  archiveFilter: ArchiveFilter;
  setArchiveFilter: (v: ArchiveFilter) => void;
  toolFilter?: ToolFilter;
  setToolFilter?: (v: ToolFilter) => void;
}) {
  return (
    <>
      <PreviewFilterMenu
        name="Status"
        className="md:col-start-10 md:col-span-2 md:row-start-1 md:justify-self-end"
        value={archiveFilter}
        options={ARCHIVE_FILTER_OPTIONS}
        onChange={setArchiveFilter}
        ariaLabel="Archive filter"
      />
      {toolFilter && setToolFilter && (
        <PreviewFilterMenu
          name="Tools"
          className="md:col-start-7 md:col-span-3 md:row-start-1 md:justify-self-start"
          value={toolFilter}
          anyKey="any"
          clearable
          options={TOOL_FILTER_OPTIONS}
          onChange={setToolFilter}
          ariaLabel="Tool filter"
        />
      )}
    </>
  );
}

function PreviewPlatformSlot({
  colClass,
  empty,
  label,
  children,
}: {
  colClass: string;
  empty?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('inline-flex', colClass, 'md:row-span-2 md:row-start-1 md:self-stretch md:justify-self-stretch', empty && 'opacity-40')}>
      <InfoChip fillMd label={label}>{children}</InfoChip>
    </span>
  );
}

const WHEN_TEXT = 'whitespace-nowrap md:whitespace-normal text-sm font-semibold tabular-nums md:col-start-1 md:row-start-1';

function WhenSizer({ texts }: { texts: string[] }) {
  return (
    <div inert aria-hidden className="invisible max-md:hidden md:col-span-full md:row-start-1 md:grid md:h-0 md:grid-cols-subgrid md:overflow-hidden md:px-2.5">
      {texts.map((text) => (
        <span key={text} className={WHEN_TEXT}>
          {text}
        </span>
      ))}
    </div>
  );
}

function FeedbackChip({ reports, onFeedback }: { reports: number; onFeedback?: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onFeedback?.();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      data-testid="admin-feedback-chip"
      aria-label={`${reports} feedback ${reports === 1 ? 'report' : 'reports'} from this browser`}
      className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 text-muted-foreground hover:text-foreground"
    >
      <MessageSquare className="h-[13px] w-[13px] shrink-0 text-red-600" />
      <span className="text-xs font-medium tabular-nums">{reports}</span>
    </button>
  );
}

function UserPreviewCard({
  rec,
  cells,
  total,
  pickerRow,
  archived,
  reports = 0,
  onOpen,
  onArchive,
  onFeedback,
  sizer,
}: {
  rec: HeaderRec & { lastTs: number; tz?: string; suspect?: readonly string[] };
  cells: ToolCell[];
  total: CardTime;
  pickerRow?: boolean;
  archived: boolean;
  reports?: number;
  onOpen?: () => void;
  onArchive?: (next: boolean) => void;
  onFeedback?: () => void;
  sizer?: boolean;
}) {
  const langPreview = previewLanguage(rec.lang, rec.locale, rec.switched);

  return (
    <div
      role={sizer ? undefined : 'link'}
      tabIndex={sizer ? undefined : 0}
      inert={sizer}
      aria-hidden={sizer || undefined}
      data-user-preview={sizer ? undefined : ''}
      data-preview-sizer={sizer ? '' : undefined}
      data-favorite-user={pickerRow && !sizer ? rec.cid : undefined}
      aria-label={sizer ? undefined : `Open user ${middleId(rec.cid)}`}
      className={cn(
        'flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg bg-card px-2.5 py-2 shadow-elevated hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'md:col-span-full md:grid md:grid-cols-subgrid md:items-center md:gap-x-1 md:gap-y-1 md:py-1.5',
        archived && 'opacity-70',
        sizer && 'invisible max-md:hidden md:row-start-1 md:h-0 md:overflow-hidden md:py-0',
      )}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-1 md:contents">
        <FitNowrap contentsOnMd className="min-w-0 flex-1">
          <span className={cn(WHEN_TEXT, 'md:self-end')}>{formatWhen(rec.lastTs, rec.tz)}</span>
          <span className="whitespace-nowrap text-sm text-muted-foreground md:col-start-1 md:row-start-2 md:self-start">
            {relativeTime(rec.lastTs)}
          </span>
        </FitNowrap>
        <div
          className="flex shrink-0 items-center gap-1 md:col-start-11 md:row-span-2 md:row-start-1 md:justify-self-end"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {reports > 0 && (
            <span className="hidden md:inline-flex">
              <FeedbackChip reports={reports} onFeedback={onFeedback} />
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="relative h-7 w-7 p-0 text-red-600 hover:text-red-700 before:absolute before:-inset-2 before:content-['']"
            aria-label={archived ? 'Unarchive user' : 'Archive user'}
            onClick={() => onArchive?.(!archived)}
          >
            {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <div className="min-w-0 md:contents">
        <FitNowrap contentsOnMd className="min-w-0">
          <PreviewPlatformSlot
            colClass={FACET_COL.country}
            empty={!rec.country}
            label={rec.country ? geoChipLabel(rec.country, rec.region) : 'Unknown'}
          >
            {rec.country ? <FlagIcon country={rec.country} /> : <Globe className="h-[13px] w-[13px]" />}
          </PreviewPlatformSlot>
          <PreviewPlatformSlot
            colClass={FACET_COL.device}
            empty={!rec.device}
            label={rec.device ?? 'Unknown'}
          >
            <DeviceIcon value={rec.device} />
          </PreviewPlatformSlot>
          <PreviewPlatformSlot
            colClass={FACET_COL.os}
            empty={!rec.os}
            label={rec.os ?? 'Unknown'}
          >
            <OsIcon value={rec.os} />
          </PreviewPlatformSlot>
          <PreviewPlatformSlot
            colClass={FACET_COL.browser}
            empty={!rec.browser}
            label={rec.browser ?? 'Unknown'}
          >
            <BrowserIcon value={rec.browser} />
          </PreviewPlatformSlot>
          <span className={cn(FACET_COL.language, 'inline-flex md:row-span-2 md:row-start-1 md:self-stretch md:justify-self-stretch', !langPreview && 'opacity-40')}>
            {langPreview ? (
              <PreviewLanguageChip fillMd lang={rec.lang} locale={rec.locale} switched={rec.switched} />
            ) : (
              <InfoChip fillMd label="Unknown">
                <Globe className="h-[13px] w-[13px]" />
              </InfoChip>
            )}
          </span>
          {reports > 0 && (
            <span className="inline-flex md:hidden">
              <FeedbackChip reports={reports} onFeedback={onFeedback} />
            </span>
          )}
        </FitNowrap>
      </div>
      <BrowserUsage cells={cells} total={total} />
      {!sizer && rec.suspect?.length ? (
        <p data-bot-lead className="text-xs text-amber-700 md:col-span-full">{suspectText(rec.suspect)}</p>
      ) : null}
    </div>
  );
}

function WhatPeoplePick({
  mostBySection,
  rankedRows,
  formatValue,
  actionLabel = 'Most picked ›',
  emptyLabel = 'No picks yet.',
  n,
  unit,
  face,
  onOpen,
}: {
  mostBySection?: Record<string, [string, number][]>;
  rankedRows?: [string, number][];
  formatValue?: (value: number) => string;
  actionLabel?: string;
  emptyLabel?: string;
  n: number;
  unit: string;
  face?: (id: number) => PopularFace | undefined;
  onOpen: () => void;
}) {
  const top = useMemo<[string, number][]>(() => {
    if (rankedRows !== undefined) return rankedRows.slice(0, 9);
    const totals: Record<string, number> = {};
    for (const rows of Object.values(mostBySection ?? {})) for (const [id, c] of rows) totals[id] = (totals[id] ?? 0) + c;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 9);
  }, [mostBySection, rankedRows]);
  return (
    <Panel
      title="What people pick"
      sub={[`of ${n} ${unit}`]}
      actions={
        <Button variant="ghost" size="sm" onClick={onOpen}>
          {actionLabel}
        </Button>
      }
    >
      {top.length > 0 ? <PopularGrid rows={top} face={face} formatValue={formatValue} /> : <p className="text-sm text-muted-foreground">{emptyLabel}</p>}
    </Panel>
  );
}

type AdminNavKey = ToolSlice | 'search' | 'feedback';

function AdminBar({ wide, children }: { wide: boolean; children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--admin-bar-h', `${el.getBoundingClientRect().height}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--admin-bar-h');
    };
  }, []);
  return (
    <div
      ref={barRef}
      data-admin-bar
      className={cn(
        'fixed inset-x-0 bottom-0 z-[90] border-t border-border bg-card/95 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur md:sticky md:w-full md:px-0 md:pb-0 md:top-[var(--admin-header-h,0px)] md:border-t-0 md:border-b md:bg-card md:backdrop-blur-none',
      )}
    >
      <div className={cn(!wide && 'md:mx-auto md:w-fit md:max-w-5xl')}>{children}</div>
    </div>
  );
}

function AdminNav({ value, onChange }: { value: AdminNavKey; onChange: (k: AdminNavKey) => void }) {
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const apply = () => {
      const buttons = el.querySelectorAll('button');
      if (buttons.length > 0) {
        const a = buttons[0].getBoundingClientRect();
        const b = buttons[buttons.length - 1].getBoundingClientRect();
        document.documentElement.style.setProperty('--admin-nav-tabs-w', `${Math.round(b.right - a.left)}px`);
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--admin-nav-tabs-w');
    };
  }, []);
  const items: { key: AdminNavKey; label: string }[] = [
    { key: 'all', label: 'Suite' },
    { key: 'dex', label: 'Dex' },
    { key: 'league', label: 'League' },
    { key: 'favorites', label: 'Picker' },
    { key: 'search', label: 'Search' },
    { key: 'feedback', label: 'Feedback' },
  ];
  return (
    <nav
      ref={navRef}
      aria-label="Admin section"
      className="flex justify-around gap-0.5 py-2 md:justify-center md:gap-1 md:px-4"
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
              'flex-auto whitespace-nowrap rounded-lg px-1 py-1.5 text-xs font-semibold transition-colors md:flex-none md:px-3 md:text-sm',
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

type Detail =
  | { kind: 'dex' | 'league' | 'favorites'; cid: string; country?: string }
  | { kind: 'picks'; tool: 'dex' | 'league' | 'favorites' };

export function AdminPage() {
  const [demo] = useState(() => new URLSearchParams(window.location.search).has('demo'));
  const [token, setToken] = useState<string | null>(() => {
    if (demo) return null;
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [initialToken] = useState(token);
  const [tokenInput, setTokenInput] = useState('');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [searchPerformance, setSearchPerformance] = useState<SearchPerformanceView | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolSlice>(() => loadToolSlice());
  const [range, setRange] = useState<DashboardRange>(loadRange);
  const [page, setPage] = useState<'analytics' | 'search' | 'feedback'>('analytics');
  const [feedbackCid, setFeedbackCid] = useState<string | null>(null);
  const [depthDevice, setDepthDevice] = useState<'all' | 'mobile' | 'desktop'>('all');
  const [whoFilter, setWhoFilter] = useState<WhoFilter | null>(null);
  const [flowView, setFlowView] = useState<'usage' | 'referrer'>('usage');
  const [detail, setDetail] = useState<Detail | null>(null);
  const browserList = page === 'analytics' && (tool === 'dex' || tool === 'league' || tool === 'favorites');
  const feedbackItems = useFeedbackList(token, browserList || (detail != null && detail.kind !== 'picks')).data?.items;
  const reportsByCid = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of feedbackItems ?? []) if (typeof r.cid === 'string') n.set(r.cid, (n.get(r.cid) ?? 0) + 1);
    return n;
  }, [feedbackItems]);
  const [summarySource, setSummarySource] = useState<UsageSource>('active');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active');
  const [toolFilter, setToolFilter] = useState<ToolFilter>('any');
  const [facetFilters, setFacetFilters] = useState<FacetFilters>({});
  const [archiveOverride, setArchiveOverride] = useState<Record<string, boolean>>({});
  const [authed, setAuthed] = useState(initialToken !== null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageHeaderRef = useRef<HTMLElement>(null);
  const [pageHeaderH, setPageHeaderH] = useState(0);
  const [rangeSlot, setRangeSlot] = useState<HTMLDivElement | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const browserLoader = useMemo<BrowserLoader | null>(() => {
    if (demo) return (cid, country) => import('./__fixtures__/sampleResponse').then((m) => m.sampleBrowser(cid, country));
    return token ? apiBrowserLoader(token, loadedAt) : null;
  }, [demo, token, loadedAt]);
  const userCid = detail && detail.kind !== 'picks' ? bareCid(detail.cid) : null;
  const fetchedUser = useBrowserRecords(browserLoader, userCid, detail && detail.kind !== 'picks' ? detail.country : undefined);

  useLayoutEffect(() => {
    if (pageHeaderRef.current) setPageHeaderH(pageHeaderRef.current.offsetHeight);
  });

  const [dashScrollY, setDashScrollY] = useState(0);
  const tabScrollY = useRef<Partial<Record<AdminNavKey, number>>>({});
  const dashboardTab: AdminNavKey = page === 'analytics' ? tool : page;
  const previousTab = useRef(dashboardTab);
  useLayoutEffect(() => {
    if (previousTab.current !== dashboardTab && !detail) {
      queueMicrotask(() => window.scrollTo(0, tabScrollY.current[dashboardTab] ?? 0));
    }
    previousTab.current = dashboardTab;
  }, [dashboardTab, detail]);

  const openDetail = useCallback((d: Detail) => {
    setDashScrollY(window.scrollY);
    setDetail(d);
    window.scrollTo(0, 0);
  }, []);
  useLayoutEffect(() => {
    if (!detail) queueMicrotask(() => window.scrollTo(0, dashScrollY));
  }, [detail, dashScrollY]);
  const openDexPicks = useCallback(() => openDetail({ kind: 'picks', tool: 'dex' }), [openDetail]);
  const openLeaguePicks = useCallback(() => openDetail({ kind: 'picks', tool: 'league' }), [openDetail]);
  const openPickerPicks = useCallback(() => openDetail({ kind: 'picks', tool: 'favorites' }), [openDetail]);

  const loadSearch = useCallback(async (tok: string, { refresh = false, quiet = false } = {}) => {
    if (!quiet) {
      setSearchLoading(true);
      setSearchError(null);
    }
    try {
      setSearchPerformance(await fetchSearchPerformance(tok, refresh));
      setSearchError(null);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search data could not load.');
    } finally {
      if (!quiet) setSearchLoading(false);
    }
  }, []);

  const load = useCallback(
    async (
      tok: string,
      asked: DashboardRange,
      { refreshSearch = false, quiet = false, search = false } = {},
    ) => {
      const seq = ++latestLoad;
      if (!quiet) {
        setLoading(true);
        setError(null);
      }
      try {
        const resp = await fetchDashboard(tok, asked);
        const at = Date.now();
        rangeCache.set(asked, { data: resp, at });
        if (seq !== latestLoad) return;
        setData(resp);
        setLoadedAt(at);
        setAuthed(true);
        setToken(tok);
        setError(null);
        if (search) void loadSearch(tok, { refresh: refreshSearch, quiet });
        try {
          localStorage.setItem(TOKEN_KEY, tok);
        } catch {
          return;
        }
      } catch (e) {
        if (seq !== latestLoad) return;
        if (e instanceof UnauthorizedError) setAuthed(false);
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [loadSearch],
  );

  useEffect(() => {
    if (demo) {
      void Promise.all([
        import('./__fixtures__/sampleResponse'),
        import('./__fixtures__/sampleSearchPerformance'),
      ]).then(([dashboard, search]) => {
        setData(dashboard.sampleResponse);
        setSearchPerformance(search.sampleSearchPerformanceView);
        setLoadedAt(Date.now());
        setAuthed(true);
      });
      return;
    }
    if (initialToken) void load(initialToken, loadRange());
  }, [demo, initialToken, load]);

  const pickRange = useCallback(
    (next: DashboardRange) => {
      setRange(next);
      latestLoad += 1;
      try {
        localStorage.setItem(RANGE_KEY, next);
      } catch {
        // platform: localStorage throws when the browser blocks or disables storage.
      }
      if (!token) return;
      const hit = rangeCache.get(next);
      if (!hit) {
        void load(token, next, { search: page === 'search' });
        return;
      }
      setData(hit.data);
      setLoadedAt(hit.at);
      if (Date.now() - hit.at >= STALE_ON_RETURN_MS) void load(token, next, { quiet: true, search: page === 'search' });
    },
    [token, load, page],
  );

  useEffect(() => {
    if (!authed || !token || loading) return;
    let running = false;
    const refresh = (minAgeMs: number) => {
      if (running || Date.now() - loadedAt < minAgeMs) return;
      running = true;
      void load(token, range, { quiet: true, search: page === 'search' }).finally(() => {
        running = false;
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh(STALE_ON_RETURN_MS);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh(STALE_ON_RETURN_MS);
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh(0);
    }, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [authed, token, loading, load, loadedAt, range, page]);

  const setArchived = useCallback(
    async (cid: string, next: boolean) => {
      const key = bareCid(cid);
      setArchiveOverride((prev) => ({ ...prev, [key]: next }));
      if (!token) return;
      setError(null);
      try {
        const res = await fetch('/api/archive-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cid, archived: next }),
        });
        if (!res.ok) throw new Error(`Archive failed (${res.status}).`);
        rangeCache.clear();
        await load(token, range);
        setArchiveOverride((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      } catch (e) {
        setArchiveOverride((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
        setError(e instanceof Error ? e.message : 'Archive failed.');
      }
    },
    [token, load, range],
  );

  const pickTool = useCallback((next: ToolSlice) => {
    setWhoFilter(null);
    setTool(next);
    try {
      localStorage.setItem(TOOL_KEY, next);
    } catch {
      return;
    }
  }, []);

  const toolsByCid = useMemo(() => {
    const lists = data?.browsers;
    if (!lists) return null;
    const out = new Map<string, FeedbackTool[]>();
    const add = (rows: BrowserRow[], tool: FeedbackTool) => {
      for (const r of rows) {
        const tools = out.get(bareCid(r.cid)) ?? [];
        if (!tools.includes(tool)) out.set(bareCid(r.cid), [...tools, tool]);
      }
    };
    add(lists.dex, 'dex');
    add(lists.league, 'league');
    add(lists.picker, 'favorites');
    return out;
  }, [data]);

  const signOut = useCallback(() => {
    latestLoad += 1;
    try {
      if (!demo) localStorage.removeItem(TOKEN_KEY);
    } catch {
      // platform: localStorage throws when the browser blocks or disables storage.
    }
    setToken(null);
    setAuthed(false);
    setData(null);
    rangeCache.clear();
    setSearchPerformance(null);
    setSearchError(null);
    setTokenInput('');
  }, [demo]);

  if (!authed) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 bg-background">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = tokenInput.trim();
            if (t) void load(t, range);
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

  const navKey: AdminNavKey = page === 'feedback' ? 'feedback' : page === 'search' ? 'search' : tool;
  const onNav = (k: AdminNavKey) => {
    if (!detail && k !== navKey) tabScrollY.current[navKey] = window.scrollY;
    if (detail) {
      tabScrollY.current[k] = 0;
      setDashScrollY(0);
      setDetail(null);
    }
    if (k === 'feedback') {
      setPage('feedback');
      setFeedbackCid(null);
    } else if (k === 'search') {
      setPage('search');
      if (token) void loadSearch(token, { refresh: true });
    } else {
      setPage('analytics');
      pickTool(k);
    }
  };
  const lockUser = detail?.kind === 'dex' || detail?.kind === 'league' || detail?.kind === 'favorites';
  const toolsOf = (cid: string): FeedbackTool[] | null => toolsByCid?.get(bareCid(cid)) ?? null;
  const pickerPicks = detail?.kind === 'picks' && detail.tool === 'favorites';
  const lockHeight = lockUser || pickerPicks;

  return (
    <div
      className={cn('flex flex-col bg-background', lockHeight ? 'h-dvh overflow-hidden' : 'min-h-dvh')}
      style={{ '--admin-header-h': `${pageHeaderH}px` } as CSSProperties}
    >
      <header ref={pageHeaderRef} className="sticky top-0 z-[100] border-b bg-card">
        <div className={cn('mx-auto flex w-full items-center justify-between gap-2 px-4 py-1', lockHeight ? 'max-w-none' : 'max-w-5xl')}>
          <h1 className="whitespace-nowrap text-sm font-bold">

            <span className="text-primary">my151</span> · Analytics
          </h1>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => token && void load(token, range, { refreshSearch: true, search: page === 'search' })} disabled={loading || searchLoading}>
              {loading || searchLoading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <AdminBar wide={detail?.kind === 'picks'}>
        <div ref={setRangeSlot} data-admin-range-slot className={cn(detail?.kind === 'picks' && 'pb-2')}>
          {!lockUser && page !== 'feedback' && <RangeRibbon value={range} onChange={pickRange} />}
        </div>
        {detail?.kind !== 'picks' && <AdminNav value={navKey} onChange={onNav} />}
      </AdminBar>

      <main
        className={cn(
          'mx-auto flex w-full min-w-0 flex-1 flex-col px-4',
          lockHeight ? 'max-w-none' : 'max-w-5xl',
          lockHeight
            ? 'min-h-0 gap-2 overflow-hidden pt-2 max-md:pb-[var(--admin-bar-h,8rem)] md:pb-8'
            : 'gap-4 pb-[calc(var(--admin-bar-h,8rem)+1.5rem)] pt-4 md:pb-8',
        )}
      >
        {error && <p className="text-sm text-destructive">{error}</p>}

        {detail && data && (
          <div className={cn(lockHeight && 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
          {(() => {
          if (detail.kind === 'picks') {
            if (detail.tool === 'favorites') {
              return data.favoritePicks ? (
                <PickerPicksPage picks={data.favoritePicks} onBack={() => setDetail(null)} />
              ) : null;
            }
            if (detail.tool === 'league') {
              return data.league?.picks ? (
                <LeaguePicksPage picks={data.league.picks} n={data.league.users} onBack={() => setDetail(null)} />
              ) : null;
            }
            const nDex = data.tools?.dex ?? data.funnel.users;
            return (
              <PicksDetailPage picksBySectionAll={data.picksBySectionAll} n={nDex} onBack={() => setDetail(null)} />
            );
          }
          const bare = bareCid(detail.cid);
          if (fetchedUser.status !== 'ready') {
            const failed = fetchedUser.status === 'error';
            return <UserStatus cid={bare} onBack={() => setDetail(null)}>{failed ? 'This browser could not load.' : 'Loading this browser…'}</UserStatus>;
          }
          const r = fetchedUser.records;
          const user: UserRecords = { dex: r.dex ?? undefined, league: r.league ?? undefined, favorite: r.favorite ?? undefined };
          if (!hasRecord(user)) {
            return <UserStatus cid={bare} onBack={() => setDetail(null)}>No tool records for this browser.</UserStatus>;
          }
          const { dex, league, favorite } = user;
          const tools = userTools(user);
          return (
            <RangeSlotContext.Provider value={rangeSlot}>
              <UserDetailPage
                tool={tools.includes(detail.kind) ? detail.kind : tools[0]}
                onTool={(k) => setDetail({ ...detail, kind: k })}
                dex={dex}
                league={league}
                favorite={favorite}
                reports={(feedbackItems ?? []).filter((r) => r.cid === bare)}
                onFeedback={() => {
                  setDashScrollY(0);
                  setDetail(null);
                  setPage('feedback');
                  setFeedbackCid(bare);
                }}
                onBack={() => setDetail(null)}
              />
            </RangeSlotContext.Provider>
          );
          })()}
          </div>
        )}

        {!detail && page === 'feedback' &&
          (token ? (
            <FeedbackCard
              token={token}
              toolsOf={toolsOf}
              onOpen={(kind, cid, country) => openDetail({ kind, cid, country })}
              cidFilter={feedbackCid}
              onClearCid={() => setFeedbackCid(null)}
            />
          ) : <p className="text-sm text-muted-foreground">Sign in to read feedback.</p>)}

        {!detail && page === 'search' && (
          <SearchPerformancePanel snapshot={searchPerformance} loading={searchLoading} error={searchError} range={range} />
        )}

        {!detail && page === 'analytics' && data && (() => {
          const slice = sliceOf(data, tool);
          const showDex = tool === 'all' || tool === 'dex';

          const f = data.funnel;
          const built = data.tools?.dex ?? f.users;
          const sawIntro = f.users;
          const bounced = Math.max(0, sawIntro - built);
          const incomplete = Math.max(0, built - f.completed);
          const keptPrivate = Math.max(0, f.completed - f.exported);
          const showDexFunnel = (tool === 'all' || tool === 'dex') && (data.dexFunnel ? data.dexFunnel.built > 0 : built > 0);
          const showLeagueFunnel = (tool === 'all' || tool === 'league') && (data.leagueFunnel?.placed ?? 0) > 0;
          const showReferrer = (data.referrerFlow?.length ?? 0) > 0;
          const showFavoriteFunnel = (tool === 'all' || tool === 'favorites') && (data.favoriteFunnel?.opened ?? 0) > 0;
          const favoriteSankey = data.favoriteFunnel ? favoriteFunnelSankey(data.favoriteFunnel) : null;
          const showFlows = flowView === 'referrer' ? showReferrer : showDexFunnel || showLeagueFunnel || showFavoriteFunnel;
          const dexSankey = data.dexFunnel
            ? dexFunnelSankey(data.dexFunnel)
            : dexFunnelSankey({
                opened: sawIntro,
                built,
                bounced,
                buckets: incomplete > 0 ? [{ label: 'Incomplete', count: incomplete, exported: 0 }] : [],
                completed: f.completed,
                exported: f.exported,
                keptPrivate,
              });
          const leagueSankey = data.leagueFunnel ? leagueFunnelSankey(data.leagueFunnel) : null;
          const referrerSankey = data.referrerFlow?.length ? referrerFlowSankey(data.referrerFlow) : null;

          const whoSrc = {
            devices: slice.devices,
            os: slice.os,
            countries: slice.countries,
            browsers: slice.browsers,
            users: slice.users,
            joints: slice.joints,
          };
          const whoJoints = whoSrc.joints ?? [];
          const whoOs = whoSrc.os ?? {};
          const whoN = whoSrc.users;
          const whoBuckets = slice.whoBuckets ?? [];
          const whoFilteredN = !whoFilter
            ? null
            : whoBuckets.length
              ? filteredN(whoBuckets, whoFilter)
              : whoFilter.dim !== 'region' && whoJoints.length
                ? clampedN(whoJoints, { dim: whoFilter.dim, value: whoFilter.value })
                : null;

          const depthCurve = showDex
            ? data.depthByDevice?.[depthDevice] ?? data.monCurves?.total ?? data.depthCurves?.total
            : tool === 'favorites' ? data.favorite?.depth : data.leagueCurves?.cards;

          return (
          <>
            {slice.activity.length > 0 && (
              <ActiveUsersPanel
                key={tool}
                series={
                  tool === 'all' && data.lastPointLabels
                    ? applyActivityLabels(slice.activity, loadedAt, data.lastPointLabels)
                    : slice.activity
                }
                hourly={slice.hourly ?? []}
                nowMs={loadedAt}
                range={range}
              />
            )}

            {slice.heatmaps && <HeatmapCard heatmaps={slice.heatmaps} />}

            {showDex && <BeaconDropNotice events={data.funnelEvents} />}

            {tool === 'league' && (
              <Panel title="League activity" sub={[`${slice.users} browsers`]}>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <Kpi emphasis value={slice.users} label="Browsers" />
                  <Kpi value={slice.retention.returning} label="Returning" />
                  {data.tools && <Kpi value={data.tools.leagueExporters} label="Exports" />}
                </div>
              </Panel>
            )}

            {tool === 'favorites' && <Panel title="Picker activity" sub={[`${slice.users} browsers`]}>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <Kpi emphasis value={slice.users} label="Browsers"/>
                <Kpi value={slice.retention.returning} label="Returning"/>
                <Kpi value={data.favorite?.completed ?? 0} label="Completed"/>
                <Kpi value={data.favorite?.exporters ?? 0} label="Exporters"/>
                <Kpi value={data.favorite?.fullExporters ?? 0} label="Full grid exporters" denom={saveCount(data.favorite?.exportsFull ?? 0)}/>
                <Kpi value={data.favorite?.simplifiedExporters ?? 0} label="Summary exporters" denom={saveCount(data.favorite?.exportsSimplified ?? 0)}/>
              </div>
            </Panel>}

            {tool === 'all' && data.crossTool && <CrossToolCard data={data.crossTool} since={data.crossToolSince} />}

            {showFlows && (
              <Panel
                className="min-w-0"
                title="Flows"
                sub={[
                  flowView === 'referrer' ? 'referrer → landing' : 'usage funnel',
                  tool === 'all' ? 'all tools' : tool === 'league' ? 'league' : tool === 'favorites' ? 'picker' : 'dex',
                ]}
                actions={
                  showReferrer ? (
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
                {flowView === 'referrer' && referrerSankey ? (
                  <FlowSankey kind="referrer" nodes={referrerSankey.nodes} links={referrerSankey.links} ariaLabel={referrerSankey.ariaLabel} />
                ) : (
                  <div className="flex flex-col gap-6">
                    {showDexFunnel && (
                      <div>
                        {showLeagueFunnel && (
                          <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
                            Dex builder
                          </div>
                        )}
                        <FlowSankey nodes={dexSankey.nodes} links={dexSankey.links} ariaLabel={dexSankey.ariaLabel} />
                      </div>
                    )}
                    {showLeagueFunnel && leagueSankey && (
                      <div>
                        {showDexFunnel && (
                          <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
                            Gym leader maker
                          </div>
                        )}
                        <FlowSankey nodes={leagueSankey.nodes} links={leagueSankey.links} ariaLabel={leagueSankey.ariaLabel} />
                      </div>
                    )}
                    {showFavoriteFunnel && favoriteSankey && <div>
                      {tool === 'all' && <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">Favorite Pokémon Picker</div>}
                      <FlowSankey nodes={favoriteSankey.nodes} links={favoriteSankey.links} ariaLabel={favoriteSankey.ariaLabel}/>
                    </div>}
                  </div>
                )}
              </Panel>
            )}

            {tool !== 'all' && depthCurve && (
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
                  xLabel={tool === 'league' ? 'cards' : tool === 'favorites' ? 'cells' : 'Pokémon'}
                  ariaLabel="Build depth: browsers still building by size"
                />
              </Panel>
            )}

            {data.recordedUsage && <Panel title="Recorded time and sessions" sub={["non-bounced browsers"]}>
              <RecordedUsagePanel data={data.recordedUsage[tool]} tools={tool === 'all' ? data.recordedUsage : undefined} active={data.attentionUsage?.[tool]} activeTools={tool === 'all' ? data.attentionUsage : undefined} />
            </Panel>}

            <Panel
              title="Who"
              pinHeader
              sub={
                whoFilteredN != null
                  ? [`${whoFilteredN} of ${whoN}`]
                  : [TOOL_TABS.find((t) => t.key === tool)?.label ?? '', String(whoN)]
              }
              actions={
                whoFilter ? (
                  <ClampChip clamp={whoFilter} onClear={() => setWhoFilter(null)} />
                ) : undefined
              }
            >
              <div className="flex min-w-0 flex-col gap-3">
                <PlatformStacks
                  devices={whoSrc.devices}
                  os={whoOs}
                  browsers={whoSrc.browsers}
                  joints={whoJoints}
                  buckets={whoBuckets}
                  filter={whoFilter}
                  onFilter={setWhoFilter}
                />
                <WhoOrigin
                  countries={whoSrc.countries}
                  buckets={whoBuckets}
                  filter={whoFilter}
                  onFilter={setWhoFilter}
                />
              </div>
            </Panel>

            {tool === 'dex' && (
              <WhatPeoplePick mostBySection={data.popularBySection} n={built} unit="dexes" onOpen={openDexPicks} />
            )}
            {tool === 'league' && data.league?.picks && (
              <WhatPeoplePick
                mostBySection={data.league.picks.byType}
                n={data.league.users}
                unit="leagues"
                face={leagueFace}
                onOpen={openLeaguePicks}
              />
            )}
            {tool === 'favorites' && data.favoritePicks && (
              <WhatPeoplePick
                rankedRows={preferencePreview(data.favoritePicks.preference)}
                formatValue={formatPreferenceStrength}
                actionLabel="Preference strength ›"
                emptyLabel={data.favoritePicks.charts > 0 ? 'Preference strength unavailable.' : 'No picks yet.'}
                n={data.favoritePicks.charts}
                unit="charts"
                face={pickerFace}
                onOpen={openPickerPicks}
              />
            )}

            {tool === 'all' && token && !demo && <UsageCard token={token} />}

            {(tool === 'dex' || tool === 'league' || tool === 'favorites') && <Panel title="Newest browsers" sub={[showDex ? 'dex' : tool === 'favorites' ? 'picker' : 'league', 'newest first']}>
              {(() => {
                const showPicker = tool === 'favorites';
                const listKey = showDex ? 'dex' : showPicker ? 'picker' : 'league';
                const kind: 'dex' | 'league' | 'favorites' = showDex ? 'dex' : showPicker ? 'favorites' : 'league';
                const list = data.browsers?.[listKey] ?? [];
                const archivedOf = (row: BrowserRow) => archiveOverride[bareCid(row.cid)] ?? row.archived;
                const listed = list.filter((row) => {
                  if (!matchesArchiveFilter(archivedOf(row), archiveFilter, row)) return false;
                  return matchesToolFilter(row, toolFilter);
                });
                const rows = listed.filter((row) => matchesFacetFilters(row, facetFilters));
                const sizer = widestRow(rows);
                return (
                  <>
                    {list.length === 0 && !loading && (
                      <p className="text-sm text-muted-foreground">
                        {showDex ? 'No users yet.' : showPicker ? 'No picker users yet.' : 'No league users yet.'}
                      </p>
                    )}
                    {list.length > 0 && rows.length === 0 && !loading && (
                      <p className="text-sm text-muted-foreground">No users match these filters.</p>
                    )}
                    <div className="mb-3 space-y-2">
                      <Seg ariaLabel="Browser summary source" options={[{key: 'active', label: 'Active'}, {key: 'legacy', label: 'Legacy spans'}]} value={summarySource} onChange={setSummarySource} />
                      <p className="text-xs text-muted-foreground">{summarySource === 'active'
                        ? 'Idle gaps <5 min between interactions included in session length'
                        : 'Idle gaps <30 min between interactions included in session length'}</p>
                    </div>
                    <div className={PREVIEW_TABLE}>
                      <div
                        data-preview-header
                        className="sticky top-[var(--admin-header-h,0px)] z-10 -mt-2 flex flex-wrap items-center gap-1.5 border-b border-border bg-card py-2 before:absolute before:-inset-x-4 before:inset-y-0 before:-z-10 before:bg-card md:top-[calc(var(--admin-header-h,0px)+var(--admin-bar-h,0px))] md:col-span-full md:row-start-1 md:-mt-1.5 md:grid md:grid-cols-subgrid md:items-center md:gap-x-1 md:px-2.5 md:pb-1.5 md:pt-1.5"
                      >
                        <PreviewStatusMenus
                          archiveFilter={archiveFilter}
                          setArchiveFilter={setArchiveFilter}
                          toolFilter={toolFilter}
                          setToolFilter={setToolFilter}
                        />
                        <div className="hidden h-7 items-center text-[0.7rem] font-semibold text-muted-foreground md:col-start-1 md:row-start-1 md:flex">When</div>
                        <PreviewFacetMenus listed={listed} facets={facetFilters} setFacets={setFacetFilters} />
                      </div>
                      <PreviewUsageScale>
                        {sizer && (
                          <UserPreviewCard
                            sizer
                            rec={sizer}
                            cells={toolCells(sizer, summarySource)}
                            total={totalTime(sizer, summarySource)}
                            archived={false}
                            reports={Math.max(0, ...rows.map((row) => reportsByCid.get(bareCid(row.cid)) ?? 0))}
                          />
                        )}
                        {sizer && <WhenSizer texts={whenShapes(rows)} />}
                        <VirtualRows
                          items={rows}
                          keyOf={(row) => `${listKey}:${row.cid}`}
                          className="flex flex-col gap-2 md:col-span-full md:grid md:grid-cols-subgrid md:gap-x-1 md:gap-y-2"
                          render={(row) => {
                            const archived = archivedOf(row);
                            const split = row.cid.indexOf('::');
                            return (
                              <UserPreviewCard
                                rec={row}
                                cells={toolCells(row, summarySource)}
                                total={totalTime(row, summarySource)}
                                pickerRow={showPicker}
                                archived={archived}
                                reports={reportsByCid.get(bareCid(row.cid)) ?? 0}
                                onArchive={(next) => void setArchived(row.cid, next)}
                                onOpen={() => openDetail({ kind, cid: row.cid, ...(split >= 0 ? { country: row.cid.slice(split + 2) } : {}) })}
                                onFeedback={() => {
                                  setDashScrollY(0);
                                  setPage('feedback');
                                  setFeedbackCid(bareCid(row.cid));
                                }}
                              />
                            );
                          }}
                        />
                      </PreviewUsageScale>
                    </div>
                  </>
                );
              })()}
            </Panel>}
          </>
          );
        })()}
      </main>
    </div>
  );
}
