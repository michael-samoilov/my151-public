import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPokemonById } from '@/hooks/usePokemonData';
import { cn, displayName } from '@/lib/utils';

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
  maxDepth: number;
  localHour: number;
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  device?: string;
  os?: string;
  browser?: string;
  everIds: number[];
  latestIds: number[];
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
  depthHistogram: { label: string; count: number }[];
  timeHistogram: { label: string; count: number }[];
  countries: Record<string, number>;
  devices: Record<string, number>;
  os: Record<string, number>;
  hours: number[];
  popularFinal: [string, number][];
  mostDropped: [string, number][];
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

/** Vertical column histogram — for dense, ordered distributions (one bar per
 *  value). Scrolls horizontally if there are more bars than fit. Each bar lives
 *  in a fixed-height track so its percentage height actually resolves. Pass
 *  onBar to make bars clickable (e.g. to drill into a bucket). */
const BAR_TRACK_PX = 96;
function Columns({
  rows,
  unit,
  onBar,
}: {
  rows: { label: string; count: number }[];
  unit?: string;
  onBar?: (label: string, index: number) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No data yet.</p>;
  // Thin axis labels when dense so they stay horizontal and never overlap:
  // aim for ~16 labels max, stepping in 1/2/5/10/… so ticks land on round
  // numbers. The last bar (often an overflow like ">3h") is always labeled.
  const target = 16;
  let step = 1;
  if (rows.length > target) {
    const rough = rows.length / target;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  }
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-0.5 min-w-min">
        {rows.map((r, i) => {
          const clickable = !!onBar && r.count > 0;
          const showLabel = i % step === 0 || i === rows.length - 1;
          return (
            <div key={r.label} className="flex flex-col items-center shrink-0" style={{ width: 18 }}>
              <span className="text-[0.6rem] tabular-nums text-muted-foreground leading-none mb-0.5 h-2">
                {showLabel && r.count ? r.count : ''}
              </span>
              {/* Fixed-height track gives the % bar a real reference height. */}
              <div className="flex items-end" style={{ height: BAR_TRACK_PX }}>
                <div
                  className={cn(
                    'w-3 rounded-t bg-primary/70',
                    clickable && 'cursor-pointer hover:bg-primary',
                  )}
                  style={{ height: `${Math.max(r.count > 0 ? 2 : 0, (r.count / max) * 100)}%` }}
                  title={`${r.label}${unit ? ' ' + unit : ''}: ${r.count}`}
                  onClick={clickable ? () => onBar!(r.label, i) : undefined}
                />
              </div>
              <span className="text-[0.55rem] text-muted-foreground leading-none mt-0.5 h-2">
                {showLabel ? r.label : ''}
              </span>
            </div>
          );
        })}
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

/** A preview grid (top N) with a "View all" button that opens the full grid in
 *  a modal. */
function PopularPanel({ title, rows, preview = 30 }: { title: string; rows: [string, number][]; preview?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shadow-elevated rounded-lg p-3 bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{title}</span>
        {rows.length > preview && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            View all ({rows.length})
          </Button>
        )}
      </div>
      <PopularGrid rows={rows.slice(0, preview)} />
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <PopularGrid rows={rows} />
        </Modal>
      )}
    </div>
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
        </div>
      )}
    </section>
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
  // Most meaningful first: what they completed, then exported, then current.
  add('completed', 'Completed dex', rec.completedIds);
  add('exported', 'Exported dex', rec.exportedIds);
  add('final', 'Final / current', rec.latestIds);
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
  records,
  loadedAll,
  onClose,
}: {
  hour: number;
  records: ClientRecord[];
  loadedAll: boolean;
  onClose: () => void;
}) {
  const inHour = records.filter((r) => (r.localHour ?? -1) === hour);
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

  return (
    <Modal title={`Activity at ${hour}:00–${hour}:59 (users' local time)`} onClose={onClose}>
      {!loadedAll && (
        <p className="text-xs text-muted-foreground mb-2">
          Based on the {records.length} loaded users — “Load more” for the full set.
        </p>
      )}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No loaded users built in this hour.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {sorted.map(({ r, min }) => {
            const local = localTime(r.lastTs, r.tz);
            return (
              <div key={r.cid} className="flex items-center gap-3 text-xs border-b py-1">
                <span className="w-14 shrink-0 tabular-nums font-medium">
                  {hour}:{String(min ?? 0).padStart(2, '0')}
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
  const [hourDetail, setHourDetail] = useState<number | null>(null);
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

  const hourRows = (data?.hours ?? []).map((count, h) => ({ label: `${h}:00`, count }));

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

            <Card title="How far users get before churn (max evolution lines)">
              <Columns rows={data.depthHistogram} unit="lines" />
            </Card>

            <Card title="Time on app before churn">
              <Columns rows={data.timeHistogram} />
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PopularPanel title="Most-picked (final dex, all users)" rows={data.popularFinal} />
              <PopularPanel title="Most tried then dropped" rows={data.mostDropped} />
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

            <Card title="When users build (their local hour) — click an hour for detail">
              <Columns rows={hourRows} onBar={(_, h) => setHourDetail(h)} />
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

            {hourDetail !== null && (
              <HourDetail
                hour={hourDetail}
                records={data.records}
                loadedAll={data.records.length >= data.totalUsers}
                onClose={() => setHourDetail(null)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
