import { getLocale } from '@/i18n';
import { usePokedexStore } from '@/store/usePokedexStore';
import { DEMO_MODE } from '@/lib/demoMode';
import { getClientId, isOptedOut } from '@/lib/clientId';
import { AUTOMATED } from '@/lib/automation';
import { BUILD_TIMESTAMP } from '@/lib/buildVersion';

const HOURLY_CAP_RETRY_SECONDS = 3600;

export interface FeedbackContext {
  route: string;
  locale: string;
  localeAuto: boolean;
  languages: string[];
  version: string;
  viewport: string;
  dpr: number;
  ua: string;
  placed: number;
  favorites?: {
    filled: number; total: number; picksFilled: number; pointersFilled: number;
    selection: { type: string; gen: number | string } | null;
  };
  search: boolean;
  filters: string[];
  demo: boolean;
  exportSurvey?: boolean;
  exportTool?: 'pokedex' | 'league' | 'card';
  message?: { key: string; localeValue: string; sourceValue: string };
  error?: { name: string; message: string; stack?: string; componentStack?: string; where?: string };
}

export type FeedbackToolContext = Pick<FeedbackContext, 'placed' | 'search' | 'filters' | 'favorites'>;

function activeFilters(): string[] {
  const s = usePokedexStore.getState();
  const named: [string, unknown][] = [
    ['type', s.typeFilter],
    ['generation', s.generationFilter],
    ['shape', s.shapeFilter],
    ['color', s.colorFilter],
    ['eggGroup', s.eggGroupFilter],
    ['evoLineSize', s.evoLineSizeFilter],
    ['category', s.activeCategoryFilter],
    ['archetype', s.activeArchetypeFilter],
  ];
  return named
    .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v != null))
    .map(([name]) => name);
}

export function collectFeedbackContext(route: string, toolContext?: FeedbackToolContext): FeedbackContext {
  const store = usePokedexStore.getState();
  const placed = Object.values(store.sections).reduce((n, ids) => n + ids.length, 0);
  return {
    route,
    locale: getLocale(),
    localeAuto: !store.locale,
    languages: [...(navigator.languages ?? [])].slice(0, 5),
    version: BUILD_TIMESTAMP,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    ua: (navigator.userAgent || '').slice(0, 200),
    placed,
    search: Boolean(store.searchQuery),
    filters: activeFilters(),
    demo: DEMO_MODE,
    ...toolContext,
  };
}

export type FeedbackCategory = 'bug' | 'translation' | 'idea' | 'data' | 'other';

interface FeedbackSubmission {
  category: FeedbackCategory;
  message: string;
  context: FeedbackContext;
  website?: string;
  dwellMs: number;
}

export type FeedbackSendResult =
  | { ok: true }
  | { ok: false; reason: 'offline' | 'server' | 'rejected' }
  | { ok: false; reason: 'busy'; retryMinutes: number };

export async function sendFeedback(body: FeedbackSubmission): Promise<FeedbackSendResult> {
  const cid = isOptedOut() ? null : getClientId();
  let res: Response;
  try {
    res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, ...(cid ? { cid } : {}), auto: AUTOMATED || undefined }),
    });
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (res.ok) return { ok: true };
  if (res.status === 429) {
    const seconds = Number(res.headers.get('Retry-After')) || HOURLY_CAP_RETRY_SECONDS;
    return { ok: false, reason: 'busy', retryMinutes: Math.max(1, Math.ceil(seconds / 60)) };
  }
  return { ok: false, reason: res.status >= 500 ? 'server' : 'rejected' };
}

const reportedCrashes = new Set<string>();
const MAX_CRASH_REPORTS = 3;

export function sendCrashReport(route: string, error: NonNullable<FeedbackContext['error']>): void {
  const key = `${route}|${error.name}|${error.message}`;
  if (reportedCrashes.has(key) || reportedCrashes.size >= MAX_CRASH_REPORTS) return;
  reportedCrashes.add(key);
  try {
    const cid = isOptedOut() ? null : getClientId();
    const context: FeedbackContext = {
      ...collectFeedbackContext(route),
      error: {
        name: error.name.slice(0, 80),
        message: error.message.slice(0, 400),
        stack: error.stack?.slice(0, 1500),
        componentStack: error.componentStack?.slice(0, 1000),
        where: error.where,
      },
    };
    void fetch('/api/crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, ...(cid ? { cid } : {}), auto: AUTOMATED || undefined }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    return;
  }
}
