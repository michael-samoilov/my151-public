import { getLocale } from '@/i18n';
import { usePokedexStore } from '@/store/usePokedexStore';
import { DEMO_MODE } from '@/lib/demoMode';
import { getClientId, isOptedOut } from '@/lib/clientId';
import { BUILD_TIMESTAMP } from '@/lib/buildVersion';

/**
 * What a report carries besides the words the person typed.
 *
 * The whole value of a feedback channel is that you can act on what arrives,
 * and "the type filter looks wrong" is unactionable without knowing the locale,
 * the page and the viewport. So those are attached automatically and shown to
 * the user before they send — the sheet has a "what gets sent" disclosure
 * listing exactly this, because there is no privacy-policy surface for it to
 * live on instead.
 *
 * Three things are deliberately NOT collected:
 *
 *   - the dex itself. It is the user's, and a bug report is not consent to
 *     copy it.
 *   - the search query. A search string can be identifying or embarrassing;
 *     whether the person had *a* search active is the part that matters for
 *     reproducing a bug, so only that boolean is sent.
 *   - anything locating the person. The country the edge already sees is
 *     recorded server-side, and the sheet's disclosure says so — a privacy
 *     note that overclaims is worse than one that admits the boring truth.
 */
export interface FeedbackContext {
  route: string;
  locale: string;
  /** Whether the locale came from the browser rather than an explicit choice. */
  localeAuto: boolean;
  languages: string[];
  version: string;
  viewport: string;
  dpr: number;
  ua: string;
  placed: number;
  /** Valid Picker progress and active coordinates, never Pokémon IDs. */
  favorites?: {
    filled: number; total: number; picksFilled: number; pointersFilled: number;
    selection: { type: string; gen: number | string } | null;
  };
  /** Whether a text search was active, never what it said. */
  search: boolean;
  filters: string[];
  demo: boolean;
  /** True when this report came from the post-export survey. */
  exportSurvey?: boolean;
  /** Which export tool opened the survey. */
  exportTool?: 'pokedex' | 'league' | 'card';
  /** For a translation report: the key and both sides of it. */
  message?: { key: string; localeValue: string; sourceValue: string };
  /** For a crash report. */
  error?: { name: string; message: string; stack?: string; componentStack?: string; where?: string };
}

export type FeedbackToolContext = Pick<FeedbackContext, 'placed' | 'search' | 'filters' | 'favorites'>;

/** Which filter dimensions are engaged — the names only, never the values. */
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
    // Truncated: the full list is long on some devices and the first few are
    // what actually drove detection.
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

export interface FeedbackSubmission {
  category: FeedbackCategory;
  message: string;
  context: FeedbackContext;
  /** Honeypot: a field only an automated form-filler will populate. */
  website?: string;
  /** Milliseconds between the sheet opening and Send. */
  dwellMs: number;
}

/**
 * Post a report. Resolves to `true` when it was accepted.
 *
 * The client id is included so several reports from one person can be
 * recognised as one person — unless this browser opted out, in which case the
 * report still sends, just unattributed. Sending is more important than
 * attributing it.
 */
export async function sendFeedback(body: FeedbackSubmission): Promise<boolean> {
  const cid = isOptedOut() ? null : getClientId();
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cid ? { ...body, cid } : body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Crashes this page load has reported, by route, name and message. */
const reportedCrashes = new Set<string>();
/** A render loop can throw the same error on every frame; three reports say enough. */
const MAX_CRASH_REPORTS = 3;

/**
 * Report a crash an error boundary caught, without asking the person.
 *
 * Sends what the report form used to attach to a crash, and nothing typed: the
 * error, its stacks, and this file's allow-listed page details. Each distinct
 * crash goes once per page load. The stacks are cut to fit the server's
 * 4 KB context cap, which rejects a longer field instead of clipping it.
 * Fire and forget: the crash screen shows the same thing whether or not the
 * report arrives.
 */
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
      body: JSON.stringify(cid ? { context, cid } : { context }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // The page has already crashed; a report that cannot be built is dropped.
  }
}
