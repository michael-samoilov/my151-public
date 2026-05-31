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

// Owner opt-out: visiting the site once with `?notme` marks this browser as
// excluded, so none of its beacons are ever sent. Persisted in localStorage so
// it survives reloads (and the URL param doesn't need to stay on). Complements
// the server-side EXCLUDE_IPS check, covering devices on changing IPs (mobile
// cellular) where IP exclusion can't reach. Incognito needs re-flagging since
// its storage is cleared on close.
const OPT_OUT_KEY = 'p151-opt-out';
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

type BeaconSource = 'completion' | 'export' | Milestone;

/** Simple hash of a sorted ID array for dedup. */
function hashIds(ids: number[]): string {
  return ids.slice().sort((a, b) => a - b).join(',');
}

function postSubmission(ids: number[], source: BeaconSource) {
  // Owner-excluded browser — never send.
  if (isOptedOut()) return;
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
  // Count at the previous render. Starts null so the *initial* count — the
  // build hydrated from localStorage — is treated as a baseline, not as a
  // crossing. Without this, loading an already-large saved dex would fire
  // every milestone on mount (it did: existing 151 builds counted as
  // "engaged" the first time the milestone code ran).
  const prevLenRef = useRef<number | null>(null);

  useEffect(() => {
    const allIds = Object.values(sections).flat();
    const curLen = allIds.length;
    const prevLen = prevLenRef.current;
    prevLenRef.current = curLen;

    // Engagement milestones — fire once per browser, and only on a genuine
    // upward crossing of the threshold during this page's lifetime (the user
    // actually added Pokemon to reach it), never for a count already present
    // at load.
    if (prevLen !== null) {
      for (const { source, threshold } of MILESTONES) {
        if (!(prevLen < threshold && curLen >= threshold)) continue;
        try {
          if (localStorage.getItem(MILESTONE_KEY(source))) continue;
        } catch {
          // localStorage may be unavailable
        }
        // Snapshot the build at the moment of crossing.
        postSubmission(allIds, source);
        try {
          localStorage.setItem(MILESTONE_KEY(source), '1');
        } catch {
          // localStorage may be unavailable
        }
      }
    }

    if (curLen !== 151) return;

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
