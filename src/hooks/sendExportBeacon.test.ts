import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

function installStorageStub(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe('sendExportBeacon', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    const storage = installStorageStub();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', installStorageStub());
    vi.stubGlobal('window', {
      location: { pathname: '/pokedex-builder', search: '', hostname: 'localhost', origin: 'http://localhost' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the API highlight instead of firing and forgetting', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        highlight: { ordinal: 151, tool: 'pokedex', firstPokemonId: 25 },
      }),
    });
    const { sendExportBeacon } = await import('./useCompletionBeacon');
    const highlight = await sendExportBeacon(
      [25, 1],
      { sort: 'national', outlines: false, groupSpecial: false, showStats: false },
      { other: [25, 1] },
    );
    expect(highlight).toEqual({ ordinal: 151, tool: 'pokedex', firstPokemonId: 25 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.kind).toBe('export');
    expect(body.ids).toEqual([25, 1]);
    expect(body.exportSettings.sort).toBe('national');
  });
});
