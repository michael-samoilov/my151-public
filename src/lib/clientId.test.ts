import { describe, expect, it, vi } from 'vitest';
import { installOptOut, isOptedOut, resolveCidFrom } from './clientId';

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
  it('mints into the first working storage and reports persisted', () => {
    const store = workingStore();
    const r = resolveCidFrom([store], () => 'minted-id');
    expect(r).toEqual({ cid: 'minted-id', persisted: true });
    expect(store.getItem('p151-cid')).toBe('minted-id');
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
describe('opt-out', () => {
  // A locked-down browser must not take the whole page down with it. There is
  // no page to report the failure to, so both sides just stay quiet.
  it('survives a storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage);
    expect(() => installOptOut('?notme')).not.toThrow();
    expect(isOptedOut()).toBe(false);
  });
});
