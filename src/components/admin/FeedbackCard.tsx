import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { routeCounts } from '@/lib/feedbackRoutes';

/**
 * The feedback inbox.
 *
 * Its own file rather than another section of AdminPage.tsx, which is already
 * ~1800 lines — and unlike the rest of that page it fetches its own endpoint,
 * so it has no reason to share the dashboard's load cycle.
 *
 * Read/unread lives in this browser's localStorage, not in Redis. There is
 * exactly one admin; a server-side flag would be a second source of truth that
 * can only drift.
 */

const SEEN_KEY = 'p151-feedback-seen';

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  translation: 'Translation',
  idea: 'Idea',
  data: 'Data',
  other: 'Other',
};

interface FeedbackItem {
  id: string;
  ts: number;
  category: string;
  message: string;
  cid?: string;
  ipHash?: string;
  country?: string;
  context?: Record<string, unknown>;
}

interface FeedbackResponse {
  items: FeedbackItem[];
  total: number;
  last7: Record<string, number>;
  last30: Record<string, number>;
}

async function fetchFeedback(token: string): Promise<FeedbackResponse> {
  const res = await fetch('/api/feedback-list?limit=50', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return (await res.json()) as FeedbackResponse;
}

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    // Bounded: the list only needs to cover what the endpoint can still return.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-5000)));
  } catch {
    // storage unavailable — everything just reads as unread
  }
}

/** GitHub-ready markdown for one report, for the "copy as issue" button. */
function asIssue(item: FeedbackItem): string {
  const ctx = item.context ?? {};
  const lines = [
    `**${CATEGORY_LABELS[item.category] ?? item.category}** — ${new Date(item.ts).toISOString()}`,
    '',
    item.message,
    '',
    '<details><summary>Context</summary>',
    '',
    '```',
    ...Object.entries(ctx).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`),
    '```',
    '',
    '</details>',
  ];
  return lines.join('\n');
}

function Row({ item, seen, onToggle }: { item: FeedbackItem; seen: boolean; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const ctx = item.context ?? {};

  return (
    <li className={`border rounded-md p-2 text-xs flex flex-col gap-1 ${seen ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-muted font-medium">
          {CATEGORY_LABELS[item.category] ?? item.category}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {new Date(item.ts).toLocaleString()}
        </span>
        {typeof ctx.locale === 'string' && (
          <span className="text-muted-foreground">{ctx.locale}</span>
        )}
        {typeof ctx.route === 'string' && (
          <span className="text-muted-foreground">/{ctx.route}</span>
        )}
        {item.country && <span className="text-muted-foreground">{item.country}</span>}
        {ctx.demo === true && <span className="text-amber-600">demo</span>}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto text-muted-foreground underline cursor-pointer"
        >
          {seen ? 'mark unread' : 'mark read'}
        </button>
      </div>

      <p className="whitespace-pre-wrap break-words">{item.message}</p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-muted-foreground underline cursor-pointer"
        >
          {expanded ? 'hide context' : 'context'}
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(asIssue(item)).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="text-muted-foreground underline cursor-pointer"
        >
          {copied ? 'copied' : 'copy as issue'}
        </button>
      </div>

      {expanded && (
        <pre className="bg-muted rounded p-2 overflow-x-auto text-[0.6875rem] whitespace-pre-wrap break-all">
          {Object.entries(ctx)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
            .join('\n')}
        </pre>
      )}
    </li>
  );
}

export function FeedbackCard({ token }: { token: string }) {
  const [data, setData] = useState<FeedbackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('all');
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen());

  // Refresh bumps this rather than calling a loader directly, so every fetch
  // goes through the one effect and every state write lands in a promise
  // callback — an effect that writes state synchronously is a cascading render.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void fetchFeedback(token)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, nonce]);

  const toggle = (id: string) => {
    setSeen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveSeen(next);
      return next;
    });
  };

  const items = useMemo(() => data?.items ?? [], [data]);
  const shown = category === 'all' ? items : items.filter((i) => i.category === category);
  const unread = items.filter((i) => !seen.has(i.id)).length;
  // Which surface reports come from. Folded out of the page already fetched:
  // the endpoint keeps per-day counts by category, not by route.
  const byRoute = useMemo(() => routeCounts(items), [items]);
  const pagePartial = (data?.total ?? 0) > items.length;

  return (
    <div className="shadow-elevated rounded-lg p-3 bg-card">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-sm font-medium">
          Feedback{unread > 0 && <span className="ml-1 text-primary">· {unread} new</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {data ? `${data.total} total` : ''}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setLoading(true); setNonce((n) => n + 1); }} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive mb-2">{error}</p>}

      {data && (
        <div className="flex gap-1 flex-wrap mb-2">
          {['all', ...Object.keys(CATEGORY_LABELS)].map((id) => {
            const n7 = id === 'all'
              ? Object.values(data.last7).reduce((a, b) => a + b, 0)
              : (data.last7[id] ?? 0);
            const n30 = id === 'all'
              ? Object.values(data.last30).reduce((a, b) => a + b, 0)
              : (data.last30[id] ?? 0);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={`px-2 py-0.5 rounded-full border text-xs cursor-pointer ${
                  category === id ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground'
                }`}
                title={`${n7} in the last 7 days, ${n30} in 30`}
              >
                {id === 'all' ? 'All' : CATEGORY_LABELS[id]}{' '}
                <span className="tabular-nums opacity-70">{n7}/{n30}</span>
              </button>
            );
          })}
        </div>
      )}

      {byRoute.length > 0 && (
        <div className="mb-2">
          <div className="text-xs text-muted-foreground mb-1">
            By surface, 7 / 30 days
            {pagePartial && <> · of the {items.length} reports loaded, not all {data?.total}</>}
          </div>
          <div className="flex gap-1 flex-wrap">
            {byRoute.map((r) => (
              <span key={r.route} className="text-xs rounded bg-muted px-2 py-0.5">
                {r.label} <span className="tabular-nums opacity-70">{r.last7}/{r.last30}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-xs text-muted-foreground">{loading ? 'Loading…' : 'Nothing yet.'}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-[28rem] overflow-y-auto">
          {shown.map((item) => (
            <Row key={item.id} item={item} seen={seen.has(item.id)} onToggle={() => toggle(item.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
