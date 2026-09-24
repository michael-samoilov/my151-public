import { beforeEach, describe, expect, it } from 'vitest';
import { defaultBoundaries, levelBoundaries, makePlacedLine } from '../model/engine';
import { BOSS_ROW, CHAMPION_ROW, ELITE_ROW } from '../model/constants';
import { emptyCard, legendAt, legendsOf, migrateLeagueState, powerupAt, powerupsAt, useLeagueStore } from './useLeagueStore';

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

  it('records the tapped pokemon beside the seat', () => {
    useLeagueStore.getState().setSignatureSeat(0, 1, 74);
    expect(card().signatureSeat).toBe(1);
    expect(card().signatureId).toBe(74);
  });

  it('leaves no pick when a caller names none', () => {
    useLeagueStore.getState().setSignatureSeat(0, 2);
    expect(card().signatureSeat).toBe(2);
    expect(card().signatureId).toBeNull();
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

  it('follows its line across a column drag, on every row', () => {
    useLeagueStore.getState().moveSeat(0, 1, 3);
    for (const row of [CHAMPION, BOSS]) {
      expect(powerupAt(card(), row)).toEqual({ seat: 3, kind: 'mega', index: 0 });
    }
    expect(card().lines[2].branch).toEqual(GEODUDE);
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

  it('powers up a whole team, one seat at a time', () => {
    const kinds = ['mega', 'dynamax'] as const;
    const ids = [6, 131];
    for (let seat = 1; seat <= 2; seat += 1) {
      useLeagueStore.getState().cyclePowerup(0, BOSS_ROW, seat, kinds[seat - 1], ids[seat - 1]);
    }
    expect(powerupsAt(card(), BOSS_ROW)).toHaveLength(2);
    expect(powerupsAt(card(), BOSS_ROW).map((p) => p.seat).sort()).toEqual([1, 2]);
  });

  it('offers the elite four row too', () => {
    useLeagueStore.getState().cyclePowerup(0, ELITE_ROW, 1, 'mega', 6);
    expect(powerupAt(card(), ELITE_ROW, 1)).toEqual({ seat: 1, kind: 'mega', index: 0 });
  });

  /**
   * A second press on the same button carries the rows it filled with it.
   *
   * The first press put Charizard X on the champion and the boss. A person
   * who wanted Charizard Y presses again, and expects both rows to follow:
   * cycling one row alone left the boss on X, which read as the press
   * having changed the wrong thing.
   */
  it('carries the rows it filled through the cycle', () => {
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 1, 'mega', 6); // Charizard X
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 1, 'mega', 6); // Charizard Y
    expect(powerupAt(card(), CHAMPION_ROW)?.index).toBe(1);
    expect(powerupAt(card(), BOSS_ROW)?.index, 'the boss row followed').toBe(1);
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 1, 'mega', 6); // back to base
    expect(powerupAt(card(), CHAMPION_ROW)).toBeNull();
    expect(powerupAt(card(), BOSS_ROW), 'and followed back to base').toBeNull();
  });

  it('leaves a row a person set apart', () => {
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 1, 'mega', 6); // X on both
    useLeagueStore.getState().cyclePowerup(0, BOSS_ROW, 1, 'mega', 6); // the boss alone to Y
    expect(powerupAt(card(), BOSS_ROW)?.index).toBe(1);
    // The champion's next press carries nothing: the boss no longer shows
    // what the champion does.
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 1, 'dynamax', 6);
    expect(powerupAt(card(), CHAMPION_ROW)).toEqual({ seat: 1, kind: 'dynamax', index: 0 });
    expect(powerupAt(card(), BOSS_ROW), 'the boss kept its own').toEqual({ seat: 1, kind: 'mega', index: 1 });
  });

  /**
   * Filling down is the seat's, not the card's. With seat 1 already a Mega,
   * a first press on seat 2 used to set one row, which read as the second
   * powerup working differently from the first.
   */
  it('fills downward for a second seat when the card already holds one', () => {
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 1, 'mega', 6);
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 2, 'dynamax', 131);
    expect(powerupAt(card(), CHAMPION_ROW, 2)).toEqual({ seat: 2, kind: 'dynamax', index: 0 });
    expect(powerupAt(card(), BOSS_ROW, 2), 'the boss row got it too').toEqual({ seat: 2, kind: 'dynamax', index: 0 });
    expect(powerupAt(card(), BOSS_ROW, 1), 'seat 1 is untouched').toEqual({ seat: 1, kind: 'mega', index: 0 });
  });

  it('fills downward again once a seat holds none', () => {
    useLeagueStore.getState().cyclePowerup(0, ELITE_ROW, 1, 'mega', 6);
    // Two more presses walk every row past Charizard's last form and back
    // to base together.
    useLeagueStore.getState().cyclePowerup(0, ELITE_ROW, 1, 'mega', 6);
    useLeagueStore.getState().cyclePowerup(0, ELITE_ROW, 1, 'mega', 6);
    for (const row of [ELITE_ROW, CHAMPION_ROW, BOSS_ROW]) expect(powerupAt(card(), row)).toBeNull();
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 1, 'dynamax', 6);
    expect(powerupAt(card(), BOSS_ROW), 'an empty seat is a first press again').toEqual({
      seat: 1, kind: 'dynamax', index: 0,
    });
  });

  /**
   * The first press fills downward and only downward.
   *
   * The three rows run weakest to strongest, so a Mega named on the champion
   * says nothing about the Elite Four team the player already beat. Filling
   * up put a powerup on a team behind them, which reads as the card editing
   * itself.
   */
  it('fills the rows below the one pressed, and none above it', () => {
    useLeagueStore.getState().cyclePowerup(0, CHAMPION_ROW, 1, 'mega', 6);
    expect(powerupAt(card(), ELITE_ROW, 1), 'the row above is left alone').toBeNull();
    expect(powerupAt(card(), CHAMPION_ROW, 1), 'the pressed row takes it').toEqual({
      seat: 1, kind: 'mega', index: 0,
    });
    expect(powerupAt(card(), BOSS_ROW, 1), 'and so does the row below').toEqual({
      seat: 1, kind: 'mega', index: 0,
    });
  });

  it('fills nothing but itself when the last row is pressed first', () => {
    useLeagueStore.getState().cyclePowerup(0, BOSS_ROW, 1, 'mega', 6);
    expect(powerupAt(card(), ELITE_ROW, 1)).toBeNull();
    expect(powerupAt(card(), CHAMPION_ROW, 1)).toBeNull();
    expect(powerupAt(card(), BOSS_ROW, 1)).toEqual({ seat: 1, kind: 'mega', index: 0 });
  });
});

describe('the league view', () => {
  it('starts on the gym challenge and switches', () => {
    useLeagueStore.setState({ view: 'challenge' });
    expect(useLeagueStore.getState().view).toBe('challenge');
    useLeagueStore.getState().setView('rematch');
    expect(useLeagueStore.getState().view).toBe('rematch');
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

  it('the same species in more than one seat', () => {
    useLeagueStore.getState().placeBranch(0, [GEODUDE]);
    useLeagueStore.getState().placeBranch(0, [GEODUDE]);
    expect(card0().lines).toHaveLength(2);
    expect(card0().lines.every((l) => l.branch[0] === GEODUDE)).toBe(true);
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

describe('export nudge celebration', () => {
  it('records a nudge once', () => {
    useLeagueStore.setState({ celebratedNudges: [] });
    useLeagueStore.getState().markNudgeCelebrated('card');
    expect(useLeagueStore.getState().celebratedNudges).toEqual(['card']);
    useLeagueStore.getState().markNudgeCelebrated('card');
    expect(useLeagueStore.getState().celebratedNudges).toEqual(['card']);
    useLeagueStore.getState().markNudgeCelebrated('league');
    expect(useLeagueStore.getState().celebratedNudges).toEqual(['card', 'league']);
  });
});
