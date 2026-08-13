import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FeedbackCard } from '@/components/admin/FeedbackCard';
import { Input } from '@/components/ui/input';
import { getAllPokemon, getPokemonById } from '@/hooks/usePokemonData';
import { BUILD_GROUPS } from '@/data/slot-template';
import { ARCHETYPES } from '@/data/archetypes';
import { getCategoryById } from '@/data/categories';
import { cn, displayName } from '@/lib/utils';
import { regionOf } from '@/lib/countryRegions';
import { matchLocale } from '@/i18n/detect';

const SECTION_META: Record<string, { name: string; color: string }> = Object.fromEntries(
  BUILD_GROUPS.map((g) => [g.id, { name: g.name, color: g.color }]),
);

// Human labels for the onboarding/funnel events shown per session.
const EVENT_LABEL: Record<string, string> = {
  'intro-shown': 'Intro shown',
  'intro-cta': 'Intro CTA',
  'intro-dismiss': 'Intro dismissed',
  'milestone-25': 'Milestone 25',
  'milestone-100': 'Milestone 100',
  'milestone-151': 'Milestone 151',
  'view-visit': 'Visited View',
};

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
const PAGE_SIZE = 50;

interface ClientRecord {
  cid: string;
  firstTs: number;
  firstAt: string;
  lastTs: number;
  lastAt: string;
  submits: number;
  sessions?: number;
  maxSessionMs?: number;
  sessionMs?: number[];
  sessionLog?: { ts: number; ids: number[]; country?: string; events?: string[] }[];
  maxDepth: number;
  localHour: number;
  localDow?: number;
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
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

interface ApiResponse {
  totalUsers: number;
  offset: number;
  limit: number;
  funnel: { users: number; completed: number; exported: number };
  funnelEvents?: Record<string, number>;
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
function fmtSecs(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Local day-of-week + hour for a record, derived from tz + last activity so it
 *  works for legacy records too (mirrors the server's localSlot). */
function localSlotOf(r: ClientRecord): { dow: number; hour: number } | null {
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
    const dow = DOW.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '');
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '', 10) % 24;
    if (dow < 0 || !Number.isFinite(hour)) return null;
    return { dow, hour };
  } catch {
    return null;
  }
}

/** 12-hour label for an hour 0–23, optionally with minutes. */
function hour12(h: number, min?: number): string {
  const ap = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return min === undefined ? `${hr} ${ap}` : `${hr}:${String(min).padStart(2, '0')} ${ap}`;
}

/** Day-of-week × hour-of-day heatmap of when users build (their local time).
 *  Cell opacity scales with count; click a cell to drill into that slot. A
 *  right column sums each day (all hours) and a bottom row sums each hour (all
 *  days); the corner is the grand total. `onCell` accepts a -1 wildcard for
 *  dow or hour to mean "the whole row/column". */
function Heatmap({ matrix, onCell }: { matrix: number[][]; onCell: (dow: number, hour: number) => void }) {
  const max = Math.max(1, ...matrix.flat());
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">No data yet.</p>;
  const dayTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));
  const hourTotals = Array.from({ length: 24 }, (_, h) => matrix.reduce((a, row) => a + row[h], 0));
  const dayMax = Math.max(1, ...dayTotals);
  const hourMax = Math.max(1, ...hourTotals);
  // Neutral (foreground) scale for the summary cells so they read distinctly
  // from the red activity cells.
  const sumBg = (v: number, m: number) =>
    v > 0 ? `color-mix(in srgb, var(--color-foreground) ${Math.round(12 + 48 * (v / m))}%, transparent)` : 'var(--color-muted)';

  return (
    <div className="w-full">
      <div className="grid gap-px w-full" style={{ gridTemplateColumns: `1.75rem repeat(24, minmax(0, 1fr)) 1.4rem` }}>
        {/* Header row: hour labels every 3h, then a Σ for the day-total column */}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-[0.5rem] text-muted-foreground text-center leading-none h-3">
            {h % 3 === 0 ? (h % 12 === 0 ? 12 : h % 12) : ''}
          </div>
        ))}
        <div className="text-[0.5rem] text-muted-foreground text-center leading-none h-3">Σ</div>

        {matrix.map((row, d) => (
          <Fragment key={d}>
            <div className="text-[0.6rem] text-muted-foreground pr-1 flex items-center justify-end h-4">
              {DOW[d]}
            </div>
            {row.map((c, h) => (
              <div
                key={h}
                className={cn('h-4 rounded-[1px]', c > 0 ? 'cursor-pointer hover:ring-1 hover:ring-foreground/40' : '')}
                style={{ backgroundColor: c > 0 ? `rgba(220,38,38,${0.15 + 0.85 * (c / max)})` : 'var(--color-muted)' }}
                title={`${DOW_FULL[d]} ${hour12(h)}: ${c}`}
                onClick={c > 0 ? () => onCell(d, h) : undefined}
              />
            ))}
            {/* Day total (all hours) */}
            <div
              className={cn(
                'h-4 rounded-[1px] flex items-center justify-center text-[0.5rem] tabular-nums',
                dayTotals[d] > 0 ? 'cursor-pointer hover:ring-1 hover:ring-foreground/40' : '',
              )}
              style={{ backgroundColor: sumBg(dayTotals[d], dayMax) }}
              title={`${DOW_FULL[d]} · all hours: ${dayTotals[d]}`}
              onClick={dayTotals[d] > 0 ? () => onCell(d, -1) : undefined}
            >
              {dayTotals[d] || ''}
            </div>
          </Fragment>
        ))}

        {/* Bottom summary row: per-hour totals (all days), then grand total */}
        <div className="text-[0.6rem] text-muted-foreground pr-1 flex items-center justify-end h-4">Σ</div>
        {hourTotals.map((c, h) => (
          <div
            key={h}
            className={cn(
              'h-4 rounded-[1px] flex items-center justify-center text-[0.5rem] tabular-nums overflow-hidden',
              c > 0 ? 'cursor-pointer hover:ring-1 hover:ring-foreground/40' : '',
            )}
            style={{ backgroundColor: sumBg(c, hourMax) }}
            title={`${hour12(h)} · all days: ${c}`}
            onClick={c > 0 ? () => onCell(-1, h) : undefined}
          >
            {c || ''}
          </div>
        ))}
        <div
          className="h-4 rounded-[1px] flex items-center justify-center text-[0.5rem] tabular-nums font-semibold"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-foreground) 18%, transparent)' }}
          title={`Total builds: ${total}`}
        >
          {total}
        </div>
      </div>
    </div>
  );
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

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col px-3 py-2 rounded-md bg-muted min-w-[6.5rem]">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="shadow-elevated rounded-lg p-3 bg-card">
      <div className="text-sm font-medium mb-2">{title}</div>
      {children}
    </div>
  );
}

/** Horizontal bar rows with a label and count — for categorical tallies. */
function Bars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-muted-foreground text-right">{r.label}</span>
          <div className="flex-1 bg-muted rounded h-4 overflow-hidden">
            <div className="h-full bg-primary/70" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 tabular-nums">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

/** Shade for the Nth-largest group. An intensity ramp rather than a set of
 *  unrelated hues: the groups are *ranked*, and the ramp says so. It also ties
 *  each segment of the share bar to its row in the list below without needing a
 *  separate legend. */
function rampOpacity(i: number): number {
  return Math.max(0.18, 1 - i * 0.16);
}

/** One-row part-to-whole bar. This is the pie chart's job done in a row: the
 *  same share-of-total read, a fraction of the height, and no sliver labels —
 *  segments too narrow to hold a number simply don't get one. */
function ShareBar({ rows, total }: { rows: { label: string; count: number }[]; total: number }) {
  if (!total) return null;
  const pct = (n: number) => (n / total) * 100;
  return (
    <div
      className="flex w-full h-5 rounded overflow-hidden bg-muted mb-2"
      role="img"
      aria-label={rows.map((r) => `${r.label} ${Math.round(pct(r.count))}%`).join(', ')}
    >
      {rows.map((r, i) => (
        <div
          key={r.label}
          className="h-full bg-primary flex items-center justify-center"
          style={{ width: `${pct(r.count)}%`, opacity: rampOpacity(i) }}
          title={`${r.label} · ${r.count} (${Math.round(pct(r.count))}%)`}
        >
          {/* Only the darkest segments carry inline text; on the paler ones
              white would not have the contrast to be read. */}
          {pct(r.count) >= 12 && i <= 1 && (
            <span className="text-[0.55rem] text-primary-foreground tabular-nums">
              {Math.round(pct(r.count))}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface BarGroup {
  label: string;
  count: number;
  children: { label: string; count: number }[];
}

/** Ranked bar list whose rows open to reveal their members. The long tail is
 *  what costs the space, so it starts folded away: the groups answer "roughly
 *  where", and a tap answers "exactly where". */
function GroupedBars({ groups }: { groups: BarGroup[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const max = Math.max(1, ...groups.map((g) => g.count));
  const toggle = (label: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(label)) next.add(label);
      return next;
    });

  return (
    <div className="flex flex-col gap-1">
      {groups.map((g, i) => {
        const isOpen = open.has(g.label);
        // Members scale against the biggest member of their own group, not the
        // global max — otherwise every row of a small group renders as a stub.
        // The printed count stays the authoritative value.
        const childMax = Math.max(1, ...g.children.map((c) => c.count));
        return (
          <div key={g.label}>
            <button
              type="button"
              onClick={() => toggle(g.label)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2 text-xs cursor-pointer"
            >
              <span className="w-28 shrink-0 text-muted-foreground text-left truncate">
                <span className="inline-block w-2">{isOpen ? '▾' : '▸'}</span> {g.label}
              </span>
              <div className="flex-1 bg-muted rounded h-4 overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(g.count / max) * 100}%`, opacity: rampOpacity(i) }}
                />
              </div>
              <span className="w-8 shrink-0 tabular-nums text-right">{g.count}</span>
            </button>
            {isOpen && (
              <div className="ml-4 my-1 flex flex-col gap-1 border-l border-border/60 pl-2">
                {g.children.map((c) => (
                  <div key={c.label} className="flex items-center gap-2 text-[0.7rem]">
                    <span className="w-24 shrink-0 text-muted-foreground truncate">{c.label}</span>
                    <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
                      <div
                        className="h-full bg-primary/60"
                        style={{ width: `${(c.count / childMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 tabular-nums text-right">{c.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Onboarding funnel: descending steps as % of the top step (bar width), with
 *  each step's raw count and the step-to-step conversion. The intro→CTA/dismiss
 *  split is shown as a sub-breakdown of the intro step, not funnel steps. */
function FunnelChart({ events }: { events: Record<string, number> }) {
  const g = (k: string) => events[k] ?? 0;
  // Ordered funnel steps (monotonic-ish; each is a strict subset of intent).
  const steps: { label: string; count: number }[] = [
    { label: 'Saw intro', count: g('intro-shown') },
    { label: 'Placed ≥25', count: g('milestone-25') },
    { label: 'Placed ≥100', count: g('milestone-100') },
    { label: 'Completed 151', count: g('milestone-151') },
    { label: 'Visited View', count: g('view-visit') },
  ];
  const top = Math.max(1, steps[0].count);
  const introCta = g('intro-cta');
  const introDismiss = g('intro-dismiss');
  const introTotal = g('intro-shown');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {steps.map((s, i) => {
          const pctOfTop = (s.count / top) * 100;
          // Conversion from the previous step (drop-off between stages).
          const prev = i > 0 ? steps[i - 1].count : s.count;
          const conv = prev > 0 ? Math.round((s.count / prev) * 100) : 0;
          return (
            <div key={s.label} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground text-right">{s.label}</span>
              <div className="flex-1 bg-muted rounded h-5 overflow-hidden relative">
                <div
                  className="h-full bg-primary/70 rounded"
                  style={{ width: `${Math.max(pctOfTop, s.count > 0 ? 2 : 0)}%` }}
                />
                <span className="absolute inset-y-0 left-1.5 flex items-center text-[0.6rem] tabular-nums text-foreground/80">
                  {s.count} · {Math.round(pctOfTop)}%
                </span>
              </div>
              <span className="w-16 shrink-0 tabular-nums text-muted-foreground text-right">
                {i > 0 ? `→ ${conv}%` : 'top'}
              </span>
            </div>
          );
        })}
      </div>
      {introTotal > 0 && (
        <div className="text-[0.65rem] text-muted-foreground">
          Of {introTotal} who saw the intro:{' '}
          <span className="text-foreground">
            {introCta} chose starters ({Math.round((introCta / introTotal) * 100)}%)
          </span>
          ,{' '}
          <span className="text-foreground">
            {introDismiss} dismissed ({Math.round((introDismiss / introTotal) * 100)}%)
          </span>
          .
        </div>
      )}
    </div>
  );
}

/** Pre/post cohort comparison with a date slider. Splits users by firstTs into
 *  "before" and "on/after" the cutoff, and compares the % who reached each
 *  threshold — an observational before/after read on onboarding, using data
 *  (firstTs, peak count) that predates it. Not a randomized A/B test. */
function PrePostCohort({
  cohort,
  launchTs,
}: {
  cohort: [number, number, number, 0 | 1, 0 | 1][];
  launchTs?: number;
}) {
  const minTs = Math.min(...cohort.map((c) => c[0]));
  const maxTs = Math.max(...cohort.map((c) => c[0]));
  const dayMs = 86_400_000;
  const minDay = Math.floor(minTs / dayMs);
  const maxDay = Math.floor(maxTs / dayMs) + 1;
  // Default the cutoff to the onboarding launch date (clamped into range) so it
  // lands on the real pre/post boundary; fall back to the latest signup.
  const [cutoffDay, setCutoffDay] = useState(() => {
    const launchDay = launchTs ? Math.floor(launchTs / dayMs) : maxDay;
    return Math.min(maxDay, Math.max(minDay, launchDay));
  });
  const cutoff = cutoffDay * dayMs;

  const metrics = [
    { label: 'Reached 25', test: (c: (typeof cohort)[number]) => c[1] >= 25 },
    { label: 'Reached 100', test: (c: (typeof cohort)[number]) => c[1] >= 100 },
    { label: 'Completed 151', test: (c: (typeof cohort)[number]) => c[3] === 1 || c[1] >= 151 },
    { label: 'Exported', test: (c: (typeof cohort)[number]) => c[4] === 1 },
  ];
  const before = cohort.filter((c) => c[0] < cutoff);
  const after = cohort.filter((c) => c[0] >= cutoff);
  const rate = (arm: typeof cohort, test: (c: (typeof cohort)[number]) => boolean) =>
    arm.length ? (arm.filter(test).length / arm.length) * 100 : 0;

  const cutoffLabel = new Date(cutoff).toLocaleDateString();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground shrink-0">Cutoff</span>
        <input
          type="range"
          min={minDay}
          max={maxDay}
          value={cutoffDay}
          onChange={(e) => setCutoffDay(Number(e.target.value))}
          className="flex-1"
        />
        <span className="tabular-nums font-medium shrink-0">{cutoffLabel}</span>
        {launchTs && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setCutoffDay(Math.min(maxDay, Math.max(minDay, Math.floor(launchTs / dayMs))))}
          >
            ↺ launch
          </Button>
        )}
      </div>
      <div className="text-[0.65rem] text-muted-foreground">
        Before: <span className="text-foreground">{before.length} users</span> · On/after:{' '}
        <span className="text-foreground">{after.length} users</span>
        {launchTs && cutoff === Math.floor(launchTs / dayMs) * dayMs && ' · onboarding launch'}
      </div>
      <div className="flex flex-col gap-2">
        {metrics.map((m) => {
          const rb = rate(before, m.test);
          const ra = rate(after, m.test);
          const delta = ra - rb;
          return (
            <div key={m.label} className="text-xs">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-muted-foreground">{m.label}</span>
                <span className={cn('tabular-nums', delta >= 0 ? 'text-green-600' : 'text-destructive')}>
                  {delta >= 0 ? '+' : ''}
                  {Math.round(delta)}pp
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-right text-muted-foreground">before</span>
                <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
                  <div className="h-full bg-foreground/40" style={{ width: `${rb}%` }} />
                </div>
                <span className="w-16 shrink-0 tabular-nums">{Math.round(rb)}% ({before.filter(m.test).length})</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-12 shrink-0 text-right text-muted-foreground">after</span>
                <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
                  <div className="h-full bg-primary/70" style={{ width: `${ra}%` }} />
                </div>
                <span className="w-16 shrink-0 tabular-nums">{Math.round(ra)}% ({after.filter(m.test).length})</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[0.6rem] text-muted-foreground">
        Observational before/after (not randomized). Small cohorts are noisy — treat differences as
        directional until each arm has a few hundred users.
      </p>
    </div>
  );
}

/** Round a number up to a "nice" 1/2/5 × 10^k value (e.g. 7.6 → 10, 23 → 50). */
function niceNum(x: number): number {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const pow = Math.pow(10, exp);
  const f = x / pow; // 1..10
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * pow;
}

/** Build a y-axis of round tick values covering [0, rawMax] with ~`target`
 *  intervals. Returns the axis ceiling (used to scale the chart) and the
 *  ascending tick list, so labels are always 0, step, 2·step, … not raw maxima. */
function niceAxis(rawMax: number, target = 3): { axisMax: number; ticks: number[] } {
  const step = Math.max(1, niceNum(rawMax / target)); // integer counts: never sub-1 ticks
  const axisMax = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= axisMax + step / 2; v += step) ticks.push(v);
  return { axisMax, ticks };
}

/** Compact tick label: 1500 → "1.5k", 2000 → "2k", 30 → "30". */
function fmtTick(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `${v}`;
}

/** Active-users line chart: daily active users (DAU) and a trailing-7-day
 *  rolling active count (a WAU that updates every day). Press/move over the
 *  chart to read exact values on a given day. */
function ActivityChart({ series }: { series: { day: number; dau: number; rolling7: number }[] }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  if (series.length < 2) return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;

  const W = 340;
  const H = 130;
  const padL = 22;
  const padR = 6;
  const padT = 8;
  const padB = 18;
  const rawMax = Math.max(1, ...series.map((d) => Math.max(d.dau, d.rolling7)));
  const { axisMax, ticks } = niceAxis(rawMax);
  const n = series.length;
  const px = (i: number) => padL + ((W - padL - padR) * i) / (n - 1);
  const py = (v: number) => padT + (H - padT - padB) * (1 - v / axisMax);

  // Segments drawn dotted mark provisional data. The final segment into
  // "today" is provisional for both lines (today is still accumulating). The
  // first RAMP days are provisional for the rolling-7 line only — its window
  // is not yet full — while each day's DAU is already a complete count.
  const RAMP = 7;
  const isToday = (i: number) => i === n - 2;
  const dauProvisional = (i: number) => isToday(i);
  const r7Provisional = (i: number) => i <= RAMP - 2 || isToday(i);
  const segPath = (key: 'dau' | 'rolling7', prov: (i: number) => boolean, wantProvisional: boolean) => {
    let d = '';
    for (let i = 0; i < n - 1; i++) {
      if (prov(i) !== wantProvisional) continue;
      d += `M ${px(i)},${py(series[i][key])} L ${px(i + 1)},${py(series[i + 1][key])} `;
    }
    return d.trim();
  };

  // Shade the area under the DAU line for the trailing 7 days — the days that
  // roll into today's rolling-7 count, so the earliest of them is the value
  // dropping out next (the "target to beat" today).
  const shadeStart = Math.max(0, n - 7);
  let dauArea = `M ${px(shadeStart)},${py(0)}`;
  for (let i = shadeStart; i < n; i++) dauArea += ` L ${px(i)},${py(series[i].dau)}`;
  dauArea += ` L ${px(n - 1)},${py(0)} Z`;

  const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const step = Math.max(1, Math.ceil(n / 8));

  const updateCursor = (clientX: number) => {
    const el = areaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setCursor(Math.round(frac * (n - 1)));
  };
  const cur = cursor !== null ? series[Math.min(cursor, n - 1)] : null;

  return (
    <div className="w-full">
      {/* Legend — identity is never color-alone */}
      <div className="flex items-center gap-3 mb-1 text-[0.65rem]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-[2px] bg-primary" /> Rolling 7-day
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-[2px]" style={{ backgroundColor: 'var(--color-muted-foreground)' }} /> Daily (DAU)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 border-b border-dashed" style={{ borderColor: 'var(--color-muted-foreground)' }} /> Provisional
        </span>
      </div>
      <div
        ref={areaRef}
        className="relative w-full touch-none select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateCursor(e.clientX);
        }}
        onPointerMove={(e) => cursor !== null && updateCursor(e.clientX)}
        onPointerUp={() => setCursor(null)}
        onPointerLeave={() => setCursor(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: 'auto' }} preserveAspectRatio="none">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} y1={py(t)} x2={W - padR} y2={py(t)} stroke="var(--color-muted)" strokeWidth={1} />
              <text x={2} y={py(t) + 3} fontSize={7} fill="var(--color-muted-foreground)">
                {fmtTick(t)}
              </text>
            </g>
          ))}
          {/* Trailing-7-day window feeding today's rolling count */}
          <path d={dauArea} fill="var(--color-muted-foreground)" opacity={0.1} stroke="none" />
          {/* DAU — solid; only today (still accumulating) is dotted */}
          <path d={segPath('dau', dauProvisional, false)} fill="none" stroke="var(--color-muted-foreground)" strokeWidth={1} opacity={0.7} />
          <path d={segPath('dau', dauProvisional, true)} fill="none" stroke="var(--color-muted-foreground)" strokeWidth={1} opacity={0.7} strokeDasharray="2 2" />
          {/* Rolling 7-day (WAU) — dotted over ramp-up (window not yet full) + today */}
          <path d={segPath('rolling7', r7Provisional, false)} fill="none" stroke="rgb(220,38,38)" strokeWidth={1.5} />
          <path d={segPath('rolling7', r7Provisional, true)} fill="none" stroke="rgb(220,38,38)" strokeWidth={1.5} strokeDasharray="3 2" />
          {cur && cursor !== null && (
            <line x1={px(cursor)} y1={padT} x2={px(cursor)} y2={H - padB} stroke="var(--color-foreground)" strokeWidth={1} />
          )}
        </svg>
        {cur && cursor !== null && (
          <div
            className="absolute -top-1 -translate-x-1/2 pointer-events-none whitespace-nowrap rounded bg-foreground text-background text-[0.6rem] px-1 py-0.5"
            style={{ left: `${(px(cursor) / W) * 100}%` }}
          >
            {fmtDay(cur.day)} · {cur.rolling7}w · {cur.dau}d
          </div>
        )}
      </div>
      {/* x-axis labels */}
      <div className="flex justify-between text-[0.55rem] text-muted-foreground mt-0.5 px-[6px]">
        {series
          .map((d, i) => ({ d, i }))
          .filter(({ i }) => i % step === 0 || i === n - 1)
          .map(({ d, i }) => (
            <span key={i}>{fmtDay(d.day)}</span>
          ))}
      </div>
    </div>
  );
}

/** Lightweight modal overlay (no dependency). Click backdrop or ✕ to close. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-card rounded-lg shadow-elevated w-full max-w-2xl max-h-[85dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">{title}</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
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
function PopularPanel({
  title,
  rows,
  bySection,
  minCount,
  preview = 30,
}: {
  title: string;
  rows: [string, number][];
  bySection?: Record<string, [string, number][]>;
  minCount?: number;
  preview?: number;
}) {
  const [open, setOpen] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const hasSections = !!bySection && Object.keys(bySection).length > 0;
  return (
    <div className="shadow-elevated rounded-lg p-3 bg-card">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-sm font-medium">
          {title}
          {minCount && minCount > 1 ? (
            <span className="text-muted-foreground font-normal"> · in ≥{minCount} dexes (above avg)</span>
          ) : null}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {hasSections && (
            <Button variant={grouped ? 'default' : 'ghost'} size="sm" onClick={() => setGrouped((v) => !v)}>
              By section
            </Button>
          )}
          {!grouped && rows.length > preview && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              View all ({rows.length})
            </Button>
          )}
        </div>
      </div>
      {grouped && bySection ? (
        <SectionGroupedGrids bySection={bySection} />
      ) : (
        <>
          <PopularGrid rows={rows.slice(0, preview)} />
          {open && (
            <Modal title={title} onClose={() => setOpen(false)}>
              <PopularGrid rows={rows} />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

/** Renders one PopularGrid per build section, in the build page's current
 *  order; sections not in BUILD_GROUPS (e.g. removed later) sort to the end and
 *  show their raw id. Pure display from raw section ids → never needs a wipe. */
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
function Survival({
  points,
  fmtX,
  xLabel,
}: {
  points: { t: number; s: number }[];
  fmtX: (t: number) => string;
  xLabel: string;
}) {
  const [cursor, setCursor] = useState<number | null>(null); // index into points
  const areaRef = useRef<HTMLDivElement>(null);

  if (points.length < 2 || points[0].s === 0) {
    return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  }
  const W = 320;
  const H = 120;
  const padL = 28;
  const padB = 16;
  const padT = 6;
  const padR = 6;
  const xMax = points[points.length - 1].t || 1;
  const plotLeft = padL / W; // plot area as fractions of total width
  const plotW = (W - padL - padR) / W;
  const px = (t: number) => padL + ((W - padL - padR) * t) / xMax;
  const py = (s: number) => padT + (H - padT - padB) * (1 - s);

  // Steepest drop between consecutive samples (the churn cliff).
  let dropIdx = -1;
  let dropAmt = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i - 1].s - points[i].s;
    if (d > dropAmt) {
      dropAmt = d;
      dropIdx = i;
    }
  }

  const line = points.map((p) => `${px(p.t)},${py(p.s)}`).join(' ');
  const area = `${padL},${py(0)} ${line} ${px(xMax)},${py(0)}`;

  // Map a pointer's clientX → nearest sample index (press-and-hold crosshair).
  const updateCursor = (clientX: number) => {
    const el = areaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    // Convert full-width fraction → fraction within the plot area → t.
    const plotFrac = Math.min(1, Math.max(0, (frac - plotLeft) / plotW));
    const t = plotFrac * xMax;
    // nearest point by t
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].t - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setCursor(best);
  };

  const cur = cursor !== null ? points[cursor] : null;
  const curLeftPct = cur ? (px(cur.t) / W) * 100 : 0;

  return (
    <div className="w-full">
      <div
        ref={areaRef}
        className="relative w-full touch-none select-none cursor-crosshair"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateCursor(e.clientX);
        }}
        onPointerMove={(e) => {
          if (cursor !== null) updateCursor(e.clientX);
        }}
        onPointerUp={() => setCursor(null)}
        onPointerLeave={() => setCursor(null)}
        onPointerCancel={() => setCursor(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: 'auto' }} preserveAspectRatio="none">
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <g key={g}>
              <line x1={padL} y1={py(g)} x2={W - padR} y2={py(g)} stroke="var(--color-muted)" strokeWidth={1} />
              <text x={2} y={py(g) + 3} fontSize={7} fill="var(--color-muted-foreground)">
                {Math.round(g * 100)}%
              </text>
            </g>
          ))}
          <polygon points={area} fill="rgba(220,38,38,0.12)" />
          <polyline points={line} fill="none" stroke="rgb(220,38,38)" strokeWidth={1.5} />
          {dropIdx > 0 && dropAmt > 0.01 && cursor === null && (
            <line
              x1={px(points[dropIdx - 1].t)}
              y1={py(points[dropIdx - 1].s)}
              x2={px(points[dropIdx].t)}
              y2={py(points[dropIdx].s)}
              stroke="rgb(220,38,38)"
              strokeWidth={4}
            />
          )}
          {cur && <line x1={px(cur.t)} y1={padT} x2={px(cur.t)} y2={H - padB} stroke="var(--color-foreground)" strokeWidth={1} />}
        </svg>
        {/* crosshair dot + readout, in HTML so it isn't distorted by the SVG scale */}
        {cur && (
          <>
            <div
              className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-foreground pointer-events-none"
              style={{ left: `${curLeftPct}%`, top: `${(py(cur.s) / H) * 100}%` }}
            />
            <div
              className="absolute -translate-x-1/2 -top-1 pointer-events-none whitespace-nowrap rounded bg-foreground text-background text-[0.6rem] px-1 py-0.5"
              style={{ left: `${Math.min(85, Math.max(15, curLeftPct))}%` }}
            >
              {fmtX(cur.t)} · {Math.round(cur.s * 100)}% left
            </div>
          </>
        )}
      </div>
      <div className="flex justify-between text-[0.6rem] text-muted-foreground px-1 mt-0.5">
        <span>0</span>
        <span>{xLabel}</span>
        <span>{fmtX(xMax)}</span>
      </div>
      {dropIdx > 0 && dropAmt > 0.01 && (
        <p className="text-xs text-muted-foreground mt-1">
          Sharpest drop-off around <span className="font-medium text-foreground">{fmtX(points[dropIdx].t)}</span>{' '}
          (−{Math.round(dropAmt * 100)}%). <span className="opacity-70">Press &amp; hold the chart to inspect.</span>
        </p>
      )}
    </div>
  );
}

/** "50% by 1m · 75% by 4m · 90% by 12m" readout from p50/p75/p90 stats. */
function ChurnReadout({ stats, fmt }: { stats: { p50: number; p75: number; p90: number }; fmt: (n: number) => string }) {
  return (
    <p className="text-xs text-muted-foreground mt-1">
      Half drop off by <span className="font-medium text-foreground">{fmt(stats.p50)}</span> · 75% by{' '}
      <span className="font-medium text-foreground">{fmt(stats.p75)}</span> · 90% by{' '}
      <span className="font-medium text-foreground">{fmt(stats.p90)}</span>
    </p>
  );
}

type SurvivalCurve = { survival: { t: number; s: number }[]; stats: { p50: number; p75: number; p90: number }; n: number };

/** Drop-off card with a configurable basis toggle. `tabs` lists the available
 *  bases (key/label/note); `curves` maps each key to its survival curve. Falls
 *  back to a flat surface if `curves` is absent (older deploy). */
function BasisDropoffCard<K extends string>({
  title,
  curves,
  tabs,
  fallback,
  fmtX,
  xLabel,
  hint,
  extra,
}: {
  title: string;
  curves?: Partial<Record<K, SurvivalCurve>>;
  tabs: { key: K; label: string; note: string }[];
  fallback: SurvivalCurve;
  fmtX: (n: number) => string;
  xLabel: string;
  hint?: string;
  /** Optional extra control row (e.g. a metric toggle) rendered under the title. */
  extra?: React.ReactNode;
}) {
  const [basis, setBasis] = useState<K>(tabs[0].key);
  const curve = curves?.[basis] ?? fallback;
  const active = tabs.find((t) => t.key === basis) ?? tabs[0];
  return (
    <div className="shadow-elevated rounded-lg p-3 bg-card">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <span className="text-sm font-medium">{title}</span>
        {curves && (
          <div className="flex items-center gap-1 shrink-0 flex-wrap">
            {tabs.map((t) => (
              <Button
                key={t.key}
                variant={basis === t.key ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setBasis(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      {extra && <div className="flex items-center gap-1 mb-2 flex-wrap">{extra}</div>}
      <Survival points={curve.survival} fmtX={fmtX} xLabel={xLabel} />
      <ChurnReadout stats={curve.stats} fmt={fmtX} />
      {curves && (
        <p className="text-[0.65rem] text-muted-foreground mt-0.5">
          {active.note} (n={curve.n}).{hint ? ` ${hint}` : ''}
        </p>
      )}
    </div>
  );
}

/** Build drop-off card with a metric toggle (# Pokemon vs # evolution lines)
 *  layered on top of the session-basis toggle. Defaults to # Pokemon. */
function BuildDropoffCard({ data }: { data: ApiResponse }) {
  const [metric, setMetric] = useState<'mon' | 'line'>('mon');
  const curves = metric === 'mon' ? data.monCurves : data.lineCurves;
  const unit = metric === 'mon' ? 'Pokémon' : 'lines';
  const metricToggle = (
    <>
      <span className="text-[0.65rem] text-muted-foreground mr-1">Measure:</span>
      <Button variant={metric === 'mon' ? 'default' : 'ghost'} size="sm" onClick={() => setMetric('mon')}>
        # Pokémon
      </Button>
      <Button variant={metric === 'line' ? 'default' : 'ghost'} size="sm" onClick={() => setMetric('line')}>
        # Evo lines
      </Button>
    </>
  );
  return (
    <BasisDropoffCard
      title="Build drop-off (how far users get)"
      curves={curves}
      tabs={[
        { key: 'total', label: 'Total', note: `Peak ${unit} ever reached` },
        { key: 'first', label: 'First', note: `${unit} added in the first session` },
        { key: 'longest', label: 'Longest', note: `${unit} added in the longest session` },
        { key: 'all', label: 'All', note: `${unit} added per session, pooled` },
      ]}
      fallback={{ survival: data.depthSurvival, stats: data.depthStats, n: 0 }}
      fmtX={(n) => `${n} ${unit}`}
      xLabel={unit}
      extra={metricToggle}
      hint={
        data.multiSession === 0
          ? 'All users are single-session so far, so First/Longest/All match Total — they diverge once a user builds across 2+ visits.'
          : `${data.multiSession} multi-session user${data.multiSession === 1 ? '' : 's'} differentiate these views.`
      }
    />
  );
}

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

function tallyRows(counts: Record<string, number>, withFlag = false) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ label: withFlag ? `${flag(k)} ${k}` : k, count: n }));
}

/** Fold the country tally into regions, largest first, each keeping its own
 *  countries as members. */
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
function languageRows(languages: Record<string, number>) {
  const shipped = new Map<string, number>();
  const missing = new Map<string, number>();
  for (const [tag, n] of Object.entries(languages)) {
    const match = matchLocale(tag);
    if (match) {
      shipped.set(match, (shipped.get(match) ?? 0) + n);
    } else {
      const base = tag.split('-')[0].toLowerCase();
      missing.set(base, (missing.get(base) ?? 0) + n);
    }
  }
  return [
    ...[...shipped].map(([code, count]) => ({ code, count, isShipped: true })),
    ...[...missing].map(([code, count]) => ({ code, count, isShipped: false })),
  ].sort((a, b) => b.count - a.count);
}

/** Users per language, flagging the ones the app does not yet ship. */
function LanguageBars({ languages }: { languages: Record<string, number> }) {
  const rows = languageRows(languages);
  if (!rows.length) return <p className="text-xs text-muted-foreground">No data yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const unshipped = rows.filter((r) => !r.isShipped).reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r) => (
        <div key={r.code} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0 text-muted-foreground truncate">{langLabel(r.code)}</span>
          <div className="flex-1 bg-muted rounded h-4 overflow-hidden">
            <div
              className="h-full"
              style={{
                width: `${(r.count / max) * 100}%`,
                backgroundColor: r.isShipped ? 'var(--color-primary)' : 'rgb(217,119,6)',
                opacity: 0.75,
              }}
            />
          </div>
          <span className="w-8 shrink-0 tabular-nums text-right">{r.count}</span>
        </div>
      ))}
      <p className="text-[0.6rem] text-muted-foreground mt-1 leading-snug">
        <span
          className="inline-block w-2 h-2 rounded-[2px] align-middle mr-1"
          style={{ backgroundColor: 'rgb(217,119,6)', opacity: 0.75 }}
        />
        Not shipped — {unshipped} {unshipped === 1 ? 'user' : 'users'}. From the browser's
        Accept-Language header, which is a preference, not proof of what we served.
      </p>
    </div>
  );
}

const SORT_LABELS: Record<string, string> = {
  'build-order': 'Build Order',
  regional: 'Regional',
  national: 'National',
  type: 'Type',
  custom: 'Custom',
};

/** Compact summary of the View settings used for an export, e.g.
 *  "Build Order · outlines · specials grouped". */
function fmtExportSettings(s: NonNullable<ClientRecord['exportSettings']>): string {
  const parts = [SORT_LABELS[s.sort] ?? s.sort];
  if (s.outlines) parts.push('outlines');
  parts.push(s.groupSpecial ? 'specials grouped' : 'specials inline');
  if (s.showStats) parts.push('stats');
  return parts.join(' · ');
}

function UserCard({ rec, onDelete, expanded, onToggle, zIndex, stickyOffset }: { rec: ClientRecord; onDelete: (rec: ClientRecord) => void; expanded: boolean; onToggle: () => void; zIndex: number; stickyOffset: number }) {
  const [droppedOpen, setDroppedOpen] = useState(false);
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
  const [stickyLabelTop, setStickyLabelTop] = useState(0);
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

  useLayoutEffect(() => {
    if (expanded && headerRef.current) {
      setStickyLabelTop(stickyOffset + headerRef.current.offsetHeight);
    }
  }, [expanded, stickyOffset]);

  const handleToggle = () => {
    if (expanded) {
      onToggle();
      requestAnimationFrame(() => {
        const el = cardRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < 0) {
          el.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
      });
    } else {
      onToggle();
    }
  };

  return (
    <section ref={cardRef} style={{ zIndex, scrollMarginTop: stickyOffset }}>
      <div ref={headerRef} className="sticky z-[5]" style={{ top: stickyOffset }}>
        <div className="h-4 bg-background" />
        <div className={`bg-card p-3 ${expanded ? 'pb-1 border-b border-border/50 rounded-t-lg shadow-elevated' : 'rounded-lg shadow-elevated'}`}>
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
                {userLocal && <> · their {userLocal}</>}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={handleToggle}>
                {expanded ? 'Hide' : 'Builds'}
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
      {expanded && (
        <div className="flex flex-col gap-2 p-3 pt-2 bg-card rounded-b-lg shadow-elevated">
          <FinalBySection rec={rec} stickyTop={stickyLabelTop} />
          <DexMilestones rec={rec} stickyTop={stickyLabelTop} />
          <SessionDiffs rec={rec} stickyTop={stickyLabelTop} />
          <DroppedPokemon rec={rec} stickyTop={stickyLabelTop} droppedOpen={droppedOpen} setDroppedOpen={setDroppedOpen} />
        </div>
      )}
    </section>
  );
}

const STICKY_LABEL_CLASS = 'sticky z-[4] bg-card text-xs text-muted-foreground mb-0.5 py-0.5 border-b border-border/50';
function stickyLabelStyle(top?: number): React.CSSProperties | undefined {
  if (!top) return undefined;
  return { top };
}

/** Final/current dex grouped by build section with off-section highlighting.
 *  Falls back to a flat sprite row for legacy records without section data. */
function FinalBySection({ rec, stickyTop }: { rec: ClientRecord; stickyTop?: number }) {
  const secs = rec.latestSections;

  if (!secs || Object.keys(secs).length === 0) {
    if (!rec.latestIds?.length) return null;
    return (
      <div>
        <div className={STICKY_LABEL_CLASS} style={stickyLabelStyle(stickyTop)}>
          Final / current ({rec.latestIds.length})
        </div>
        <SpriteRow ids={rec.latestIds} />
      </div>
    );
  }

  const order = BUILD_GROUPS.map((g) => g.id);
  const present = Object.keys(secs).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const total = present.reduce((sum, sid) => sum + secs[sid].length, 0);
  const offTotal = present.reduce(
    (sum, sid) => sum + secs[sid].filter((id) => isOffSection(id, sid)).length,
    0,
  );

  return (
    <div>
      <div className={STICKY_LABEL_CLASS} style={stickyLabelStyle(stickyTop)}>
        Final / current ({total})
        {offTotal > 0 && <span className="text-amber-600 font-medium"> · {offTotal} off-section</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        {present.map((sid) => {
          const meta = SECTION_META[sid];
          const ids = secs[sid];
          return (
            <div key={sid}>
              <div className="text-[0.65rem] flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: meta?.color ?? '#9ca3af' }} />
                {meta?.name ?? sid} <span className="text-muted-foreground">· {ids.length}</span>
              </div>
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {ids.map((id, idx) => {
                  const p = getPokemonById(id);
                  const off = isOffSection(id, sid);
                  return (
                    <div
                      key={`${id}-${idx}`}
                      title={`${p ? '#' + id + ' ' + displayName(p.name) : '#' + id}${off ? ' — not a default here' : ''}`}
                      className={cn(
                        'w-6 h-6 shrink-0 flex items-center justify-center rounded',
                        off && 'ring-1 ring-amber-500 bg-amber-500/10',
                      )}
                    >
                      {p ? (
                        <img src={p.sprite} alt={p.name} width={24} height={24} loading="lazy" style={{ imageRendering: 'pixelated' }} />
                      ) : (
                        <span className="text-[0.5rem] text-muted-foreground">#{id}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Unified completed/exported dex block with tabs when snapshots differ. */
function DexMilestones({ rec, stickyTop }: { rec: ClientRecord; stickyTop?: number }) {
  const [activeKey, setActiveKey] = useState('');

  const latestSig = (rec.latestIds ?? []).slice().sort((a, b) => a - b).join(',');
  const seen = new Set<string>([latestSig]);
  const tabs: { key: string; label: string; ids: number[] }[] = [];

  const maybeAdd = (key: string, label: string, ids?: number[]) => {
    if (!ids?.length) return;
    const sig = ids.slice().sort((a, b) => a - b).join(',');
    if (seen.has(sig)) return;
    seen.add(sig);
    tabs.push({ key, label, ids });
  };

  maybeAdd('completed', 'Completed', rec.completedIds);
  maybeAdd('exported', 'Exported', rec.exportedIds);

  if (tabs.length === 0) return null;

  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  return (
    <div>
      <div
        className={cn(STICKY_LABEL_CLASS, 'flex items-center gap-1')}
        style={stickyLabelStyle(stickyTop)}
      >
        {tabs.length === 1 ? (
          <span>{active.label} dex ({active.ids.length})</span>
        ) : (
          tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveKey(t.key)}
              className={cn(
                'px-1.5 py-0.5 rounded text-xs cursor-pointer transition-colors',
                active.key === t.key ? 'bg-muted font-medium text-foreground' : 'hover:bg-muted/50',
              )}
            >
              {t.label} ({t.ids.length})
            </button>
          ))
        )}
      </div>
      <SpriteRow ids={active.ids} />
    </div>
  );
}

/** Collapsible "tried then dropped" section. */
function DroppedPokemon({
  rec,
  stickyTop,
  droppedOpen,
  setDroppedOpen,
}: {
  rec: ClientRecord;
  stickyTop?: number;
  droppedOpen: boolean;
  setDroppedOpen: (fn: (v: boolean) => boolean) => void;
}) {
  const kept = new Set(rec.latestIds ?? []);
  const dropped = (rec.everIds ?? []).filter((id) => !kept.has(id));
  if (dropped.length === 0) return null;

  return (
    <div>
      <div
        className={cn(STICKY_LABEL_CLASS, 'flex items-center gap-1 cursor-pointer select-none')}
        style={stickyLabelStyle(stickyTop)}
        onClick={() => setDroppedOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDroppedOpen((v) => !v);
          }
        }}
      >
        <span className={cn('text-[0.5rem] transition-transform inline-block', droppedOpen && 'rotate-90')}>▶</span>
        Tried then dropped ({dropped.length})
      </div>
      {droppedOpen && <SpriteRow ids={dropped} />}
    </div>
  );
}

function SessionDiffBody({ s, added, removed, rec }: {
  s: { ts: number; ids: number[]; country?: string; events?: string[] };
  added: number[];
  removed: number[];
  rec: ClientRecord;
}) {
  const summary = (
    <span className="text-xs text-muted-foreground">
      {new Date(s.ts).toLocaleDateString()}{s.country ? ` · ${flag(s.country)} ${s.country}` : ''} · {s.ids.length} total
      {added.length > 0 && <span className="text-green-600"> · +{added.length}</span>}
      {removed.length > 0 && <span className="text-destructive"> · −{removed.length}</span>}
    </span>
  );

  // Onboarding/funnel events the user saw during THIS session.
  const events = s.events ?? [];
  const eventsRow =
    events.length > 0 ? (
      <div className="flex flex-wrap items-center gap-1 mt-1">
        <span className="text-[0.65rem] text-muted-foreground mr-0.5">Saw:</span>
        {events.map((e) => (
          <span
            key={e}
            className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap"
          >
            {EVENT_LABEL[e] ?? e}
          </span>
        ))}
      </div>
    ) : null;

  if (added.length === 0 && removed.length === 0) {
    return (
      <div className="mt-1">
        {summary}
        {eventsRow}
        {events.length === 0 && (
          <div className="text-[0.65rem] text-muted-foreground mt-0.5">no changes</div>
        )}
      </div>
    );
  }

  // Build reverse map: pokemonId → sectionId from the user's ACTUAL placement.
  // latestSections (current) overrides everSections (historical).
  const secOf = new Map<number, string>();
  if (rec.everSections) {
    for (const g of BUILD_GROUPS) {
      if (g.id === 'other') continue;
      for (const id of rec.everSections[g.id] ?? []) {
        if (!secOf.has(id)) secOf.set(id, g.id);
      }
    }
    for (const id of rec.everSections['other'] ?? []) {
      if (!secOf.has(id)) secOf.set(id, 'other');
    }
  }
  if (rec.latestSections) {
    for (const [sid, ids] of Object.entries(rec.latestSections)) {
      for (const id of ids) secOf.set(id, sid);
    }
  }

  // Fall back to flat display for legacy records without section data
  if (secOf.size === 0) {
    return (
      <div className="mt-1">
        {summary}
        {eventsRow}
        {added.length > 0 && (
          <div className="flex flex-wrap items-center gap-0.5 mt-0.5">
            <span className="text-[0.65rem] text-green-600 mr-0.5">+{added.length}</span>
            <SpriteRow ids={added} />
          </div>
        )}
        {removed.length > 0 && (
          <div className="flex flex-wrap items-center gap-0.5 mt-0.5 opacity-60">
            <span className="text-[0.65rem] text-destructive mr-0.5">−{removed.length}</span>
            <SpriteRow ids={removed} />
          </div>
        )}
      </div>
    );
  }

  const addsBySec = new Map<string, number[]>();
  const remsBySec = new Map<string, number[]>();
  for (const id of added) {
    const sec = secOf.get(id) ?? 'other';
    (addsBySec.get(sec) ?? (addsBySec.set(sec, []), addsBySec.get(sec)!)).push(id);
  }
  for (const id of removed) {
    const sec = secOf.get(id) ?? 'other';
    (remsBySec.get(sec) ?? (remsBySec.set(sec, []), remsBySec.get(sec)!)).push(id);
  }

  const affected = BUILD_GROUPS
    .filter((g) => addsBySec.has(g.id) || remsBySec.has(g.id))
    .map((g) => ({ id: g.id, name: g.name, color: g.color, added: addsBySec.get(g.id) ?? [], removed: remsBySec.get(g.id) ?? [] }));

  return (
    <div className="mt-1">
      {summary}
      {eventsRow}
      <div className="flex flex-col gap-1.5 mt-1">
        {affected.map((sec) => (
          <div key={sec.id}>
            <div className="text-[0.65rem] flex items-center gap-1 mb-0.5">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: sec.color }} />
              <span>{sec.name}</span>
            </div>
            {sec.added.length > 0 && sec.removed.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[0.65rem] text-green-600 block mb-0.5">+{sec.added.length}</span>
                  <SpriteRow ids={sec.added} />
                </div>
                <div className="opacity-60">
                  <span className="text-[0.65rem] text-destructive block mb-0.5">−{sec.removed.length}</span>
                  <SpriteRow ids={sec.removed} />
                </div>
              </div>
            ) : sec.added.length > 0 ? (
              <div>
                <span className="text-[0.65rem] text-green-600 block mb-0.5">+{sec.added.length}</span>
                <SpriteRow ids={sec.added} />
              </div>
            ) : (
              <div className="opacity-60">
                <span className="text-[0.65rem] text-destructive block mb-0.5">−{sec.removed.length}</span>
                <SpriteRow ids={sec.removed} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Session diffs with a switchable session selector. Shows one session's
 *  adds/removes at a time; defaults to the most recent session. */
function SessionDiffs({ rec, stickyTop }: { rec: ClientRecord; stickyTop?: number }) {
  const log = rec.sessionLog;
  const [activeIdx, setActiveIdx] = useState(() => Math.max(0, (log?.length ?? 1) - 1));

  // Render for 1+ sessions: multi-session shows visit-to-visit diffs; a single
  // session still surfaces that session's onboarding events. Only skip when a
  // lone session has neither a build nor any events to show.
  if (!log || log.length === 0) return null;
  if (log.length === 1 && (log[0].events?.length ?? 0) === 0) return null;

  const idx = Math.min(activeIdx, log.length - 1);
  const s = log[idx];
  const prev = idx > 0 ? new Set(log[idx - 1].ids) : new Set<number>();
  const added = idx === 0 ? s.ids : s.ids.filter((id) => !prev.has(id));
  const removed = idx === 0 ? [] : log[idx - 1].ids.filter((id) => !new Set(s.ids).has(id));

  return (
    <div>
      <div
        className={cn(STICKY_LABEL_CLASS, 'flex items-center gap-1 flex-wrap')}
        style={stickyLabelStyle(stickyTop)}
      >
        <span className="mr-0.5">Sessions</span>
        {log.map((entry, i) => {
          const dur = rec.sessionMs?.[i];
          const f = entry.country ? flag(entry.country) : '';
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                'px-1.5 py-0.5 rounded text-xs cursor-pointer transition-colors',
                idx === i ? 'bg-muted font-medium text-foreground' : 'hover:bg-muted/50',
              )}
            >
              {f ? `${f} ` : ''}S{i + 1}{dur ? ` · ${fmtDuration(dur)}` : ''}
            </button>
          );
        })}
      </div>
      <SessionDiffBody s={s} added={added} removed={removed} rec={rec} />
    </div>
  );
}


/** Minute-level view of a single local hour: each user active in that hour,
 *  with their exact local time and country. Computed from the loaded records. */
function HourDetail({
  hour,
  dow,
  records,
  loadedAll,
  onClose,
}: {
  hour: number;
  dow?: number;
  records: ClientRecord[];
  loadedAll: boolean;
  onClose: () => void;
}) {
  // hour === -1 → all hours of a day; dow === -1 → all days at an hour.
  const anyHour = hour < 0;
  const anyDay = dow === undefined || dow < 0;
  const inHour = records.filter((r) => {
    const slot = localSlotOf(r);
    if (slot === null) return false;
    return (anyHour || slot.hour === hour) && (anyDay || slot.dow === dow);
  });
  // Sub-bucket by minute within the hour (0–59) using the user's own clock.
  const minuteOf = (r: ClientRecord): number | null => {
    if (!r.tz) return null;
    try {
      const m = new Intl.DateTimeFormat('en-US', { timeZone: r.tz, minute: 'numeric' }).format(r.lastTs);
      const n = parseInt(m, 10);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  };
  const slotOf = (r: ClientRecord) => localSlotOf(r);
  const sorted = inHour
    .map((r) => ({ r, slot: slotOf(r), min: minuteOf(r) }))
    // Order by hour then minute (so an all-day view reads chronologically).
    .sort((a, b) => (a.slot?.hour ?? 0) - (b.slot?.hour ?? 0) || (a.min ?? 0) - (b.min ?? 0));

  const dayPart = anyDay ? 'All days' : DOW_FULL[dow!];
  const hourPart = anyHour ? 'all hours' : hour12(hour);
  return (
    <Modal title={`${dayPart} · ${hourPart} (users' local time)`} onClose={onClose}>
      {!loadedAll && (
        <p className="text-xs text-muted-foreground mb-2">
          Based on the {records.length} loaded users — “Load more” for the full set.
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No loaded users in this slot.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {sorted.map(({ r, slot, min }) => {
            const local = localTime(r.lastTs, r.tz);
            return (
              <div key={r.cid} className="flex items-center gap-3 text-xs border-b py-1">
                <span className="w-20 shrink-0 tabular-nums font-medium">
                  {slot ? hour12(slot.hour, min ?? 0) : '—'}
                </span>
                <span className="w-16 shrink-0">
                  {r.country ? `${flag(r.country)} ${r.country}` : '—'}
                </span>
                <span className="text-muted-foreground truncate">{local ?? r.lastAt}</span>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ---------- main ----------

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
  const [slotDetail, setSlotDetail] = useState<{ dow: number; hour: number } | null>(null);
  const [expandedCid, setExpandedCid] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageHeaderRef = useRef<HTMLElement>(null);
  const [pageHeaderH, setPageHeaderH] = useState(0);

  useLayoutEffect(() => {
    if (pageHeaderRef.current) setPageHeaderH(pageHeaderRef.current.offsetHeight);
  });

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

  const { offPickRows, offPickBySection } = useMemo(() => {
    const bySec = data?.picksBySectionAll;
    if (!bySec) return { offPickRows: [] as [string, number][], offPickBySection: {} as Record<string, [string, number][]> };
    const perSection: Record<string, [string, number][]> = {};
    const totals: Record<string, number> = {};
    for (const [sid, entries] of Object.entries(bySec)) {
      const off = entries.filter(([id]) => isOffSection(Number(id), sid));
      if (off.length > 0) perSection[sid] = off;
      for (const [id, n] of off) totals[id] = (totals[id] ?? 0) + n;
    }
    const rows: [string, number][] = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return { offPickRows: rows, offPickBySection: perSection };
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

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header ref={pageHeaderRef} className="border-b bg-card sticky top-0 z-[100]">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-lg font-bold whitespace-nowrap">
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

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Above the dashboard: it is the only thing here that someone else
            wrote, and the only thing that goes stale if it is not read. */}
        {token && <FeedbackCard token={token} />}

        {data && (
          <>
            <Card title="Overview (since June 15)">
              <div className="flex flex-wrap gap-2">
                <Stat value={data.funnel.users} label="Users" />
                <Stat value={data.funnel.completed} label="Completed (151)" />
                <Stat value={data.funnel.exported} label="Exported" />
                <Stat value={data.retention.returning} label="Returning" />
                <Stat value={data.retention.activeLast7} label="Active 7d" />
              </div>
            </Card>

            {data.activity && data.activity.length > 0 && (
              <Card title="Active users (daily + rolling 7-day)">
                <ActivityChart series={data.activity} />
              </Card>
            )}

            {data.funnelEvents && Object.keys(data.funnelEvents).length > 0 && (
              <Card title="Engagement funnel (distinct browsers)">
                <FunnelChart events={data.funnelEvents} />
              </Card>
            )}

            {data.cohort && data.cohort.length > 0 && (
              <Card title="Before / after by signup date (pre-post)">
                <PrePostCohort cohort={data.cohort} launchTs={data.onboardingLaunchTs} />
              </Card>
            )}

            {data.exportSettings && data.exportSettings.tracked > 0 && (
              <Card title={`Export settings (${data.exportSettings.tracked} export${data.exportSettings.tracked === 1 ? '' : 's'} tracked)`}>
                {(() => {
                  const es = data.exportSettings!;
                  const pct = (n: number) => `${Math.round((n / es.tracked) * 100)}%`;
                  const sortRows = Object.entries(es.sorts).sort((a, b) => b[1] - a[1]);
                  return (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Stat value={`${es.outlines} (${pct(es.outlines)})`} label="With outlines" />
                        <Stat value={`${es.groupSpecial} (${pct(es.groupSpecial)})`} label="Specials grouped" />
                        <Stat value={`${es.showStats ?? 0} (${pct(es.showStats ?? 0)})`} label="With stats" />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Sort order used</div>
                        <div className="flex flex-wrap gap-2">
                          {sortRows.map(([sort, n]) => (
                            <span key={sort} className="text-xs rounded bg-muted px-2 py-1">
                              {SORT_LABELS[sort] ?? sort} · {n} ({pct(n)})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BasisDropoffCard
                title="Session drop-off (when users churn by time)"
                curves={data.timeCurves}
                tabs={[
                  { key: 'longest', label: 'Longest', note: "Each user's longest session" },
                  { key: 'first', label: 'First', note: "Each user's first session" },
                  { key: 'all', label: 'All', note: 'Every session pooled' },
                ]}
                fallback={{ survival: data.timeSurvival, stats: data.timeStats, n: 0 }}
                fmtX={fmtSecs}
                xLabel="session length"
              />
              <BuildDropoffCard data={data} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PopularPanel
                title="Most-picked (final dex, all users)"
                rows={data.popularFinal}
                bySection={data.popularBySection}
                minCount={data.popularMin}
              />
              <PopularPanel
                title="Most tried then dropped"
                rows={data.mostDropped}
                bySection={data.droppedBySection}
                minCount={data.droppedMin}
              />
            </div>

            {offPickRows.length > 0 && (
              <PopularPanel
                title="Most off-section picks"
                rows={offPickRows}
                bySection={offPickBySection}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title="By region">
                {Object.keys(data.countries).length ? (
                  (() => {
                    const groups = regionGroups(data.countries);
                    const total = groups.reduce((sum, g) => sum + g.count, 0);
                    return (
                      <>
                        <ShareBar rows={groups} total={total} />
                        <GroupedBars groups={groups} />
                        <p className="text-[0.6rem] text-muted-foreground mt-1">
                          Tap a region for its countries.
                        </p>
                      </>
                    );
                  })()
                ) : (
                  <p className="text-xs text-muted-foreground">No data yet.</p>
                )}
              </Card>
              <Card title="By language">
                <LanguageBars languages={data.languages ?? {}} />
              </Card>
              <Card title="By device">
                <Bars rows={tallyRows(data.devices)} />
              </Card>
              <Card title="By OS">
                <Bars rows={tallyRows(data.os)} />
              </Card>
            </div>

            <Card title="When users build (local day × hour) — click a cell for detail">
              <Heatmap matrix={data.heatmap} onCell={(dow, hour) => setSlotDetail({ dow, hour })} />
            </Card>

            <span className="text-sm font-medium">Users ({data.totalUsers})</span>

            {data.records.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">No users yet.</p>
            )}
            <div className="flex flex-col -mt-4">
              {data.records.map((rec, i) => (
                <UserCard
                  key={rec.cid}
                  rec={rec}
                  onDelete={deleteUser}
                  expanded={expandedCid === rec.cid}
                  onToggle={() => setExpandedCid((prev) => (prev === rec.cid ? null : rec.cid))}
                  zIndex={data.records.length - i}
                  stickyOffset={pageHeaderH}
                />
              ))}
            </div>
            {data.records.length < data.totalUsers && (
              <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : `Load more (${data.records.length} / ${data.totalUsers})`}
              </Button>
            )}

            {slotDetail !== null && (
              <HourDetail
                hour={slotDetail.hour}
                dow={slotDetail.dow}
                records={data.records}
                loadedAll={data.records.length >= data.totalUsers}
                onClose={() => setSlotDetail(null)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
