import { beforeEach, describe, expect, it } from 'vitest';
import { defaultBoundaries, levelBoundaries, makePlacedLine } from '../model/engine';
import { BOSS_ROW, CHAMPION_ROW, SLOT_COUNT } from '../model/constants';
import { emptyCard, legendAt, legendsOf, migrateLeagueState, powerupAt, useLeagueStore } from './useLeagueStore';

/**
 * The signature mark's two halves.
 *
 * The mark names a seat, so a reorder or a removal has to keep it pointing at
 * the same line. It also names the Pokemon the user tapped, because the picker
 * shows one tile per Pokemon and a leader's ace is often not its line's leaf.
 * Deriving the shown member from the boss row alone answered a tap on Geodude
 * with Golem.
 */

const GEODUDE = [74, 75, 76];
const ONIX = [95, 208];
const OMANYTE = [138, 139];
const CHARIZARD = [4, 5, 6];
const LAPRAS = [131];
const RHYHORN = [111, 112, 464];

function cardWith(lines: number[][]) {
  return { ...emptyCard(), lines: lines.map(makePlacedLine) };
}

function card() {
  return useLeagueStore.getState().cards[0];
}

describe('the signature mark', () => {
  beforeEach(() => {
    useLeagueStore.setState({
      cards: [cardWith([GEODUDE, ONIX, OMANYTE]), emptyCard()],
    });
  });

  it('clears both halves when the marked line goes', () => {
    useLeagueStore.getState().setSignatureSeat(0, 1, 74);
    useLeagueStore.getState().removeLineWith(0, 75);
    expect(card().signatureSeat).toBeNull();
    expect(card().signatureId).toBeNull();
  });

  it('keeps the pick when another line goes', () => {
    useLeagueStore.getState().setSignatureSeat(0, 3, 138);
    useLeagueStore.getState().removeLineWith(0, 95);
    expect(card().signatureSeat).toBe(2);
    expect(card().signatureId).toBe(138);
  });

  it('keeps the pick when the column is reordered', () => {
    useLeagueStore.getState().setSignatureSeat(0, 1, 74);
    useLeagueStore.getState().moveSeat(0, 1, 3);
    expect(card().signatureSeat).toBe(3);
    expect(card().signatureId).toBe(74);
    expect(card().lines[2].branch).toEqual(GEODUDE);
  });
});

/**
 * A powerup names a seat, and a seat is a position rather than a line. A
 * column drag used to leave Mega Salamence behind on whatever line landed in
 * seat 3. It also names a row, and the two rows a card can use it on are the
 * same six Pokemon at different strengths.
 */
describe('the powerup', () => {
  const CHAMPION = CHAMPION_ROW;
  const BOSS = BOSS_ROW;

  beforeEach(() => {
    useLeagueStore.setState({
      cards: [
        {
          ...cardWith([GEODUDE, ONIX, OMANYTE]),
          powerups: { [CHAMPION]: [{ seat: 1, kind: 'mega', index: 0 }], [BOSS]: [{ seat: 1, kind: 'mega', index: 0 }] },
        },
        emptyCard(),
      ],
    });
  });

  it('shifts when an earlier line is removed', () => {
    useLeagueStore.setState({
      cards: useLeagueStore.getState().cards.map((c, i) =>
        i === 0
          ? { ...c, powerups: { [CHAMPION]: [{ seat: 3, kind: 'mega', index: 0 }], [BOSS]: [{ seat: 3, kind: 'mega', index: 0 }] } }
          : c,
      ),
    });
    useLeagueStore.getState().removeLineWith(0, 95); // seat 2
    expect(powerupAt(card(), CHAMPION)).toEqual({ seat: 2, kind: 'mega', index: 0 });
    expect(powerupAt(card(), BOSS)).toEqual({ seat: 2, kind: 'mega', index: 0 });
  });

  it('goes when its own line goes', () => {
    useLeagueStore.getState().removeLineWith(0, 75); // seat 1, which holds it
    expect(powerupAt(card(), CHAMPION)).toBeNull();
    expect(powerupAt(card(), BOSS)).toBeNull();
  });

  it('does not transfer to a line that replaces its own', () => {
    useLeagueStore.getState().replaceLine(0, 1, [4, 5, 6]);
    expect(powerupAt(card(), CHAMPION)).toBeNull();
  });

  it('reads a card saved before the rows could differ', () => {
    useLeagueStore.setState({
      cards: [{ ...cardWith([CHARIZARD]), powerups: undefined, powerup: { seat: 1, kind: 'mega', index: 0 } }, emptyCard()],
    });
    // One shared powerup meant both rows, so that is what both rows answer.
    expect(powerupAt(card(), CHAMPION)).toEqual({ seat: 1, kind: 'mega', index: 0 });
    expect(powerupAt(card(), BOSS)).toEqual({ seat: 1, kind: 'mega', index: 0 });
  });
});

describe('pressing a powerup', () => {
  beforeEach(() => {
    useLeagueStore.setState({ cards: [cardWith([CHARIZARD, LAPRAS]), emptyCard()] });
  });

  it('sets the rows below it on the first press', () => {
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 1, 'mega', 6);
    expect(powerupAt(card(), CHAMPION_ROW)).toEqual({ seat: 1, kind: 'mega', index: 0 });
    expect(powerupAt(card(), BOSS_ROW), 'the endgame team gets it too').toEqual({
      seat: 1, kind: 'mega', index: 0,
    });
  });

  it('adds a second seat without touching the first', () => {
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 1, 'mega', 6);
    useLeagueStore.getState().cyclePowerup(0, BOSS_ROW, 2, 'dynamax', 131);
    expect(powerupAt(card(), CHAMPION_ROW, 1), 'the champion keeps its Mega').toEqual({
      seat: 1, kind: 'mega', index: 0,
    });
    expect(powerupAt(card(), CHAMPION_ROW, 2), 'and gains nothing').toBeNull();
    // A second seat *adds*: a team may power up as many of its six as it
    // likes, so pressing on seat 2 does not take seat 1's away.
    expect(powerupAt(card(), BOSS_ROW, 1), 'the boss row keeps seat 1').toEqual({
      seat: 1, kind: 'mega', index: 0,
    });
    expect(powerupAt(card(), BOSS_ROW, 2), 'and seat 2 joins it').toEqual({
      seat: 2, kind: 'dynamax', index: 0,
    });
  });
});

describe('evolution boundary intent', () => {
  beforeEach(() => {
    useLeagueStore.setState({ cards: [cardWith([RHYHORN]), emptyCard()] });
  });

  it('marks a dragged boundary as manual and a reset as automatic', () => {
    expect(card().lines[0].boundaryMode).toBe('auto');
    useLeagueStore.getState().setStageBoundary(0, 1, 1, 6);
    expect(card().lines[0].boundaryMode).toBe('manual');
    useLeagueStore.getState().setLineBoundaries(0, 1, defaultBoundaries(RHYHORN));
    expect(card().lines[0].boundaryMode).toBe('auto');
  });

  it('upgrades old automatic lines without changing old manual progressions', () => {
    const automatic = { branch: RHYHORN, boundaries: levelBoundaries(RHYHORN) };
    const manual = { branch: RHYHORN, boundaries: [1, 5, 9] };
    const migrated = migrateLeagueState({
      cards: [{ ...emptyCard(), lines: [automatic, manual] }],
      celebratedNudges: [],
    }, 2);

    expect(migrated.cards?.[0].lines[0]).toEqual({
      branch: RHYHORN,
      boundaries: defaultBoundaries(RHYHORN),
      boundaryMode: 'auto',
    });
    expect(migrated.cards?.[0].lines[1]).toEqual({
      ...manual,
      boundaryMode: 'manual',
    });
  });
});

/**
 * The v4 step. Before v4 the eight-gym popup said "League ready", the copy
 * the new all-cards popup uses. The ways it can fail a saved league:
 * 1. A full league that saw that popup is shown "League ready" again.
 * 2. A league with only its gyms filled loses the popup it has not yet seen.
 * 3. An older save skips the v3 boundary upgrade on its way to v4.
 * 4. The step drops or rewrites a card.
 */
describe('the v4 roster popup migration', () => {
  const fullLeague = (line: () => object) =>
    Array.from({ length: SLOT_COUNT }, () => ({ ...emptyCard(), lines: [line()] }));

  it('marks a full v3 league that saw the eight-gym popup as having seen League ready', () => {
    const cards = fullLeague(() => makePlacedLine(RHYHORN));
    const migrated = migrateLeagueState({ cards, celebratedNudges: ['league'] }, 3);
    expect(migrated.celebratedNudges).toEqual(['league', 'complete']);
    expect(migrated.cards).toEqual(cards);
  });

  it('leaves a v3 league with only its gyms filled free to see League ready later', () => {
    const cards = Array.from({ length: SLOT_COUNT }, (_, i) =>
      i < 8 ? cardWith([RHYHORN]) : emptyCard());
    const migrated = migrateLeagueState({ cards, celebratedNudges: ['league'] }, 3);
    expect(migrated.celebratedNudges).toEqual(['league']);
    expect(migrated.cards).toEqual(cards);
  });

  it('still upgrades a v2 save to automatic boundaries before the v4 step', () => {
    const cards = fullLeague(() => ({ branch: RHYHORN, boundaries: levelBoundaries(RHYHORN) }));
    const migrated = migrateLeagueState({ cards, celebratedNudges: ['league'] }, 2);
    expect(migrated.cards).toHaveLength(SLOT_COUNT);
    for (const saved of migrated.cards ?? []) {
      expect(saved.lines).toEqual([
        { branch: RHYHORN, boundaries: defaultBoundaries(RHYHORN), boundaryMode: 'auto' },
      ]);
    }
    expect(migrated.celebratedNudges).toEqual(['league', 'complete']);
  });
});

/**
 * Starting one card over. The dex builder's build page has the same control
 * for the whole dex; here the blast radius is one card, so the test that
 * matters most is what it does NOT touch.
 */
describe('clearCard', () => {
  it('empties every field of its own card and no other', () => {
    useLeagueStore.setState({
      cards: [
        {
          ...cardWith([GEODUDE, ONIX]),
          type: 'rock',
          theme: "Brock's unyielding rock",
          signatureSeat: 1,
          signatureId: 74,
          tmMoveId: 157,
          badgeName: 'Boulder',
          legend: { pokemonId: 150, seat: 2 },
          powerup: { seat: 1, kind: 'mega', index: 0 },
        },
        { ...cardWith([OMANYTE]), type: 'water', badgeName: 'Cascade' },
      ],
    });
    useLeagueStore.getState().clearCard(0);

    expect(card()).toEqual(emptyCard());
    const untouched = useLeagueStore.getState().cards[1];
    expect(untouched.type).toBe('water');
    expect(untouched.badgeName).toBe('Cascade');
    expect(untouched.lines).toHaveLength(1);
  });
});

/**
 * Four rules the card used to enforce and no longer does.
 *
 * Each was a restriction the model imposed rather than the game: a gym can
 * field two Geodudes, an endgame team can be all legendaries, a champion can
 * Mega more than one Pokemon, and a legendary belongs to the column a person
 * put it on rather than to the position that column happened to be in.
 */
describe('what a card may now hold', () => {
  const GEODUDE = 74;
  const card0 = () => useLeagueStore.getState().cards[0];

  beforeEach(() => {
    useLeagueStore.setState({ cards: [emptyCard(), emptyCard()] });
  });

  it('a legendary on every seat of the endgame row', () => {
    for (let seat = 1; seat <= 3; seat += 1) {
      useLeagueStore.getState().placeBranch(0, [GEODUDE]);
      useLeagueStore.getState().setLegend(0, { pokemonId: 240 + seat, seat });
    }
    expect(legendsOf(card0())).toHaveLength(3);
    expect(legendsOf(card0()).map((l) => l.seat).sort()).toEqual([1, 2, 3]);
  });

  it('two legendaries trade places rather than one being lost', () => {
    useLeagueStore.getState().placeBranch(0, [GEODUDE]);
    useLeagueStore.getState().placeBranch(0, [GEODUDE]);
    useLeagueStore.getState().setLegend(0, { pokemonId: 243, seat: 1 });
    useLeagueStore.getState().setLegend(0, { pokemonId: 244, seat: 2 });
    useLeagueStore.getState().swapLegends(0, 1, 2);
    expect(legendAt(card0(), 1)?.pokemonId).toBe(244);
    expect(legendAt(card0(), 2)?.pokemonId).toBe(243);
    expect(legendsOf(card0()), 'neither vanished').toHaveLength(2);
  });

  it('a legendary that travels with its column', () => {
    useLeagueStore.getState().placeBranch(0, [GEODUDE]);
    useLeagueStore.getState().placeBranch(0, [131]);
    useLeagueStore.getState().placeBranch(0, [95]);
    // On the column that is about to move.
    useLeagueStore.getState().setLegend(0, { pokemonId: 243, seat: 1 });
    useLeagueStore.getState().moveSeat(0, 1, 3);
    expect(legendAt(card0(), 3)?.pokemonId, 'it went with its column').toBe(243);
    expect(legendAt(card0(), 1), 'and left the seat it was in').toBeNull();
  });
});
