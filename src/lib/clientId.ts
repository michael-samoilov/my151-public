const CID_KEY = 'p151-cid';
const OPT_OUT_KEY = 'p151-opt-out';

export function installOptOut(search: string = window.location.search): void {
  try {
    const params = new URLSearchParams(search);
    if (params.has('notme')) setOptedOut(true);
    else if (params.has('countme')) setOptedOut(false);
  } catch {
    return;
  }
}

function setOptedOut(optedOut: boolean): void {
  try {
    if (optedOut) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // localStorage may be unavailable
  }
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
      continue;
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

let resolvedCid: string | null = null;

export function getClientId(): string {
  if (resolvedCid) return resolvedCid;
  const { cid } = resolveCidFrom([
    safeStorage(() => localStorage),
    safeStorage(() => sessionStorage),
  ]);
  resolvedCid = cid;
  return cid;
}

