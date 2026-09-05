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
  });

  it('gives both exports one page and one card box', () => {
    // Flipping between the two in a gallery must not move the card: same
    // page, same left edge, same top, same width. Only the bottom edge
    // differs, because the league is three rows taller.
    expect(L.CARD_W).toBe(L.BOX_W);
    expect(L.HOME_W).toBe(L.BOX_W);
    expect(L.PAGE_W).toBe(L.BOX_W + 2 * L.SIDE);
    expect(L.PAGE_H).toBeGreaterThanOrEqual(L.MARGIN + L.homeCardHeight() + L.FOOT);
    expect(L.PAGE_H).toBeGreaterThanOrEqual(L.MARGIN + L.cardHeight() + L.FOOT);
    expect(L.cardHeight()).toBeLessThan(L.homeCardHeight());
  });

  it('frames the page at 9:16, with the box no closer to the side than the top', () => {
    // Photos fits a picture to the screen's width. At 9:16 the bars above
    // and below clear the notch; the first pages were taller and lost their
    // headers under it.
    expect(L.PAGE_H / L.PAGE_W).toBeLessThanOrEqual(L.PAGE_ASPECT + 0.002);
    expect(L.SIDE).toBeGreaterThanOrEqual(L.MARGIN);
    expect(Number.isInteger(L.SIDE)).toBe(true);
  });

  it('gives the trainer card the column it has on a phone', () => {
    // Fitted to a phone the card keeps the pane's width and gives up height,
    // so its columns run wider than its rows are tall. The desktop's column
    // is 92px in these units; the phone's, measured, 115px.
    expect(L.COL).toBeGreaterThanOrEqual(115);
    expect(L.ROW / L.COL).toBeLessThan(0.9);
    expect(Number.isInteger(L.COL)).toBe(true);
  });

  it('puts every team sprite on a whole pixel', () => {
    // A sprite centred on a half pixel is resampled one device pixel off the
    // browser's own placement of the same sprite, which reads as hatching.
    for (let i = 0; i < 7; i++) {
      const cx = L.SIDE + L.PADX + (i + 0.5) * L.COL;
      expect(Number.isInteger(cx)).toBe(true);
    }
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

  it('keeps every slot clear of the glyph cell beside it', () => {
    // A slot ends one inset short of its last column; the glyph cell in the
    // next column starts its own inset in. The two never touch. An earlier
    // version added the card's padding to the slot and ran it 4px over.
    const glyphInset = 3 * L.K;
    for (const [from, to] of [[1, 3], [1, 2]] as const) {
      const slot = L.slotX(from, to);
      expect(slot.left).toBe((from - 1) * L.COL + L.INX);
      expect(slot.left + slot.width).toBeLessThan(to * L.COL + glyphInset);
    }
  });

  it('sets the home glyph cell three by two', () => {
    const inset = 3 * L.K2;
    const w = L.GLYPH_COL - 2 * inset;
    const h = L.ROW2 - 10 * L.K2;
    expect(w / h).toBeCloseTo(1.5, 1);
  });

  it('keeps both slot labels above the legibility floor', () => {
    expect(L.MARK_LABEL_PX).toBeGreaterThanOrEqual(12);
    expect(L.HEAD_PX).toBeGreaterThanOrEqual(12);
  });

  it('spans the home row across its glyph, type and seat columns', () => {
    expect(L.HOME_INNER).toBeCloseTo(L.GLYPH_COL + L.TYPE_COL + 7 * L.SEAT_COL, 6);
  });

  it('sets the credit at about six points on a phone', () => {
    // A 393pt-wide screen shows the page fitted to its width.
    const onScreenPt = (L.CREDIT_PX / L.PAGE_W) * 393;
    expect(onScreenPt).toBeGreaterThan(5.5);
    expect(onScreenPt).toBeLessThan(7);
    expect(L.CREDIT_PX * 1.5).toBeLessThan(L.FOOT);
  });

  it('keeps a twelve-letter move inside the TM box at its full size', () => {
    // "Flamethrower" and "Aromatherapy" are the longest single words in the
    // move data. At 0.6875rem in Inter a capital-led twelve-letter word runs
    // about 6.3 em, well inside the body once the mark column is paid for.
    const tm = L.slotX(1, 2);
    const body = tm.width - 3 * L.MARK_PAD - L.MARK_COL;
    expect(body).toBeGreaterThan(6.6 * L.MOVE_PX);
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
