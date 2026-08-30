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
