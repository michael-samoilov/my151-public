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

type Source = 'completion' | 'export';
const SOURCES: Source[] = ['completion', 'export'];

interface Submission {
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
  total: number;
  submissions: Submission[];
  /** All-time per-country counts (server-side, covers every submission). */
  countries: Record<string, number>;
}

type ApiResponse = Partial<
  Record<
    Source,
    {
      total: number;
      offset: number;
      limit: number;
      submissions: Submission[];
      countries?: Record<string, number>;
    }
  >
>;

function emptyData(): Record<Source, SourceData> {
  return {
    completion: { total: 0, submissions: [], countries: {} },
    export: { total: 0, submissions: [], countries: {} },
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

function SubmissionCard({ sub }: { sub: Submission }) {
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
        <Button variant="ghost" size="sm" onClick={copyIds}>
          {copied ? 'Copied!' : 'Copy IDs'}
        </Button>
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
      // No source param → both lists in one round-trip.
      const resp = await fetchSubmissions(tok, { limit: PAGE_SIZE, offset: 0 });
      setData({
        completion: {
          total: resp.completion?.total ?? 0,
          submissions: resp.completion?.submissions ?? [],
          countries: resp.completion?.countries ?? {},
        },
        export: {
          total: resp.export?.total ?? 0,
          submissions: resp.export?.submissions ?? [],
          countries: resp.export?.countries ?? {},
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
      const offset = data[activeSource].submissions.length;
      const resp = await fetchSubmissions(token, { source: activeSource, limit: PAGE_SIZE, offset });
      const more = resp[activeSource]?.submissions ?? [];
      setData((prev) => ({
        ...prev,
        [activeSource]: {
          total: resp[activeSource]?.total ?? prev[activeSource].total,
          submissions: [...prev[activeSource].submissions, ...more],
          countries: resp[activeSource]?.countries ?? prev[activeSource].countries,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoadingMore(false);
    }
  }, [token, activeSource, data]);

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
        <div className="max-w-5xl mx-auto w-full flex gap-1 px-4 pb-2">
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
              {src === 'completion' ? 'Completions' : 'Exports'}{' '}
              <span className="opacity-70">({data[src].total})</span>
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {active.submissions.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">No {activeSource} submissions yet.</p>
        )}
        <CountryTally countries={active.countries} />
        {active.submissions.map((sub, i) => (
          <SubmissionCard key={`${sub.ts}-${i}`} sub={sub} />
        ))}
        {active.submissions.length < active.total && (
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : `Load more (${active.submissions.length} / ${active.total})`}
          </Button>
        )}
      </main>
    </div>
  );
}
