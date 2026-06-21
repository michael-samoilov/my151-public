import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAllPokemon, getPokemonById } from '@/hooks/usePokemonData';
import { BUILD_GROUPS } from '@/data/slot-template';
import { ARCHETYPES } from '@/data/archetypes';
import { getCategoryById } from '@/data/categories';
import { cn, displayName } from '@/lib/utils';

const SECTION_META: Record<string, { name: string; color: string }> = Object.fromEntries(
  BUILD_GROUPS.map((g) => [g.id, { name: g.name, color: g.color }]),
);

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
  sessionLog?: { ts: number; ids: number[] }[];
  maxDepth: number;
  localHour: number;
  localDow?: number;
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  device?: string;
  os?: string;
  browser?: string;
  everIds: number[];
  latestIds: number[];
  latestSections?: Record<string, number[]>;
  completed: boolean;
  completedAt?: string;
  completedIds?: number[];
  exported: boolean;
  exportedAt?: string;
  exportedIds?: number[];
}

interface ApiResponse {
  totalUsers: number;
  offset: number;
  limit: number;
  funnel: { users: number; completed: number; exported: number };
  retention: { returning: number; activeLast7: number; newUsers: number };
  timeSurvival: { t: number; s: number }[];
  timeStats: { p50: number; p75: number; p90: number };
  depthSurvival: { t: number; s: number }[];
  depthStats: { p50: number; p75: number; p90: number };
  countries: Record<string, number>;
  devices: Record<string, number>;
  os: Record<string, number>;
  hours: number[];
  heatmap: number[][];
  popularFinal: [string, number][];
  mostDropped: [string, number][];
  popularBySection: Record<string, [string, number][]>;
  droppedBySection: Record<string, [string, number][]>;
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
 *  Cell opacity scales with count; click a cell to drill into that slot. */
function Heatmap({ matrix, onCell }: { matrix: number[][]; onCell: (dow: number, hour: number) => void }) {
  const max = Math.max(1, ...matrix.flat());
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-xs text-muted-foreground">No data yet.</p>;
  return (
    <div className="w-full">
      <div className="grid gap-px w-full" style={{ gridTemplateColumns: `1.75rem repeat(24, minmax(0, 1fr))` }}>
        {/* Header row: hour labels every 3h */}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-[0.5rem] text-muted-foreground text-center leading-none h-3">
            {h % 3 === 0 ? (h % 12 === 0 ? 12 : h % 12) : ''}
          </div>
        ))}
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
          </Fragment>
        ))}
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
  preview = 30,
}: {
  title: string;
  rows: [string, number][];
  bySection?: Record<string, [string, number][]>;
  preview?: number;
}) {
  const [open, setOpen] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const hasSections = !!bySection && Object.keys(bySection).length > 0;
  return (
    <div className="shadow-elevated rounded-lg p-3 bg-card">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-sm font-medium">{title}</span>
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

function SpriteRow({ ids }: { ids: number[] }) {
  return (
    <div className="flex flex-wrap gap-0.5">
      {ids.map((id, idx) => {
        const p = getPokemonById(id);
        return (
          <div
            key={`${id}-${idx}`}
            title={p ? `#${id} ${displayName(p.name)}` : `#${id}`}
            className="w-8 h-8 shrink-0 flex items-center justify-center"
          >
            {p ? (
              <img
                src={p.sprite}
                alt={p.name}
                width={32}
                height={32}
                loading="lazy"
                decoding="async"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <span className="text-[0.55rem] text-muted-foreground">#{id}</span>
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

function UserCard({ rec, onDelete }: { rec: ClientRecord; onDelete: (rec: ClientRecord) => void }) {
  const [expanded, setExpanded] = useState(false);
  const userLocal = localTime(rec.lastTs, rec.tz);
  const ctx = [
    rec.country && `${flag(rec.country)} ${rec.country}${rec.region ? '/' + rec.region : ''}`,
    [rec.device, rec.os, rec.browser].filter(Boolean).join(' · '),
    rec.lang,
  ].filter(Boolean);
  return (
    <section className="shadow-elevated rounded-lg p-3 bg-card">
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
            {rec.exported && <span>📷 exported </span>}
            {rec.lastTs - rec.firstTs >= 86_400_000 && <span>· returning</span>}
            {userLocal && <> · their {userLocal}</>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide' : 'Builds'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(rec)}
          >
            Delete
          </Button>
        </div>
      </div>
      {ctx.length > 0 && (
        <div className="text-xs text-muted-foreground mb-1 flex flex-wrap gap-x-2">
          {ctx.map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
      )}
      {expanded && (
        <div className="flex flex-col gap-2 mt-2">
          {buildSections(rec).map((b) => (
            <div key={b.key}>
              <div className="text-xs text-muted-foreground mb-0.5">
                {b.label} ({b.ids.length})
              </div>
              <SpriteRow ids={b.ids} />
            </div>
          ))}
          <PlacementBySection rec={rec} />
          <SessionChanges rec={rec} />
        </div>
      )}
    </section>
  );
}

/** The user's ACTUAL placement, grouped by the section they chose. Pokemon
 *  placed in a section they aren't a default option for are highlighted — the
 *  signal of interest. Only for records captured after placement tracking
 *  shipped (legacy records have no latestSections). */
function PlacementBySection({ rec }: { rec: ClientRecord }) {
  const secs = rec.latestSections;
  if (!secs || Object.keys(secs).length === 0) return null;
  // Render in the build page's own order; unknown ids/sections fall to the end.
  const order = BUILD_GROUPS.map((g) => g.id);
  const present = Object.keys(secs).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  const offTotal = present.reduce(
    (sum, sid) => sum + secs[sid].filter((id) => isOffSection(id, sid)).length,
    0,
  );
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">
        Placement by section{' '}
        {offTotal > 0 && <span className="text-amber-600 font-medium">· {offTotal} off-section</span>}
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
                        'w-8 h-8 shrink-0 flex items-center justify-center rounded',
                        off && 'ring-2 ring-amber-500 bg-amber-500/10',
                      )}
                    >
                      {p ? (
                        <img
                          src={p.sprite}
                          alt={p.name}
                          width={32}
                          height={32}
                          loading="lazy"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : (
                        <span className="text-[0.55rem] text-muted-foreground">#{id}</span>
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

/** Per-session change summary: diffs each session's end-state against the
 *  previous one to show what was added/removed visit-to-visit. Only available
 *  for records captured after session logging shipped. */
function SessionChanges({ rec }: { rec: ClientRecord }) {
  const log = rec.sessionLog;
  if (!log || log.length === 0) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">Changes by session</div>
      <div className="flex flex-col gap-1">
        {log.map((s, i) => {
          const prev = i > 0 ? new Set(log[i - 1].ids) : new Set<number>();
          const cur = new Set(s.ids);
          const added = i === 0 ? s.ids : s.ids.filter((id) => !prev.has(id));
          const removed = i === 0 ? [] : log[i - 1].ids.filter((id) => !cur.has(id));
          return (
            <div key={i} className="text-xs border-l-2 border-muted pl-2">
              <span className="text-muted-foreground">
                Session {i + 1} · {new Date(s.ts).toLocaleDateString()} · {s.ids.length} total
              </span>
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
              {added.length === 0 && removed.length === 0 && (
                <div className="text-[0.65rem] text-muted-foreground">no changes</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The distinct builds worth showing for a user, deduped by id-set so we don't
 *  repeat the same list under two labels (e.g. final == completed). */
function buildSections(rec: ClientRecord): { key: string; label: string; ids: number[] }[] {
  const out: { key: string; label: string; ids: number[] }[] = [];
  const seen = new Set<string>();
  const add = (key: string, label: string, ids?: number[]) => {
    if (!ids || ids.length === 0) return;
    const sig = ids.slice().sort((a, b) => a - b).join(',');
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ key, label, ids });
  };
  // Current state first (what they have right now), then milestones.
  add('final', 'Final / current', rec.latestIds);
  add('completed', 'Completed dex', rec.completedIds);
  add('exported', 'Exported dex', rec.exportedIds);
  // Tried then dropped: ever placed but not in the final dex — the adjustment
  // signal (always shown, even if it duplicates nothing above).
  const kept = new Set(rec.latestIds ?? []);
  const dropped = (rec.everIds ?? []).filter((id) => !kept.has(id));
  if (dropped.length) out.push({ key: 'dropped', label: 'Tried then dropped', ids: dropped });
  return out;
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
  const inHour = records.filter((r) => {
    const slot = localSlotOf(r);
    return slot !== null && slot.hour === hour && (dow === undefined || slot.dow === dow);
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
  const sorted = inHour
    .map((r) => ({ r, min: minuteOf(r) }))
    .sort((a, b) => (a.min ?? 0) - (b.min ?? 0));

  const dayLabel = dow === undefined ? '' : `${DOW_FULL[dow]} · `;
  return (
    <Modal title={`${dayLabel}${hour12(hour)} (users' local time)`} onClose={onClose}>
      {!loadedAll && (
        <p className="text-xs text-muted-foreground mb-2">
          Based on the {records.length} loaded users — “Load more” for the full set.
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No loaded users in this slot.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {sorted.map(({ r, min }) => {
            const local = localTime(r.lastTs, r.tz);
            return (
              <div key={r.cid} className="flex items-center gap-3 text-xs border-b py-1">
                <span className="w-16 shrink-0 tabular-nums font-medium">
                  {hour12(hour, min ?? 0)}
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
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (!token) return;
      if (!window.confirm(`Delete this user's record?\n\nRemoves all their data. This cannot be undone.`)) return;
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

  const resetAll = useCallback(async () => {
    if (!token) return;
    if (!window.confirm('Reset ALL analytics?\n\nPermanently deletes every user record and aggregate, starting from 0. This cannot be undone.')) return;
    setError(null);
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Reset failed (${res.status}).`);
      await load(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed.');
    }
  }, [token, load]);

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
      <header className="border-b bg-card sticky top-0 z-10">
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

        {data && (
          <>
            <Card title="Overview (all-time)">
              <div className="flex flex-wrap gap-2">
                <Stat value={data.funnel.users} label="Users" />
                <Stat value={data.funnel.completed} label="Completed (151)" />
                <Stat value={data.funnel.exported} label="Exported" />
                <Stat value={data.retention.returning} label="Returning" />
                <Stat value={data.retention.activeLast7} label="Active 7d" />
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title="Session drop-off (when users churn by time)">
                <Survival points={data.timeSurvival} fmtX={fmtSecs} xLabel="session length" />
                <ChurnReadout stats={data.timeStats} fmt={fmtSecs} />
              </Card>
              <Card title="Build drop-off (how far users get)">
                <Survival points={data.depthSurvival} fmtX={(n) => `${n} lines`} xLabel="evolution lines" />
                <ChurnReadout stats={data.depthStats} fmt={(n) => `${n} lines`} />
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PopularPanel
                title="Most-picked (final dex, all users)"
                rows={data.popularFinal}
                bySection={data.popularBySection}
              />
              <PopularPanel
                title="Most tried then dropped"
                rows={data.mostDropped}
                bySection={data.droppedBySection}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card title="By country">
                {Object.keys(data.countries).length ? (
                  <Bars rows={tallyRows(data.countries, true)} />
                ) : (
                  <p className="text-xs text-muted-foreground">No data yet.</p>
                )}
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

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Users ({data.totalUsers})</span>
              {data.totalUsers > 0 && (
                <Button variant="destructive" size="sm" onClick={() => void resetAll()}>
                  Reset all
                </Button>
              )}
            </div>

            {data.records.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">No users yet.</p>
            )}
            {data.records.map((rec) => (
              <UserCard key={rec.cid} rec={rec} onDelete={deleteUser} />
            ))}
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
