import { useEffect, useRef, useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById } from '@/hooks/usePokemonData';
import { DEMO_MODE } from '@/lib/demoMode';
import { getClientId, isOptedOut } from '@/lib/clientId';
import { getLocale } from '@/i18n/core';
import { currentPage, currentTool } from '@/lib/tool';
import { externalReferrerHost } from '@/lib/referrer';
import {
  createBeaconDebouncer,
  PROGRESS_DEBOUNCE_MS,
  PROGRESS_MAX_WAIT_MS,
  type BeaconDebouncer,
} from '@/lib/beaconScheduler';

type BeaconKind = 'progress' | 'completion' | 'export';

// Don't send a 'progress' beacon for trivial/empty builds — wait until the user
// has actually placed a few Pokemon so bots and idle loads don't create users.
const MIN_PROGRESS_IDS = 1;
// The debounce/max-wait cadence lives in beaconScheduler.ts, exported, so the
// budget test can hold the send rate inside the server's per-client allowance.

/** Distinct evolution lines (chains) represented by a set of ids — a better
 *  measure of building effort than raw count (a 3-stage line is one decision). */
function countEvoLines(ids: number[]): number {
  const chains = new Set<number>();
  for (const id of ids) {
    const p = getPokemonById(id);
    chains.add(p ? p.evolutionChainId : -id);
  }
  return chains.size;
}

/** View settings captured with an export beacon — what the shared image used. */
export interface ExportSettings {
  sort: string;
  outlines: boolean;
  groupSpecial: boolean;
  /** Whether the detailed-stats panel was included in the export. */
  showStats: boolean;
}

// Funnel events seen but not yet attached to a session. We buffer them here and
// flush with the next build beacon (progress/completion), which associates them
// with whatever session is then in progress — so the admin can see WHICH session
// a user saw the intro / hit a milestone in. Events that happen before any
// placement stay buffered until the user places their first Pokemon.
const PENDING_EVENTS_KEY = 'p151-pending-events';
function bufferPendingEvent(event: string) {
  try {
    const cur = JSON.parse(localStorage.getItem(PENDING_EVENTS_KEY) || '[]') as string[];
    if (!cur.includes(event)) {
      cur.push(event);
      localStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(cur.slice(-20)));
    }
  } catch {
    // storage unavailable — event just won't be session-associated
  }
}
function takePendingEvents(): string[] {
  try {
    const cur = JSON.parse(localStorage.getItem(PENDING_EVENTS_KEY) || '[]') as string[];
    if (cur.length) localStorage.removeItem(PENDING_EVENTS_KEY);
    return Array.isArray(cur) ? cur : [];
  } catch {
    return [];
  }
}

function postBeacon(
  ids: number[],
  kind: BeaconKind,
  sections?: Record<string, number[]>,
  exportSettings?: ExportSettings,
) {
  // Demo mode never reports to analytics — keep the sample dex out of admin stats.
  if (DEMO_MODE || isOptedOut() || ids.length === 0) return;
  // Never null: getClientId falls back through sessionStorage to an in-memory
  // id, so restricted-storage browsers still report instead of vanishing.
  const cid = getClientId();
  // Attach any buffered funnel events to this beacon so the server can file them
  // under the current session. Export beacons don't own a session, so leave
  // events buffered for the next progress/completion beacon.
  const events = kind === 'export' ? undefined : takePendingEvents();
  // `sections` (groupId -> placed ids) captures WHERE the user put each Pokemon
  // on the build page — the real placement, including non-default choices. Only
  // sent for build beacons (progress/completion), not the flat export view.
  // `exportSettings` records the View settings used for an export (sort/outlines).
  // The locale the app is actually rendering in — which is not the same as the
  // Accept-Language header the server sees. A `?lang=` or a manual pick in the
  // language picker both outrank the browser preference, and only the client
  // knows the outcome.
  const payload = JSON.stringify({
    cid,
    tool: currentTool(),
    page: currentPage(),
    kind,
    ids,
    depth: countEvoLines(ids),
    sections,
    exportSettings,
    locale: getLocale(),
    events: events && events.length ? events : undefined,
    // External referrer host, if any — the server stores it forward-only, so
    // sending it on every beacon is harmless; '' (direct/internal) is omitted.
    ref: externalReferrerHost() || undefined,
  });
  // fetch+keepalive (not navigator.sendBeacon): iOS WebKit silently drops
  // sendBeacon in several cases (after the share sheet, non-CORS-safelisted
  // blob types); keepalive still lets the request outlive a page transition.
  void fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // best-effort analytics; ignore failures
  });
}

/**
 * Watches the Pokedex store and reports build activity to the analytics backend
 * as one record per anonymous client:
 *  - a debounced 'progress' beacon as the build changes (drives retention,
 *    max-depth/churn, last-active), and
 *  - a 'completion' beacon the moment a full 151 is reached.
 */
export function useCompletionBeacon() {
  const sections = usePokedexStore((s) => s.sections);
  const completedRef = useRef<string | null>(null);
  // The debouncer owns its timer, so a re-render never cancels pending work —
  // the old per-effect setTimeout was cleared by the effect cleanup on every
  // sections change AND on unmount, which silently discarded the last beacon
  // of a session (navigate away, or close within the debounce window).
  // Built once via a lazy initialiser: stable identity for the effects below,
  // with no ref read during render.
  const [debouncer] = useState<BeaconDebouncer>(() =>
    createBeaconDebouncer({
      delayMs: PROGRESS_DEBOUNCE_MS,
      maxWaitMs: PROGRESS_MAX_WAIT_MS,
    }),
  );

  useEffect(() => {
    const allIds = Object.values(sections).flat();

    // Completion fires immediately (and once per distinct 151-set this session).
    if (allIds.length === 151) {
      const key = allIds.slice().sort((a, b) => a - b).join(',');
      if (completedRef.current !== key) {
        completedRef.current = key;
        postBeacon(allIds, 'completion', sections);
      }
    }

    // Progress is debounced so a flurry of edits collapses into one write, with
    // a latency cap: continuous editing (never a quiet gap) still reports at
    // least every PROGRESS_MAX_WAIT_MS instead of starving until the user
    // stops. No cleanup here — pending work survives re-renders by design.
    if (allIds.length >= MIN_PROGRESS_IDS) {
      debouncer.schedule(() => postBeacon(allIds, 'progress', sections));
    }
  }, [sections, debouncer]);

  // Deliver the pending beacon at the moments a page can vanish. On iOS,
  // unload/beforeunload are unreliable or never fire; visibilitychange→hidden
  // plus pagehide is the supported pair, and fetch keepalive (already used by
  // postBeacon) lets the request outlive the page. This is what makes a short
  // mobile session — edit, admire, swipe away — actually reach the server.
  useEffect(() => {
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') debouncer.flush();
    };
    const flush = () => debouncer.flush();
    document.addEventListener('visibilitychange', flushIfHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flushIfHidden);
      window.removeEventListener('pagehide', flush);
      // Unmount delivers pending work rather than discarding it.
      debouncer.flush();
    };
  }, [debouncer]);
}

/** Fire a one-shot export beacon with the current list and the View settings
 *  that produced the exported image. */
export function sendExportBeacon(ids: number[], settings?: ExportSettings) {
  if (ids.length === 0) return;
  postBeacon(ids, 'export', undefined, settings);
}

const EVENT_SENT_PREFIX = 'p151-ev-';

/**
 * Fire a lightweight funnel event (intro shown/cta/dismiss, milestone crossings,
 * view visit) to /api/event. These count top-of-funnel signals that can happen
 * with zero Pokémon placed, so they go to their own aggregate counters rather
 * than the per-user records. `once` de-dupes per browser via localStorage — use
 * it for signals that should count one distinct user (e.g. "saw the intro").
 */
export function sendEventBeacon(event: string, opts?: { once?: boolean }) {
  if (DEMO_MODE || isOptedOut()) return;
  const cid = getClientId();
  if (opts?.once) {
    try {
      const k = EVENT_SENT_PREFIX + event;
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, '1');
    } catch {
      // storage unavailable — fall through and send (may double-count)
    }
  }
  // Buffer for per-session association (flushed with the next build beacon) in
  // addition to the aggregate funnel counter below.
  bufferPendingEvent(event);
  void fetch('/api/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid, event, tool: currentTool(), page: currentPage() }),
    keepalive: true,
  }).catch(() => {
    // best-effort analytics
  });
}
