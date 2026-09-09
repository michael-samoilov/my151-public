import { describe, expect, it } from 'vitest';
import {
  CARD_COUNT,
  SEAT_MAX,
  LEAGUE_SESSION_GAP_MS,
  mergeLeagueRecord,
  parseSummary,
  type LeagueBeaconInput,
  type LeagueSummary,
} from '../../api/_leagueRecord';
import { SLOT_COUNT } from '../league/model/constants';

const summary = (over: Partial<LeagueSummary> = {}): LeagueSummary => ({
  cards: 1, seats: 1, typed: 1, named: 0, aces: 0, leagueNamed: false, ...over,
});
const beacon = (over: Partial<LeagueBeaconInput> = {}): LeagueBeaconInput => ({
  cid: 'cid-0000-0001',
  kind: 'progress',
  summary: summary(),
  now: 1_000_000,
  geo: { country: 'US', tz: 'America/New_York' },
  ua: { device: 'Mobile', os: 'iOS', browser: 'Safari' },
  page: '/custom-gym-leader',
  ...over,
});

describe('mergeLeagueRecord', () => {
  it('seeds a record from the first beacon', () => {
    const rec = mergeLeagueRecord(null, beacon());
    expect(rec.sessions).toBe(1);
    expect(rec.submits).toBe(1);
    expect(rec.sessionLog).toHaveLength(1);
    expect(rec.sessionLog[0]).toMatchObject({ ts: 1_000_000, country: 'US', dev: 'Mobile · iOS · Safari', page: '/custom-gym-leader' });
    expect(rec.maxCards).toBe(1);
  });

  it('extends the session inside the gap and starts one past it', () => {
    let rec = mergeLeagueRecord(null, beacon());
    rec = mergeLeagueRecord(rec, beacon({ now: 1_000_000 + 60_000, summary: summary({ cards: 3, seats: 5 }) }));
    expect(rec.sessions).toBe(1);
    expect(rec.sessionMs).toEqual([60_000]);
    expect(rec.sessionLog).toHaveLength(1);
    expect(rec.maxCards).toBe(3);
    rec = mergeLeagueRecord(rec, beacon({ now: 1_000_000 + 60_000 + LEAGUE_SESSION_GAP_MS + 1, summary: summary({ cards: 2, seats: 2 }) }));
    expect(rec.sessions).toBe(2);
    expect(rec.sessionMs).toEqual([60_000, 0]);
    expect(rec.sessionLog).toHaveLength(2);
    // Deepest ever, not latest.
    expect(rec.maxCards).toBe(3);
    expect(rec.latest.cards).toBe(2);
  });

  it('counts exports by kind and never un-counts them', () => {
    let rec = mergeLeagueRecord(null, beacon({ kind: 'export', exportKind: 'card' }));
    rec = mergeLeagueRecord(rec, beacon({ kind: 'export', exportKind: 'league', now: 1_000_500 }));
    rec = mergeLeagueRecord(rec, beacon({ now: 1_001_000 }));
    expect(rec.exportsCard).toBe(1);
    expect(rec.exportsLeague).toBe(1);
    expect(rec.exportedCardAt).toBeDefined();
  });

  it('does not mutate the record it was given', () => {
    const first = mergeLeagueRecord(null, beacon());
    const snapshot = JSON.stringify(first);
    mergeLeagueRecord(first, beacon({ now: 1_000_000 + 5_000, summary: summary({ cards: 4 }) }));
    expect(JSON.stringify(first)).toBe(snapshot);
  });
});

describe('parseSummary', () => {
  it('clamps and rejects junk', () => {
    expect(parseSummary({ cards: 99, seats: -3, typed: 2.6, named: 1, aces: 0, leagueNamed: 'yes' }))
      .toEqual({ cards: SLOT_COUNT, seats: 0, typed: 3, named: 1, aces: 0, leagueNamed: false });
    expect(parseSummary({ cards: 'one' })).toBeNull();
    expect(parseSummary(null)).toBeNull();
    expect(parseSummary([])).toBeNull();
  });
});

/**
 * The ceiling the API clamps a summary to must be the number of cards the app
 * actually renders.
 *
 * It was 11 while the app rendered 14, and `clampInt` clamps rather than
 * rejects — so a league with 12, 13 or 14 filled cards was written to Redis as
 * exactly 11, and up to 84 seats as 66. Silent, lossy, and unrecoverable: the
 * true number never reached the server, so no later fix can restore it. These
 * hold the two constants together.
 */
describe('the summary ceiling matches the app', () => {
  it('clamps cards to the number of league slots the app renders', () => {
    expect(CARD_COUNT).toBe(SLOT_COUNT);
  });

  it('clamps seats to six lines per card', () => {
    expect(SEAT_MAX).toBe(6 * SLOT_COUNT);
  });

  it('keeps a full league instead of flattening it to the old ceiling', () => {
    const full = parseSummary({
      cards: SLOT_COUNT,
      seats: 6 * SLOT_COUNT,
      typed: SLOT_COUNT,
      named: SLOT_COUNT,
      aces: SLOT_COUNT,
      leagueNamed: true,
    });
    expect(full).toEqual({
      cards: SLOT_COUNT,
      seats: 6 * SLOT_COUNT,
      typed: SLOT_COUNT,
      named: SLOT_COUNT,
      aces: SLOT_COUNT,
      leagueNamed: true,
    });
  });

  it('still clamps a summary that claims more than the app can hold', () => {
    expect(parseSummary({ cards: 99, seats: 999, typed: 0, named: 0, aces: 0 })).toMatchObject({
      cards: SLOT_COUNT,
      seats: 6 * SLOT_COUNT,
    });
  });
});
