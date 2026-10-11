/**
 * The anonymous per-browser id, and the owner opt-out that suppresses it.
 *
 * Extracted from `useCompletionBeacon` because feedback reports need the same
 * two things: a `cid` so several reports from one person can be recognised as
 * one person, and the same opt-out so a flagged browser stays unidentified.
 */

const CID_KEY = 'p151-cid';
const OPT_OUT_KEY = 'p151-opt-out';

/**
 * Owner opt-out: visiting once with `?notme` flags this browser. The only
 * owner-exclusion mechanism — re-flag each device (and re-flag incognito,
 * whose storage clears on close).
 *
 * An explicit call from every page entry, not an import-time side effect:
 * the effect only ran on pages that happened to import this module, and the
 * gym leader maker did not, so `?notme` there did nothing.
 *
 * The flag lives in localStorage, which is scoped to the ORIGIN and not to the
 * path — so one `?notme` on any page covers the hub, the dex builder, the
 * gym leader maker and the picker together, for as long as that browser keeps
 * its storage. A preview deployment is a different origin and needs its own.
 *
 * `?countme` removes the flag and nothing else, so the owner can test as a
 * normal visitor without clearing site data, which would delete saved
 * selections. `?notme` wins when a URL has both.
 *
 * Deliberately query-only, with no public page and nothing in the public UI:
 * it is the owner's switch, and a discoverable page would invite anyone to
 * erase themselves from the analytics. The admin dashboard shows the flag and
 * toggles it through `setOptedOut`.
 */
export function installOptOut(search: string = window.location.search): void {
  try {
    const params = new URLSearchParams(search);
    if (params.has('notme')) setOptedOut(true);
    else if (params.has('countme')) setOptedOut(false);
  } catch {
    // URL may be unavailable
  }
}

export function setOptedOut(optedOut: boolean): void {
  try {
    if (optedOut) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // localStorage may be unavailable
  }
  // Clear pending analytics in this tab immediately; storage events reach other tabs.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('p151-opt-out'));
}

export function isOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

type CidStore = Pick<Storage, 'getItem' | 'setItem'>;

function mintCid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Resolve a cid from the first storage that actually works.
 *
 * Each candidate is proven by reading the write back: some restricted modes
 * accept `setItem` and silently drop it, and trusting the write would hand out
 * a fresh cid on every call while claiming it was persisted. A storage that
 * throws is skipped. When none works the id is minted unpersisted, and the
 * caller decides how long to keep it.
 *
 * Pure given its inputs, so the fallback chain is unit-testable with stub
 * storages.
 */
export function resolveCidFrom(
  stores: Array<CidStore | null>,
  mint: () => string = mintCid,
): { cid: string; persisted: boolean } {
  for (const store of stores) {
    if (!store) continue;
    try {
      const existing = store.getItem(CID_KEY);
      if (existing) return { cid: existing, persisted: true };
      const cid = mint();
      store.setItem(CID_KEY, cid);
      if (store.getItem(CID_KEY) === cid) return { cid, persisted: true };
    } catch {
      // storage unavailable — try the next one
    }
  }
  return { cid: mint(), persisted: false };
}

function safeStorage(get: () => Storage): CidStore | null {
  try {
    return get();
  } catch {
    return null;
  }
}

// Resolved once per page load. Also the last-resort id itself: when no storage
// works (locked-down private modes), the visitor keeps one id for this page
// load instead of being invisible. They may reappear as a new user next visit —
// an over-count of users, which is the honest direction; the old behaviour
// (return null, send nothing) silently erased them.
let resolvedCid: string | null = null;

/**
 * Stable anonymous id for this browser. localStorage when it works (stable
 * across visits — the id that enables dedup and retention), else sessionStorage
 * (stable for the tab), else an in-memory id (stable for the page load). Never
 * null: a beacon with a short-lived cid still records the session; no cid at
 * all loses it.
 */
export function getClientId(): string {
  if (resolvedCid) return resolvedCid;
  const { cid } = resolveCidFrom([
    safeStorage(() => localStorage),
    safeStorage(() => sessionStorage),
  ]);
  resolvedCid = cid;
  return cid;
}

/** This browser's stored id, without minting one, so the admin dashboard can
 *  show it next to the opt-out state. */
export function storedClientId(): string | null {
  try {
    return localStorage.getItem(CID_KEY);
  } catch {
    return null;
  }
}
