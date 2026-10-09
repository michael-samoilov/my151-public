import { useEffect, useSyncExternalStore } from 'react';

/**
 * The admin feedback list, fetched once per page load and shared by the
 * Feedback tab, the detail header's report chip, and the session chart.
 *
 * One `/api/feedback-list` call costs LRANGE and LLEN, plus 30 daily HGETALLs
 * once the first page no longer reaches back 30 days. The views share one
 * response. Only the Feedback tab's Refresh button fetches again.
 */

export interface FeedbackItem {
  id: string;
  ts: number;
  category: string;
  message: string;
  cid?: string;
  ipHash?: string;
  country?: string;
  context?: Record<string, unknown>;
}

export interface FeedbackResponse {
  items: FeedbackItem[];
  total: number;
  last7: Record<string, number>;
  last30: Record<string, number>;
}

/** The endpoint's page cap. One page holds every report of a hobby site. */
const PAGE = 200;

interface FeedbackState {
  data: FeedbackResponse | null;
  error: string | null;
  loading: boolean;
}

let state: FeedbackState = { data: null, error: null, loading: false };
let loadedToken: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function update(next: Partial<FeedbackState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

async function fetchFeedback(token: string): Promise<FeedbackResponse> {
  const res = await fetch(`/api/feedback-list?limit=${PAGE}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return (await res.json()) as FeedbackResponse;
}

/** Fetches the list unless this token already has it or is fetching it. */
export function requestFeedbackList(token: string, refresh = false): void {
  if (!refresh && loadedToken === token && (inflight || state.data)) return;
  if (loadedToken !== token) state = { data: null, error: null, loading: false };
  loadedToken = token;
  update({ loading: true });
  const p: Promise<void> = fetchFeedback(token).then(
    (data) => {
      if (inflight !== p) return;
      inflight = null;
      update({ data, error: null, loading: false });
    },
    (e: unknown) => {
      if (inflight !== p) return;
      inflight = null;
      update({ error: e instanceof Error ? e.message : 'Request failed.', loading: false });
    },
  );
  inflight = p;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The shared list. `want` starts the one fetch; a view that does not need
 *  the list yet passes false and still reads a list another view loaded. */
export function useFeedbackList(token: string | null, want: boolean): FeedbackState {
  const snap = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (token && want) requestFeedbackList(token);
  }, [token, want]);
  return token && loadedToken === token ? snap : { data: null, error: null, loading: false };
}

export type FeedbackTool = 'dex' | 'league' | 'favorites';

/** The detail tab a report's route belongs to, or null for the hub and other
 *  routes that name no tool. */
export function routeTool(route: unknown): FeedbackTool | null {
  if (route === 'builder' || route === 'view') return 'dex';
  if (route === 'league' || route === 'league-card') return 'league';
  if (typeof route === 'string' && route.startsWith('/favorite-pokemon')) return 'favorites';
  return null;
}

/** The tab to open for a report: its route's tool when the browser has a
 *  record there, else the browser's first tool, else null. */
export function openToolFor(route: unknown, has: readonly FeedbackTool[]): FeedbackTool | null {
  const want = routeTool(route);
  if (want && has.includes(want)) return want;
  return has[0] ?? null;
}
