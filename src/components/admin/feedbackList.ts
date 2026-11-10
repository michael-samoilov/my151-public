import { useEffect, useSyncExternalStore } from 'react';

export interface FeedbackItem {
  id: string;
  ts: number;
  category: string;
  message: string;
  cid?: string;
  country?: string;
  context?: Record<string, unknown>;
}

interface FeedbackResponse {
  items: FeedbackItem[];
  total: number;
  last7: Record<string, number>;
  last30: Record<string, number>;
}

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

export function useFeedbackList(token: string | null, want: boolean): FeedbackState {
  const snap = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (token && want) requestFeedbackList(token);
  }, [token, want]);
  return token && loadedToken === token ? snap : { data: null, error: null, loading: false };
}

export type FeedbackTool = 'dex' | 'league' | 'favorites';

export function routeTool(route: unknown): FeedbackTool | null {
  if (route === 'builder' || route === 'view') return 'dex';
  if (route === 'league' || route === 'league-card') return 'league';
  if (typeof route === 'string' && route.startsWith('/favorite-pokemon')) return 'favorites';
  return null;
}

export function openToolFor(route: unknown, has: readonly FeedbackTool[]): FeedbackTool | null {
  const want = routeTool(route);
  if (want && has.includes(want)) return want;
  return has[0] ?? null;
}
