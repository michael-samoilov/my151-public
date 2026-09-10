import { describe, expect, it } from 'vitest';
import {
  CARD_COUNT,
  SEAT_MAX,
  parseCards,
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

  it('stores the league structure per session and carries it within a session', () => {
    const cardsA = parseCards([{ i: 0, l: [{ b: [1, 2] }] }])!;
    let rec = mergeLeagueRecord(null, beacon({ cards: cardsA }));
    expect(rec.sessionLog[0].cards).toEqual(cardsA);
    // A within-session beacon that carries no structure keeps the session's
    // board rather than blanking it (an export beacon can omit structure).
    rec = mergeLeagueRecord(
      rec,
      beacon({ now: 1_000_000 + 60_000, kind: 'export', exportKind: 'league', cards: undefined }),
    );
    expect(rec.sessionLog).toHaveLength(1);
    expect(rec.sessionLog[0].cards).toEqual(cardsA);
    // A new session with a new board logs the new structure separately, and the
    // earlier session keeps its own — this is what lets the scrubber replay.
    const cardsB = parseCards([
      { i: 0, l: [{ b: [1, 2] }] },
      { i: 1, l: [{ b: [4, 5] }] },
    ])!;
    rec = mergeLeagueRecord(
      rec,
      beacon({
        now: 1_000_000 + 60_000 + LEAGUE_SESSION_GAP_MS + 1,
        cards: cardsB,
        summary: summary({ cards: 2, seats: 2 }),
      }),
    );
    expect(rec.sessionLog).toHaveLength(2);
    expect(rec.sessionLog[1].cards).toEqual(cardsB);
    expect(rec.sessionLog[0].cards).toEqual(cardsA);
  });

  it('records the first referrer once and never overwrites it (forward-only)', () => {
    let rec = mergeLeagueRecord(null, beacon({ referrer: 'reddit.com' }));
    expect(rec.firstReferrer).toBe('reddit.com');
    // A later beacon — whose referrer is this origin, or none — must not clobber
    // the acquisition source that first brought the browser here.
    rec = mergeLeagueRecord(rec, beacon({ now: 1_000_500, referrer: 'discord.com' }));
    expect(rec.firstReferrer).toBe('reddit.com');
  });

  it('leaves firstReferrer unset for a direct visit', () => {
    const rec = mergeLeagueRecord(null, beacon());
    expect(rec.firstReferrer).toBeUndefined();
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

/**
 * The card structure the beacon now carries.
 *
 * parseCards is a trust boundary: everything in it came from a browser, so
 * every field is bounded and a malformed part is dropped rather than failing
 * the whole beacon — the counts beside it are still worth recording when one
 * card arrives mangled.
 */
describe('parseCards', () => {
  const card = (over: Record<string, unknown> = {}) => ({ i: 0, l: [{ b: [1, 2, 3] }], ...over });

  it('keeps a well-formed card', () => {
    expect(parseCards([card()])).toEqual([{ i: 0, l: [{ b: [1, 2, 3] }] }]);
  });

  it('keeps boundaries only when they are complete', () => {
    expect(parseCards([card({ l: [{ b: [1, 2], bd: [1, 4] }] })])).toEqual([
      { i: 0, l: [{ b: [1, 2], bd: [1, 4] }] },
    ]);
    // A partial set says a stage moved without saying where to.
    expect(parseCards([card({ l: [{ b: [1, 2, 3], bd: [1, 4] }] })])).toEqual([
      { i: 0, l: [{ b: [1, 2, 3] }] },
    ]);
  });

  it('drops a card whose slot is out of range, and keeps the rest', () => {
    expect(parseCards([card({ i: 99 }), card({ i: 3 })])).toEqual([{ i: 3, l: [{ b: [1, 2, 3] }] }]);
  });

  it('bounds the number of cards and the lines on one', () => {
    const many = Array.from({ length: 40 }, (_, i) => card({ i: i % SLOT_COUNT }));
    expect(parseCards(many)).toHaveLength(SLOT_COUNT);
    const wide = card({ l: Array.from({ length: 20 }, () => ({ b: [1] })) });
    expect(parseCards([wide])![0].l).toHaveLength(6);
  });

  it('rejects ids that are not positive integers', () => {
    expect(parseCards([card({ l: [{ b: [0, -4, 1.5, 'x', 1] }] })])).toEqual([
      { i: 0, l: [{ b: [1] }] },
    ]);
  });

  it('keeps legendaries and powerups as bounded tuples', () => {
    const c = parseCards([card({ lg: [[2, 144]], pw: [[9, 1, 0, 0]] })])![0];
    expect(c.lg).toEqual([[2, 144]]);
    expect(c.pw).toEqual([[9, 1, 0, 0]]);
  });

  it('drops a malformed legendary without losing the card', () => {
    const c = parseCards([card({ lg: [[99, 144], 'nope', [2, 145]] })])![0];
    expect(c.lg).toEqual([[2, 145]]);
    expect(c.l).toHaveLength(1);
  });

  it('shape-checks the card type instead of matching a type list', () => {
    expect(parseCards([card({ t: 'water' })])![0].t).toBe('water');
    expect(parseCards([card({ t: '<script>' })])![0].t).toBeUndefined();
  });

  // The distinction mergeLeagueRecord depends on: no structure at all leaves
  // what is stored alone, while an empty league really is empty.
  it('separates "no structure sent" from "an empty league"', () => {
    expect(parseCards(undefined)).toBeUndefined();
    expect(parseCards('nope')).toBeUndefined();
    expect(parseCards([])).toEqual([]);
  });
});

describe('mergeLeagueRecord and the card structure', () => {
  it('stores the structure a beacon carries', () => {
    const rec = mergeLeagueRecord(null, beacon({ cards: [{ i: 0, l: [{ b: [1] }] }] }));
    expect(rec.latestCards).toEqual([{ i: 0, l: [{ b: [1] }] }]);
  });

  it('replaces the structure with the newest one', () => {
    const first = mergeLeagueRecord(null, beacon({ cards: [{ i: 0, l: [{ b: [1] }] }] }));
    const second = mergeLeagueRecord(first, beacon({ now: 2_000_000, cards: [{ i: 1, l: [{ b: [4] }] }] }));
    expect(second.latestCards).toEqual([{ i: 1, l: [{ b: [4] }] }]);
  });

  // A client that sends no structure must not erase one an earlier beacon
  // stored — that is what an old tab still running the previous bundle does.
  it('leaves a stored structure alone when a beacon omits it', () => {
    const first = mergeLeagueRecord(null, beacon({ cards: [{ i: 0, l: [{ b: [1] }] }] }));
    const second = mergeLeagueRecord(first, beacon({ now: 2_000_000 }));
    expect(second.latestCards).toEqual([{ i: 0, l: [{ b: [1] }] }]);
  });
});
