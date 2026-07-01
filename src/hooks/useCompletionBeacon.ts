import { useEffect, useRef } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById } from '@/hooks/usePokemonData';
import { DEMO_MODE } from '@/lib/demoMode';

type BeaconKind = 'progress' | 'completion' | 'export';

const CID_KEY = 'p151-cid';
const OPT_OUT_KEY = 'p151-opt-out';
// Don't send a 'progress' beacon for trivial/empty builds — wait until the user
// has actually placed a few Pokemon so bots and idle loads don't create users.
const MIN_PROGRESS_IDS = 1;
// Debounce progress beacons so rapid edits collapse into one write.
const PROGRESS_DEBOUNCE_MS = 4000;

// Owner opt-out: visiting once with `?notme` flags this browser so it never
// sends beacons. The only owner-exclusion mechanism — re-flag each device (and
// re-flag incognito, whose storage clears on close).
if (typeof window !== 'undefined') {
  try {
    if (new URLSearchParams(window.location.search).has('notme')) {
      localStorage.setItem(OPT_OUT_KEY, '1');
    }
  } catch {
    // localStorage / URL may be unavailable
  }
}

function isOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Stable anonymous id for this browser, minted once and reused. Enables
 *  dedup (a person's repeated saves update one record) and retention. */
function getClientId(): string | null {
  try {
    let cid = localStorage.getItem(CID_KEY);
    if (!cid) {
      cid =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(CID_KEY, cid);
    }
    return cid;
  } catch {
    return null; // storage unavailable → can't dedup, so don't send
  }
}

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

function postBeacon(
  ids: number[],
  kind: BeaconKind,
  sections?: Record<string, number[]>,
  exportSettings?: ExportSettings,
) {
  // Demo mode never reports to analytics — keep the sample dex out of admin stats.
  if (DEMO_MODE || isOptedOut() || ids.length === 0) return;
  const cid = getClientId();
  if (!cid) return;
  // `sections` (groupId -> placed ids) captures WHERE the user put each Pokemon
  // on the build page — the real placement, including non-default choices. Only
  // sent for build beacons (progress/completion), not the flat export view.
  // `exportSettings` records the View settings used for an export (sort/outlines).
  const payload = JSON.stringify({ cid, kind, ids, depth: countEvoLines(ids), sections, exportSettings });
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
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Progress is debounced so a flurry of edits collapses into one write.
    if (allIds.length >= MIN_PROGRESS_IDS) {
      if (progressTimer.current) clearTimeout(progressTimer.current);
      const idsSnapshot = allIds;
      const sectionsSnapshot = sections;
      progressTimer.current = setTimeout(() => {
        postBeacon(idsSnapshot, 'progress', sectionsSnapshot);
      }, PROGRESS_DEBOUNCE_MS);
    }

    return () => {
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, [sections]);
}

/** Fire a one-shot export beacon with the current list and the View settings
 *  that produced the exported image. */
export function sendExportBeacon(ids: number[], settings?: ExportSettings) {
  if (ids.length === 0) return;
  postBeacon(ids, 'export', undefined, settings);
}
