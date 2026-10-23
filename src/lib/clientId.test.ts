import { describe, expect, it, vi } from 'vitest';
import { installOptOut, isOptedOut, resolveCidFrom } from './clientId';

function workingStore(seed?: Record<string, string>) {
  const data = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const throwingStore = {
  getItem: () => {
    throw new Error('storage disabled');
  },
  setItem: () => {
    throw new Error('storage disabled');
  },
};

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

describe('opt-out', () => {
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
