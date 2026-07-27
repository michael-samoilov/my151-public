/**
 * The anonymous per-browser id, and the owner opt-out that suppresses it.
 *
 * Extracted from `useCompletionBeacon` because feedback reports need the same
 * two things: a `cid` so several reports from one person can be recognised as
 * one person, and the same opt-out so a flagged browser stays unidentified.
 */

const CID_KEY = 'p151-cid';
const OPT_OUT_KEY = 'p151-opt-out';

// Owner opt-out: visiting once with `?notme` flags this browser. The only
// owner-exclusion mechanism — re-flag each device (and re-flag incognito, whose
// storage clears on close).
if (typeof window !== 'undefined') {
  try {
    if (new URLSearchParams(window.location.search).has('notme')) {
      localStorage.setItem(OPT_OUT_KEY, '1');
    }
  } catch {
    // localStorage / URL may be unavailable
  }
}

export function isOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Stable anonymous id for this browser, minted once and reused. Enables dedup
 * (a person's repeated saves update one record) and retention. `null` when
 * storage is unavailable, which for beacons means "don't send" — feedback still
 * sends, just without a cid.
 */
export function getClientId(): string | null {
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
    return null; // storage unavailable → can't dedup
  }
}
