import { beforeEach, describe, expect, it } from 'vitest';
import { makePlacedLine } from '../model/engine';
import { emptyCard, useLeagueStore } from './useLeagueStore';

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
 * The card's one powerup names a seat, and a seat is a position rather than a
 * line. A column drag used to leave Mega Salamence behind on whatever line
 * landed in seat 3.
 */
describe('the powerup', () => {
  beforeEach(() => {
    useLeagueStore.setState({
      cards: [
        {
          ...cardWith([GEODUDE, ONIX, OMANYTE]),
          powerup: { seat: 1, kind: 'mega', index: 0 },
        },
        emptyCard(),
      ],
    });
  });

  it('follows its line across a column drag', () => {
    useLeagueStore.getState().moveSeat(0, 1, 3);
    expect(card().powerup).toEqual({ seat: 3, kind: 'mega', index: 0 });
    expect(card().lines[2].branch).toEqual(GEODUDE);
  });

  it('shifts when an earlier line is removed', () => {
    useLeagueStore.getState().setSignatureSeat(0, 3, 138);
    useLeagueStore.setState({
      cards: useLeagueStore.getState().cards.map((c, i) =>
        i === 0 ? { ...c, powerup: { seat: 3, kind: 'mega', index: 0 } } : c,
      ),
    });
    useLeagueStore.getState().removeLineWith(0, 95); // seat 2
    expect(card().powerup).toEqual({ seat: 2, kind: 'mega', index: 0 });
  });

  it('goes when its own line goes', () => {
    useLeagueStore.getState().removeLineWith(0, 75); // seat 1, which holds it
    expect(card().powerup).toBeNull();
  });

  it('does not transfer to a line that replaces its own', () => {
    useLeagueStore.getState().replaceLine(0, 1, [4, 5, 6]);
    expect(card().powerup).toBeNull();
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
