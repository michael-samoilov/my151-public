import { describe, expect, it } from 'vitest';
import * as L from './layout';
import { showcasePair, exportRow } from './exportLeague';
import { emptyCard, type GymCard } from '../store/useLeagueStore';
import { makePlacedLine } from '../model/engine';

/**
 * The export's geometry is arithmetic, not layout: nothing here reads the DOM,
 * so a drift shows up as a failing number rather than as a crooked picture
 * somebody has to notice. The card's own drawing is verified by rendering it
 * and diffing against the design canvas, which these numbers underwrite.
 */
describe('export layout', () => {
  it('gives the card seven columns and its padding', () => {
    expect(L.CARD_W).toBe(7 * L.COL + 2 * L.PADX);
    expect(L.PAGE_W).toBe(L.CARD_W + 2 * L.MARGIN);
  });

  it('keeps the card page inside a phone frame', () => {
    // 9:19.5 is the tallest common phone. A taller page than that arrives
    // shrunk to fit, which is what made the 1x sprite decision worth having.
    const ratio = (9 * L.cardPageHeight()) / L.PAGE_W;
    expect(ratio).toBeLessThan(19.5);
    expect(ratio).toBeGreaterThan(15);
  });

  it('keeps the league home page inside a phone frame', () => {
    const ratio = (9 * L.homePageHeight()) / L.HOME_PAGE_W;
    expect(ratio).toBeLessThan(19.5);
  });

  it('leaves a band before the elite and endgame rows only', () => {
    // Each row is one row-height further down, plus a band where one is drawn.
    for (let row = 2; row <= L.ROW_COUNT; row++) {
      const step = L.rowTop(row) - L.rowTop(row - 1);
      expect(step).toBe(L.BAND_BEFORE[row] ? L.ROW + L.BAND + 2 : L.ROW);
    }
    expect(Object.keys(L.BAND_BEFORE).map(Number).sort((a, b) => a - b)).toEqual([
      L.ELITE_ROW,
      L.BOSS_ROW,
    ]);
  });

  it('places a banded row so its band clears the row above', () => {
    // The band is drawn one band-height back from the row, and the two-pixel
    // gap sits above it. Getting this backwards raised every band by 2px.
    const bandTop = L.rowTop(L.ELITE_ROW) - L.BAND;
    expect(bandTop).toBe(L.rowTop(L.ELITE_ROW - 1) + L.ROW + 2);
  });

  it('fits the showcase slot inside three columns and four rows', () => {
    const box = L.showcaseBox();
    expect(box.width).toBe(3 * L.COL - 2 * L.INX);
    expect(box.height).toBe(4 * L.ROW - 2 * L.INY);
    // The signature block: two heading lines, a gap, and the 2x sprite.
    expect(2 * L.HEAD_LINE + 12 + L.SIG_SPRITE).toBeLessThan(box.height);
  });

  it('draws showcase sprites at a whole multiple of the source', () => {
    expect(L.PAIR_SPRITE % 96).toBe(0);
    expect(L.SIG_SPRITE % 96).toBe(0);
  });

  it('gives the TM and badge slots the same box', () => {
    const tm = L.slotX(1, 2);
    expect(tm.width).toBe(2 * L.COL - 2 * L.INX);
    // The mark column, its two paddings and the body all fit the box.
    expect(L.MARK_PAD + L.MARK_COL + L.MARK_PAD + L.TM_BADGE_W).toBeLessThan(tm.width);
  });

  it('keeps both slot labels above the legibility floor', () => {
    expect(L.MARK_LABEL_PX).toBeGreaterThanOrEqual(12);
    expect(L.HEAD_PX).toBeGreaterThanOrEqual(12);
  });

  it('spans the home row across its glyph, type and seat columns', () => {
    expect(L.HOME_INNER).toBeCloseTo(L.GLYPH_COL + L.TYPE_COL + 7 * L.SEAT_COL, 6);
    expect(L.HOME_PAGE_W).toBeCloseTo(L.HOME_W + 2 * L.MARGIN, 6);
  });

  it('names a vacancy for every slot kind', () => {
    expect(Object.keys(L.VACANCY).sort()).toEqual(['boss', 'champion', 'elite', 'gym']);
  });
});

function cardWith(over: Partial<GymCard>): GymCard {
  return { ...emptyCard(), ...over };
}

describe('reading a card for export', () => {
  it('reads no showcase from an empty card', () => {
    expect(showcasePair(emptyCard())).toEqual({ ace: null, partner: null });
  });

  it('reads the picked signature, not the line leaf', () => {
    const card = cardWith({
      lines: [makePlacedLine([1, 2, 3])],
      signatureSeat: 1,
      signatureId: 2,
    });
    expect(showcasePair(card)).toEqual({ ace: 2, partner: null });
  });

  it('falls back to the endgame member when nothing was picked', () => {
    const card = cardWith({ lines: [makePlacedLine([1, 2, 3])], signatureSeat: 1 });
    expect(showcasePair(card).ace).toBe(3);
  });

  it('reads the partner beside the ace', () => {
    const card = cardWith({
      lines: [makePlacedLine([1, 2, 3])],
      signatureSeat: 1,
      signatureId: 3,
      partnerId: 25,
    });
    expect(showcasePair(card)).toEqual({ ace: 3, partner: 25 });
  });

  it('gives every row the seats its team size allows', () => {
    const card = cardWith({ lines: [makePlacedLine([1, 2, 3])] });
    for (let row = 1; row <= L.ROW_COUNT; row++) {
      expect(exportRow(card, row)).toHaveLength([2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6][row - 1]);
    }
  });

  it('carries a legendary onto the endgame row only', () => {
    const card = cardWith({
      lines: [makePlacedLine([1, 2, 3])],
      legends: [{ pokemonId: 150, seat: 1 }],
    });
    expect(exportRow(card, L.BOSS_ROW).some((c) => c.pokemonId === 150)).toBe(true);
    expect(exportRow(card, L.CHAMPION_ROW).some((c) => c.pokemonId === 150)).toBe(false);
  });
});
