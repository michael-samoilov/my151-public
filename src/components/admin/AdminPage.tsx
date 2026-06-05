import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPokemonById } from '@/hooks/usePokemonData';
import { cn, displayName } from '@/lib/utils';

/**
 * Admin-only view of the pokedexes users have assembled. Reached at
 * `my151.app/?admin` (gated in main.tsx). Reads the token-protected
 * /api/submissions endpoint and renders each stored submission — its
 * datetime plus the full sprite list — newest first.
 */

const TOKEN_KEY = 'p151-admin-token';
const PAGE_SIZE = 25;

type Source = 'completion' | 'export' | 'interacted' | 'engaged';
const SOURCES: Source[] = ['completion', 'export', 'interacted', 'engaged'];
const SOURCE_LABEL: Record<Source, string> = {
  completion: 'Completions',
  export: 'Exports',
  interacted: 'Interacted (3+ lines)',
  engaged: 'Engaged (20+ lines)',
};

interface Submission {
  id?: string;
  ids: number[];
  source: Source;
  ts: number;
  at: string;
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  device?: string;
  os?: string;
  browser?: string;
}

interface SourceData {
  /** All-time count (for milestones this exceeds `stored` once past the cap). */
  total: number;
  /** Number of snapshots actually retained (drives "Load more" pagination). */
  stored: number;
  submissions: Submission[];
  /** All-time per-country counts (server-side, covers every submission). */
  countries: Record<string, number>;
}

type MilestoneSource = 'interacted' | 'engaged';

// Every source now comes back with the same shape: an all-time `total` counter
// plus the retained-snapshot `stored` count that drives pagination.
interface SourceResult {
  total: number;
  stored: number;
  offset: number;
  limit: number;
  submissions: Submission[];
  countries?: Record<string, number>;
}

type ApiResponse = Partial<Record<'completion' | 'export', SourceResult>> & {
  milestones?: Partial<Record<MilestoneSource, SourceResult>>;
};

function emptyData(): Record<Source, SourceData> {
  return {
    completion: { total: 0, stored: 0, submissions: [], countries: {} },
    export: { total: 0, stored: 0, submissions: [], countries: {} },
    interacted: { total: 0, stored: 0, submissions: [], countries: {} },
    engaged: { total: 0, stored: 0, submissions: [], countries: {} },
  };
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

/** Convert an ISO country code (e.g. "US") to its flag emoji. */
function flag(country?: string): string {
  if (!country || country.length !== 2) return '';
  const cc = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** The submission's wall-clock time in the submitter's own timezone, e.g.
 *  "May 31, 2026, 11:03 AM". Returns null when no (valid) timezone was
 *  captured, so the caller can fall back to the admin's local time. */
function localTime(when: number, tz?: string): string | null {
  if (!tz) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(when);
  } catch {
    // Invalid/unknown timezone string
    return null;
  }
}

/** Compact, human-readable context line for a submission's metadata. */
function contextParts(sub: Submission): string[] {
  const parts: string[] = [];
  const loc = [sub.country && `${flag(sub.country)} ${sub.country}`, sub.region]
    .filter(Boolean)
    .join(' / ');
  if (loc) parts.push(loc);
  const dev = [sub.device, sub.os, sub.browser].filter(Boolean).join(' · ');
  if (dev) parts.push(dev);
  if (sub.lang) parts.push(sub.lang);
  // Timezone is surfaced separately alongside the user-local time.
  return parts;
}

async function fetchSubmissions(
  token: string,
  params: { source?: Source; limit: number; offset: number },
): Promise<ApiResponse> {
  const qs = new URLSearchParams();
  if (params.source) qs.set('source', params.source);
  qs.set('limit', String(params.limit));
  qs.set('offset', String(params.offset));
  // Token goes in the Authorization header, not the URL, so it never lands in
  // a server/proxy access log.
  const res = await fetch(`/api/submissions?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Invalid admin token.');
  if (res.status === 503) {
    throw new Error('Admin access is not configured on the server (ADMIN_TOKEN is not set).');
  }
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return res.json() as Promise<ApiResponse>;
}

function SubmissionCard({ sub, onDelete }: { sub: Submission; onDelete: (sub: Submission) => void }) {
  const [copied, setCopied] = useState(false);
  const when = sub.ts || Date.parse(sub.at) || Date.now();
  const userLocal = localTime(when, sub.tz);

  const copyIds = useCallback(() => {
    void navigator.clipboard?.writeText(sub.ids.join(',')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [sub.ids]);

  return (
    <section className="border rounded-lg p-3 bg-card">
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <div className="text-sm">
          <span className="font-semibold">{new Date(when).toLocaleString()}</span>
          <span className="text-muted-foreground">
            {' '}· {relativeTime(when)} · {sub.ids.length} Pokémon
          </span>
          {userLocal && (
            <span className="block text-xs text-muted-foreground">
              User local: {userLocal} ({sub.tz})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copyIds}>
            {copied ? 'Copied!' : 'Copy IDs'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(sub)}
          >
            Delete
          </Button>
        </div>
      </div>
      {contextParts(sub).length > 0 && (
        <div className="text-xs text-muted-foreground mb-2 flex flex-wrap gap-x-2 gap-y-0.5">
          {contextParts(sub).map((p, i) => (
            <span key={i}>{p}</span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {sub.ids.map((id, idx) => {
          const p = getPokemonById(id);
          return (
            <div
              key={`${id}-${idx}`}
              title={p ? `#${id} ${displayName(p.name)}` : `#${id}`}
              className="w-11 h-11 shrink-0 flex items-center justify-center"
            >
              {p ? (
                <img
                  src={p.sprite}
                  alt={p.name}
                  width={44}
                  height={44}
                  loading="lazy"
                  decoding="async"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <span className="text-[0.625rem] text-muted-foreground">#{id}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** All-time submissions-by-country, descending. Driven by the server-side
 *  counter, so it covers every submission ever received — not just the
 *  entries currently loaded into the page. */
function CountryTally({ countries }: { countries: Record<string, number> }) {
  const entries = Object.entries(countries).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, n]) => sum + n, 0);
  return (
    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 border rounded-lg p-2 bg-card">
      <span className="font-medium text-foreground">By country (all-time, {total}):</span>
      {sorted.map(([cc, n]) => (
        <span key={cc}>
          {flag(cc)} {cc} {n}
        </span>
      ))}
    </div>
  );
}

/** Top-of-page engagement funnel: how many real humans interacted (3+),
 *  engaged (20+), and completed (151). Bots and link-unfurlers never tap
 *  tiles, so these counts are a trustworthy human floor that the raw
 *  page-view number can't give. */
function EngagementFunnel({ data }: { data: Record<Source, SourceData> }) {
  const steps: { source: Source; label: string }[] = [
    { source: 'interacted', label: 'Interacted (3+ lines)' },
    { source: 'engaged', label: 'Engaged (20+ lines)' },
    { source: 'completion', label: 'Completed (151)' },
  ];
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-sm font-medium mb-2">Human engagement (all-time)</div>
      <div className="flex flex-wrap gap-2">
        {steps.map((s) => (
          <div key={s.source} className="flex flex-col px-3 py-2 rounded-md bg-muted min-w-[7rem]">
            <span className="text-2xl font-bold tabular-nums">{data[s.source].total}</span>
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminPage() {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [tokenInput, setTokenInput] = useState('');
  const [data, setData] = useState<Record<Source, SourceData>>(emptyData);
  const [activeSource, setActiveSource] = useState<Source>('completion');
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInitial = useCallback(async (tok: string) => {
    setLoading(true);
    setError(null);
    try {
      // No source param → every source in one round-trip.
      const resp = await fetchSubmissions(tok, { limit: PAGE_SIZE, offset: 0 });
      const ms = resp.milestones ?? {};
      setData({
        completion: {
          // `total` is the all-time counter; `stored` is the retained-snapshot
          // count that drives pagination (they differ past the 10k cap).
          total: resp.completion?.total ?? 0,
          stored: resp.completion?.stored ?? 0,
          submissions: resp.completion?.submissions ?? [],
          countries: resp.completion?.countries ?? {},
        },
        export: {
          total: resp.export?.total ?? 0,
          stored: resp.export?.stored ?? 0,
          submissions: resp.export?.submissions ?? [],
          countries: resp.export?.countries ?? {},
        },
        interacted: {
          total: ms.interacted?.total ?? 0,
          stored: ms.interacted?.stored ?? 0,
          submissions: ms.interacted?.submissions ?? [],
          countries: ms.interacted?.countries ?? {},
        },
        engaged: {
          total: ms.engaged?.total ?? 0,
          stored: ms.engaged?.stored ?? 0,
          submissions: ms.engaged?.submissions ?? [],
          countries: ms.engaged?.countries ?? {},
        },
      });
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

  // Auto-load once if a token is already stored from a previous visit.
  useEffect(() => {
    if (token) void loadInitial(token);
    // Run only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (!token) return;
    setLoadingMore(true);
    setError(null);
    try {
      // Re-fetch the whole loaded range from offset 0 (growing the window by
      // one page) rather than paging by current length. Offset-by-length skips
      // an entry whenever a prior delete shrank the local list; re-fetching
      // from the top stays correct across deletes and naturally reconciles.
      const limit = data[activeSource].submissions.length + PAGE_SIZE;
      const resp = await fetchSubmissions(token, { source: activeSource, limit, offset: 0 });
      // Pokedex sources come back at the top level; milestone sources under
      // `milestones`. Read whichever applies for the active tab.
      const block =
        resp[activeSource as 'completion' | 'export'] ?? resp.milestones?.[activeSource as MilestoneSource];
      setData((prev) => ({
        ...prev,
        [activeSource]: {
          ...prev[activeSource],
          total: block?.total ?? prev[activeSource].total,
          stored: block?.stored ?? prev[activeSource].stored,
          submissions: block?.submissions ?? prev[activeSource].submissions,
          countries: block?.countries ?? prev[activeSource].countries,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoadingMore(false);
    }
  }, [token, activeSource, data]);

  const resetSource = useCallback(
    async (src: Source) => {
      if (!token) return;
      const label = SOURCE_LABEL[src];
      if (
        !window.confirm(
          `Reset all "${label}" data?\n\nThis permanently deletes the count, country tally, and every stored snapshot for ${label.toLowerCase()}, starting it back at 0. This cannot be undone.`,
        )
      ) {
        return;
      }
      setError(null);
      try {
        const res = await fetch('/api/reset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ source: src }),
        });
        if (!res.ok) throw new Error(`Reset failed (${res.status}).`);
        // Clear locally, then refresh from the server.
        setData((prev) => ({
          ...prev,
          [src]: { total: 0, stored: 0, submissions: [], countries: {} },
        }));
        await loadInitial(token);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Reset failed.');
      }
    },
    [token, loadInitial],
  );

  const deleteEntry = useCallback(
    async (sub: Submission) => {
      if (!token) return;
      const src = activeSource;
      if (
        !window.confirm(
          `Delete this ${SOURCE_LABEL[src]} entry from ${new Date(
            sub.ts || Date.parse(sub.at),
          ).toLocaleString()}?\n\nThis removes just this one snapshot. It cannot be undone.`,
        )
      ) {
        return;
      }
      setError(null);
      try {
        const res = await fetch('/api/delete-entry', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          // Prefer the unique id; ts is a legacy fallback for older entries.
          // country/ids let the server floor-decrement the matching aggregates.
          body: JSON.stringify({ source: src, id: sub.id, ts: sub.ts, country: sub.country, ids: sub.ids }),
        });
        if (!res.ok) throw new Error(`Delete failed (${res.status}).`);
        // Drop exactly this entry from local state and decrement the counts.
        // Match on the unique id so entries sharing a ts (same millisecond)
        // aren't all removed; fall back to ts only for legacy id-less entries.
        const matches = (s: Submission) => (sub.id ? s.id === sub.id : s.ts === sub.ts);
        setData((prev) => ({
          ...prev,
          [src]: {
            ...prev[src],
            total: Math.max(0, prev[src].total - 1),
            stored: Math.max(0, prev[src].stored - 1),
            submissions: prev[src].submissions.filter((s) => !matches(s)),
          },
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed.');
      }
    },
    [token, activeSource],
  );

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // localStorage may be unavailable
    }
    setToken(null);
    setAuthed(false);
    setData(emptyData());
    setTokenInput('');
  }, []);

  if (!authed) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 bg-background">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = tokenInput.trim();
            if (t) void loadInitial(t);
          }}
          className="w-full max-w-sm flex flex-col gap-3"
        >
          <h1 className="text-xl font-bold">
            <span className="text-primary">my151</span> · Submissions admin
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your admin token to view the pokédexes users have assembled.
          </p>
          <Input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Admin token"
            autoFocus
          />
          <Button type="submit" disabled={loading || !tokenInput.trim()}>
            {loading ? 'Checking…' : 'View submissions'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </div>
    );
  }

  const active = data[activeSource];

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-lg font-bold whitespace-nowrap">
            <span className="text-primary">my151</span> · Submissions
          </h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => token && void loadInitial(token)} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto w-full flex flex-wrap gap-1 px-4 pb-2">
          {SOURCES.map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setActiveSource(src)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium',
                activeSource === src ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {SOURCE_LABEL[src]} <span className="opacity-70">({data[src].total})</span>
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <EngagementFunnel data={data} />
        {active.submissions.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">No {SOURCE_LABEL[activeSource]} submissions yet.</p>
        )}
        <CountryTally countries={active.countries} />
        {active.total > 0 && (
          <div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void resetSource(activeSource)}
            >
              Reset {SOURCE_LABEL[activeSource]}
            </Button>
          </div>
        )}
        {/* For milestones, total (all-time) can exceed stored (capped snapshots). */}
        {active.total > active.stored && (
          <p className="text-xs text-muted-foreground">
            Showing {active.stored} most-recent snapshots of {active.total} all-time.
          </p>
        )}
        {active.submissions.map((sub, i) => (
          <SubmissionCard key={sub.id ?? `${sub.ts}-${i}`} sub={sub} onDelete={deleteEntry} />
        ))}
        {active.submissions.length < active.stored && (
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : `Load more (${active.submissions.length} / ${active.stored})`}
          </Button>
        )}
      </main>
    </div>
  );
}
