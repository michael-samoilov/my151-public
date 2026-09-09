import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installOptOut, isOptedOut, resolveCidFrom, setOptOut } from './clientId';

/** Minimal working storage stub. */
function workingStore(seed?: Record<string, string>) {
  const data = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

/** Storage that throws on every access — locked-down private modes. */
const throwingStore = {
  getItem: () => {
    throw new Error('storage disabled');
  },
  setItem: () => {
    throw new Error('storage disabled');
  },
};

/** Storage that accepts writes and silently drops them — the treacherous case. */
const droppingStore = {
  getItem: () => null,
  setItem: () => {},
};

describe('resolveCidFrom', () => {
  it('reuses an id already in the first working storage', () => {
    const r = resolveCidFrom([workingStore({ 'p151-cid': 'existing-id' })], () => 'fresh');
    expect(r).toEqual({ cid: 'existing-id', persisted: true });
  });

  it('mints into the first working storage and reports persisted', () => {
    const store = workingStore();
    const r = resolveCidFrom([store], () => 'minted-id');
    expect(r).toEqual({ cid: 'minted-id', persisted: true });
    expect(store.getItem('p151-cid')).toBe('minted-id');
  });

  it('skips a throwing storage and uses the next one', () => {
    const fallback = workingStore();
    const r = resolveCidFrom([throwingStore, fallback], () => 'minted-id');
    expect(r).toEqual({ cid: 'minted-id', persisted: true });
    expect(fallback.getItem('p151-cid')).toBe('minted-id');
  });

  it('detects a storage that silently drops writes, via read-back', () => {
    const fallback = workingStore();
    const r = resolveCidFrom([droppingStore, fallback], () => 'minted-id');
    expect(r.persisted).toBe(true);
    expect(fallback.getItem('p151-cid')).toBe('minted-id');
  });

  it('still yields an id when every storage is broken — never null', () => {
    const r = resolveCidFrom([throwingStore, droppingStore, null], () => 'memory-id');
    expect(r).toEqual({ cid: 'memory-id', persisted: false });
  });
});

/**
 * The owner opt-out.
 *
 * Worth pinning because the failure is invisible: a broken opt-out looks
 * exactly like a working one until the owner's own sessions show up in the
 * dashboard weeks later.
 */
/**
 * A Map-backed `localStorage` for these tests.
 *
 * The suite runs in the `node` environment, which has no storage at all, and
 * these three functions read the real global rather than an injected store —
 * they are one-liners whose whole job is to touch it.
 */
function installStorageStub(): void {
  const data = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
  vi.stubGlobal('localStorage', stub);
}

describe('opt-out', () => {
  beforeEach(() => installStorageStub());

  it('is off until something sets it', () => {
    expect(isOptedOut()).toBe(false);
  });

  it('is set by ?notme, on any page of the origin', () => {
    installOptOut('?notme');
    expect(isOptedOut()).toBe(true);
  });

  it('ignores a search string without the flag', () => {
    installOptOut('?lang=fr');
    expect(isOptedOut()).toBe(false);
  });

  // Re-visiting a normal page must not clear a flag set earlier: the flag is
  // the whole mechanism, and it has to survive ordinary use of the app.
  it('survives later visits that do not carry the flag', () => {
    installOptOut('?notme');
    installOptOut('');
    installOptOut('?lang=de');
    expect(isOptedOut()).toBe(true);
  });

  it('can be turned back on, so a shared browser is not stuck', () => {
    expect(setOptOut(true)).toBe(true);
    expect(isOptedOut()).toBe(true);
    expect(setOptOut(false)).toBe(true);
    expect(isOptedOut()).toBe(false);
  });

  // A restricted mode can accept setItem and silently drop it. An opt-out that
  // failed quietly is worse than one that says so, because the owner walks
  // away believing they are excluded.
  it('reports a write that did not stick', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    } as unknown as Storage);
    expect(setOptOut(true)).toBe(false);
  });

  it('reports a storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    } as unknown as Storage);
    expect(setOptOut(true)).toBe(false);
    expect(isOptedOut()).toBe(false);
  });
});
