import { getLocale } from '@/i18n';
import { usePokedexStore } from '@/store/usePokedexStore';
import { DEMO_MODE } from '@/lib/demoMode';
import { getClientId, isOptedOut } from '@/lib/clientId';

declare const __BUILD_TIMESTAMP__: string;

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
  error?: { name: string; message: string; stack?: string; componentStack?: string };
}

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

export function collectFeedbackContext(route: string): FeedbackContext {
  const store = usePokedexStore.getState();
  const placed = Object.values(store.sections).reduce((n, ids) => n + ids.length, 0);
  return {
    route,
    locale: getLocale(),
    localeAuto: !store.locale,
    // Truncated: the full list is long on some devices and the first few are
    // what actually drove detection.
    languages: [...(navigator.languages ?? [])].slice(0, 5),
    version: __BUILD_TIMESTAMP__,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    ua: (navigator.userAgent || '').slice(0, 200),
    placed,
    search: Boolean(store.searchQuery),
    filters: activeFilters(),
    demo: DEMO_MODE,
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
