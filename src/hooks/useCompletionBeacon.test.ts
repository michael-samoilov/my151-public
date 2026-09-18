import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPORT_SURVEY_SKIP_EVENT, leagueExportEventBody } from '../../api/_events';
import { installOptOut } from '@/lib/clientId';
import { sendEventBeacon, takePendingEvents } from './useCompletionBeacon';

function storageStub(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
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

describe('sendEventBeacon skip fields', () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'localStorage',
      storageStub({ 'p151-cid': 'cid-export-survey-01' }),
    );
    vi.stubGlobal('sessionStorage', storageStub());
    vi.stubGlobal('window', {
      location: { pathname: '/pokedex-builder', search: '' },
    });
    fetchMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts export_survey_skipped with exportTool and reason', () => {
    sendEventBeacon(EXPORT_SURVEY_SKIP_EVENT, {
      exportTool: 'pokedex',
      reason: 'not_now',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/event');
    expect(JSON.parse(String(init.body))).toMatchObject({
      event: 'export_survey_skipped',
      tool: 'dex',
      page: '/pokedex-builder',
      exportTool: 'pokedex',
      reason: 'not_now',
    });
  });

  it('does not post when the browser opted out with ?notme', () => {
    installOptOut('?notme');
    sendEventBeacon(EXPORT_SURVEY_SKIP_EVENT, {
      exportTool: 'league',
      reason: 'close',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sendEventBeacon league export success', () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'localStorage',
      storageStub({ 'p151-cid': 'cid-league-export-01' }),
    );
    vi.stubGlobal('sessionStorage', storageStub());
    vi.stubGlobal('window', {
      location: { pathname: '/custom-gym-leader', search: '' },
    });
    fetchMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts league-export-league with exportTool league', () => {
    const { event, exportTool } = leagueExportEventBody('league');
    sendEventBeacon(event, { exportTool });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/event');
    expect(JSON.parse(String(init.body))).toMatchObject({
      event: 'league-export-league',
      tool: 'league',
      page: '/custom-gym-leader',
      exportTool: 'league',
    });
    expect(takePendingEvents()).toEqual(['league-export-league']);
  });

  it('posts league-export-card with exportTool card', () => {
    const { event, exportTool } = leagueExportEventBody('card');
    sendEventBeacon(event, { exportTool });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      event: 'league-export-card',
      tool: 'league',
      exportTool: 'card',
    });
  });

  it('does not post when the browser opted out with ?notme', () => {
    installOptOut('?notme');
    const { event, exportTool } = leagueExportEventBody('league');
    sendEventBeacon(event, { exportTool });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(takePendingEvents()).toEqual([]);
  });
});
