import { describe, expect, it } from 'vitest';
import * as L from './layout';
import { showcasePair, exportRow, vacantRow } from './exportLeague';
import { emptyCard, type GymCard } from '../store/useLeagueStore';
import { makePlacedLine } from '../model/engine';
import { TEAM_SIZES } from '../model/constants';
import { placeSlot } from '../slotLayout';

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

  it('frames the trainer card and leaves the league bare, each as tall as its content', () => {
    // The picture is the content, edge to edge: no page and no card chrome.
    // The card wears a 12px frame in the bar's colour down its sides and
    // along its bottom; the league is the bare box. Each picture ends just
    // under its own credit, or its frame.
    expect(L.CARD_W).toBe(L.BOX_W);
    expect(L.HOME_W).toBe(L.BOX_W);
    expect(L.CARD_IMG_W).toBe(L.CARD_W + 2 * L.FRAME);
    expect(L.CARD_IMG_H).toBe(L.TITLE_BLOCK_H + L.gridHeight() + L.FOOT + L.FRAME);
    expect(L.TITLE_BLOCK_H).toBe(L.BAR_H + L.THEME_GAP + L.FIELD_H + L.HDR_GAP);
    expect(L.homeImgH(true)).toBe(
      Math.ceil(L.HPADY + L.HOME_HDR_H + 14 * L.ROW2 + 4 * L.BAND2 + 6 + L.FOOT),
    );
    // An unnamed league draws no name line, so its picture is that shorter —
    // less the deeper top pad its first band takes instead.
    expect(L.homeImgH(true) - L.homeImgH(false))
      .toBe(Math.round(L.HOME_HDR_H - (L.HOME_GUTTER - L.HPADY)));
    // That pad is the gutter: the band has the same air above it as beside it.
    expect(L.homeTopPad(false)).toBe(L.HPADX + L.HOME_RAIL - L.HOME_R);
    expect(L.homeTopPad(true)).toBe(L.HPADY);
    expect(L.CARD_IMG_H).toBeLessThan(L.homeImgH(false));
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
    // The title block above the grid is a whole height for the same reason.
    expect(Number.isInteger(L.TITLE_BLOCK_H)).toBe(true);
    expect(Number.isInteger(L.FRAME)).toBe(true);
    for (let i = 0; i < 7; i++) {
      expect(Number.isInteger(L.FRAME + L.PADX + (i + 0.5) * L.COL)).toBe(true);
    }
    for (let row = 1; row <= L.ROW_COUNT; row++) {
      expect(Number.isInteger(L.gridTop() + L.rowTop(row) + L.ROW / 2)).toBe(true);
    }
  });

  it('starts the title, the theme label and the grid on one left rail', () => {
    // The header block and the grid share a left edge. A band and a glyph
    // cell are drawn one rail in from the card's padding, and a row that
    // fills all seven columns leaves no lead, so its glyph cell is the
    // leftmost on the card. The title and THEME start from the same x.
    expect(L.BAR_TEXT_X).toBe(L.PADX + L.RAIL);
    const leads = TEAM_SIZES.map((size, i) => 7 - size - (L.GLYPH_SPAN[i + 1] ?? 1));
    expect(Math.min(...leads)).toBe(0);
    expect(L.RAIL).toBeCloseTo(L.INX, 1);
  });

  it('fits the title row inside the bar, with the ringed badge inside it', () => {
    // At 0.7em a glyph, wider than Inter's extrabold runs, the whole row
    // still fits from the rail: the name, the break, the badge, and
    // "Type Specialist".
    const words = (L.CARD_TITLE.length + L.SPECIALIST.length) * 0.7 * L.TITLE_PX;
    const row = words + 0.4 * L.TITLE_PX + L.TITLE_BADGE_W + 2 * L.TITLE_GAP + L.TITLE_WORD_GAP;
    expect(L.BAR_TEXT_X + row).toBeLessThan(L.CARD_W - L.PADX);
    expect(L.TITLE_BADGE_H + 2 * L.BAR_RING).toBeLessThanOrEqual(L.BAR_H);
    expect(L.TITLE_PX * 1.2).toBeLessThanOrEqual(L.TITLE_ROW_H);
    expect(L.BAR_H).toBeGreaterThan(L.TITLE_ROW_H);
  });

  it('keeps both showcase blocks inside the slot at 2×', () => {
    // The app's own solver, with the heading runs as the export measures
    // them in Inter (ACE POKÉMON 91×44, PARTNER / SHOULDERMON 139×44) and no
    // names. Pinned at 2× the two blocks overlap each other at their corners
    // by design, but neither may leave the slot.
    const box = L.showcaseBox();
    const head = 2 * L.HEAD_LINE;
    const slot = placeSlot(
      box.width,
      box.height,
      { head: [91.2, head], name: [0, 0] },
      { head: [138.5, head], name: [0, 0] },
      L.PAIR_SPRITE,
    );
    for (const p of [slot.ace, slot.partner]) {
      expect(p.sprite).toBe(L.PAIR_SPRITE);
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.top).toBeGreaterThanOrEqual(0);
      expect(p.left + p.width).toBeLessThanOrEqual(box.width);
      expect(p.top + head + p.sprite).toBeLessThanOrEqual(box.height);
    }
  });

  it('gives the theme field room for its text and its label', () => {
    expect(L.THEME_TEXT_PX * 1.25).toBeLessThan(L.FIELD_H);
    expect(L.THEME_LABEL_PX).toBeLessThan(L.THEME_TEXT_PX);
    expect(L.THEME_LABEL_PX).toBeGreaterThanOrEqual(12);
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
    for (const [from, to] of [[1, 3], [1, 2]] as const) {
      const slot = L.slotX(from, to);
      expect(slot.left).toBe((from - 1) * L.COL + L.INX);
      expect(slot.left + slot.width).toBeLessThan(to * L.COL + L.RAIL);
    }
  });

  it('mirrors every band overhang across the picture', () => {
    // A band's corner curve ends on the rail, so the band begins one radius
    // left of it and its label lands on the rail. That overhang is mirrored
    // at the other end: the band sits the same distance in from each edge.
    const card = {
      left: L.FRAME + L.PADX + L.RAIL - L.BAND_R,
      right: L.FRAME + L.PADX + L.CARD_W - 2 * L.PADX - L.RAIL + L.BAND_R,
    };
    expect(L.CARD_IMG_W - card.right).toBeCloseTo(card.left, 6);
    expect(card.left).toBeGreaterThan(L.FRAME);
    const home = {
      left: L.HPADX + L.HOME_RAIL - L.HOME_R,
      right: L.HPADX + L.HOME_INNER - L.HOME_RAIL + L.HOME_R,
    };
    expect(L.HOME_W - home.right).toBeCloseTo(home.left, 6);
    expect(home.left).toBeGreaterThan(0);
    // The overhang is shorter than it would be at the old label padding.
    expect(L.BAND_R).toBeLessThan(8 * L.K);
    expect(L.HOME_R).toBeLessThan(8 * L.K2);
  });

  it('sets the home glyph cell three by two', () => {
    const inset = L.HOME_RAIL;
    const w = L.GLYPH_COL - 2 * inset;
    const h = L.ROW2 - 10 * L.K2;
    expect(w / h).toBeCloseTo(1.5, 1);
  });

  it('keeps both slot labels above the legibility floor', () => {
    expect(L.MARK_LABEL_PX).toBeGreaterThanOrEqual(12);
    expect(L.HEAD_PX).toBeGreaterThanOrEqual(12);
  });

  it('spans the home row across its glyph, type and seat columns', () => {
    expect(L.HOME_INNER).toBeCloseTo(L.GLYPH_COL + L.TYPE_COL + L.SEAT_COUNT * L.SEAT_COL, 6);
  });

  it('widens the picture when story and rematch export side by side', () => {
    const base = L.homeExportGeometry(false, false);
    const wide = L.homeExportGeometry(false, true);
    const teamBlock = L.SEAT_COUNT * L.SEAT_COL;
    expect(wide.homeW).toBeCloseTo(base.homeW + teamBlock + L.HOME_SIDE_GAP, 6);
    expect(wide.seatCol).toBe(base.seatCol);
  });

  it('widens the picture for gym details without shrinking seats', () => {
    const base = L.homeExportGeometry(false, false);
    const detailed = L.homeExportGeometry(true, false);
    expect(detailed.homeW).toBe(base.homeW + L.HOME_DETAILS_COL);
    expect(detailed.seatCol).toBe(base.seatCol);
  });

  it('sets the credit at about six points on a phone', () => {
    // A 393pt-wide screen shows the picture fitted to its width.
    const onScreenPt = (L.CREDIT_PX / L.CARD_IMG_W) * 393;
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

  it('shows the dashed square for a seat with no Pokémon and no type', () => {
    // An open seat reads as the app shows it. A team with no type, or a type
    // with no team, is a choice someone made, and keeps its mark.
    expect(vacantRow(emptyCard())).toBe(true);
    expect(vacantRow(cardWith({ type: 'none' }))).toBe(true);
    expect(vacantRow(cardWith({ type: 'fire' }))).toBe(false);
    expect(vacantRow(cardWith({ lines: [makePlacedLine([1, 2, 3])] }))).toBe(false);
    expect(vacantRow(cardWith({ lines: [makePlacedLine([1, 2, 3])], type: 'none' }))).toBe(false);
  });
});
