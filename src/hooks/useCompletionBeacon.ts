import { useEffect, useRef } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';

const STORAGE_KEY = 'p151-submitted-hash';

/** Engagement milestones — fired once per browser the first time the build
 *  reaches each Pokemon count. They gauge how many real humans interact with
 *  the app (bots/link-unfurlers never tap tiles), which the raw page-view
 *  count can't distinguish. "completion" (151) is the third, separate tier. */
type Milestone = 'interacted' | 'engaged';
const MILESTONES: { source: Milestone; threshold: number }[] = [
  { source: 'interacted', threshold: 3 },
  { source: 'engaged', threshold: 20 },
];
const MILESTONE_KEY = (s: Milestone) => `p151-milestone-${s}`;

type BeaconSource = 'completion' | 'export' | Milestone;

/** Simple hash of a sorted ID array for dedup. */
function hashIds(ids: number[]): string {
  return ids.slice().sort((a, b) => a - b).join(',');
}

function postSubmission(ids: number[], source: BeaconSource) {
  const payload = JSON.stringify({ ids, source });
  // Use fetch+keepalive instead of navigator.sendBeacon: iOS WebKit silently
  // drops sendBeacon in several cases (after the share sheet, and for blobs
  // whose content type isn't CORS-safelisted), so submissions never reached
  // the server. keepalive still lets the request outlive a page transition.
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
 * Watches the Pokedex store. Fires:
 *  - engagement milestone beacons ('interacted' at 3, 'engaged' at 20) the
 *    first time this browser reaches each count, deduped via localStorage;
 *  - a 'completion' beacon when exactly 151 are selected (deduped by set).
 */
export function useCompletionBeacon() {
  const sections = usePokedexStore((s) => s.sections);
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    const allIds = Object.values(sections).flat();

    // Engagement milestones — once per browser, on first reaching each count.
    for (const { source, threshold } of MILESTONES) {
      if (allIds.length < threshold) continue;
      try {
        if (localStorage.getItem(MILESTONE_KEY(source))) continue;
      } catch {
        // localStorage may be unavailable
      }
      postSubmission([], source);
      try {
        localStorage.setItem(MILESTONE_KEY(source), '1');
      } catch {
        // localStorage may be unavailable
      }
    }

    if (allIds.length !== 151) return;

    const hash = hashIds(allIds);

    // Skip if already sent this session or matches localStorage
    if (sentRef.current === hash) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === hash) {
        sentRef.current = hash;
        return;
      }
    } catch {
      // localStorage may be unavailable
    }

    postSubmission(allIds, 'completion');
    sentRef.current = hash;
    try {
      localStorage.setItem(STORAGE_KEY, hash);
    } catch {
      // localStorage may be unavailable
    }
  }, [sections]);
}

/** Fire a one-shot export beacon with the current list. */
export function sendExportBeacon(ids: number[]) {
  if (ids.length === 0) return;
  postSubmission(ids, 'export');
}
