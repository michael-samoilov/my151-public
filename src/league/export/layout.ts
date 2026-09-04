/**
 * The export's geometry, in export pixels.
 *
 * Both exports are drawn on a canvas at 1× sprites, which fixes the scale: a
 * team sprite is its native 96px, and every other measurement is the app's own
 * rem value multiplied by `K`. Nothing here reads the DOM, so the numbers are
 * the same on every engine and the tests can assert them without a browser.
 *
 * The design of record is the canvas at
 * docs/future-tools/league-builder/DECISIONS.md; the artboards were generated
 * from these same constants.
 */

import { ELITE_ROW, CHAMPION_ROW, BOSS_ROW, ROW_COUNT } from '../model/constants';

/** Export px per app rem-unit: the card's 3.25rem cell holds a 96px sprite. */
export const K = 96 / 52;

// ---------- the gym card ----------

export const COL = 92;
export const ROW = 100;
/** A spacer band's height. */
export const BAND = 37;
export const PADX = 15;
export const PADY = 20;
/** Vertical inset of a cell inside its row. */
export const INY = 11;
/** Horizontal inset of a cell inside its column. */
export const INX = 5.5;

export const CELL_R = 11;
export const CARD_R = 30;
export const BAND_R = 9;
export const SLOT_R = 15;

/** The page margin around the card, and the credit strip under it. */
export const MARGIN = 40;
export const FOOT = 48;

export const CARD_W = 7 * COL + 2 * PADX; // 674
export const PAGE_W = CARD_W + 2 * MARGIN; // 754

/** The identity block above the first band, and the gap under it. */
export const HDR_H = 55;
export const HDR_GAP = 16;

/**
 * The two showcase sprite sizes, settled.
 *
 * Pixel art only survives a whole multiple of its 96px source, so the choice
 * is 1× or 2× and nothing between. A pair takes 1×: two 2× sprites each need
 * 192px of clearance, and the slot's 30° seam leaves their centres at most
 * 73px apart across and 186px down, so they would collide by 125×100px. A
 * taller slot caps lower, not higher, because the seam leaves through the top
 * and bottom edges. One Pokémon takes 2×, having the whole slot and no seam
 * to share.
 */
export const PAIR_SPRITE = 96;
export const SIG_SPRITE = 192;

/**
 * THEME and the theme, in px rather than as a ratio, because px is what the
 * eye compares. The label keeps the size it had; the value comes down to the
 * size the showcase names were set at, which lands the pair near 0.81.
 */
export const THEME_LABEL_PX = 10.5 * K;
export const THEME_TEXT_PX = 13 * K;

/** The slot heading runs: two lines, 0.53125rem extrabold, 1.4 line-height. */
export const HEAD_PX = 8.5 * K;
export const HEAD_TRACK = 0.08 * HEAD_PX;
export const HEAD_LINE = HEAD_PX * 1.4;

/** The glyph cell spans two columns on rows 1, 8 and 9. */
export const GLYPH_SPAN: Record<number, number> = { 1: 2, 8: 2, 9: 2 };

export const BAND_BEFORE: Record<number, [string, string]> = {
  [ELITE_ROW]: ['ELITE FOUR & CHAMPION', 'Champion may have one Mega/Gigantamax'],
  [BOSS_ROW]: ['ENDGAME BOSS TEAM', 'may also include one minor Legendary'],
};

/**
 * Three sizes that have to agree inside one 173px box: the label column, the
 * label in it, and the TM's type badge beside it.
 *
 * "BADGE" at the app's own label size is about 52px, which a 45px column let
 * run into the badge's name. Widening the column instead squeezed the type
 * badge until the word inside it fell to 11.2px, under the legibility floor.
 * So the label comes down a size and the column stays where it was.
 */
export const MARK_COL = 45;
export const MARK_LABEL_PX = 6.7 * K;
export const MARK_TRACK = 0.06 * MARK_LABEL_PX;
export const TM_BADGE_W = 2.7 * 16 * K;
export const MARK_PAD = 7;

/** Top of a row inside the grid box, which starts at the first band. */
export function rowTop(row: number): number {
  let top = BAND;
  for (let r = 1; r < row; r++) {
    top += ROW;
    if (BAND_BEFORE[r + 1]) top += BAND + 2;
  }
  return top;
}

/** Left edge and width of a slot spanning columns `from`..`to`, 1-indexed. */
export function slotX(from: number, to: number): { left: number; width: number } {
  return {
    left: PADX + (from - 1) * COL + INX,
    width: (to - from + 1) * COL - 2 * INX,
  };
}

/** The ace/partner slot: three columns wide, four rows tall. */
export function showcaseBox(): { left: number; top: number; width: number; height: number } {
  const { left, width } = slotX(1, 3);
  return { left, top: rowTop(1) + INY, width, height: 4 * ROW - 2 * INY };
}

export function gridHeight(): number {
  return rowTop(ROW_COUNT) + ROW;
}

export function cardHeight(): number {
  return 2 * PADY + HDR_H + HDR_GAP + gridHeight();
}

export function cardPageHeight(): number {
  return MARGIN + cardHeight() + FOOT;
}

// ---------- the league home ----------

/** Export px per app rem-unit on the home, whose seat sprite is 2.625rem. */
export const K2 = 96 / 42;

export const ROW2 = 44 * K2;
export const BAND2 = 20 * K2;
export const HPADY = 4 * K2;
export const HPADX = 8 * K2;
export const GLYPH_COL = 44 * K2;
export const TYPE_COL = 32 * K2;
export const SEAT_COL = ((350 - 76) / 7) * K2;
export const HOME_HDR_H = 44 * K2;
export const HOME_R = 5 * K2;

export const HOME_INNER = GLYPH_COL + TYPE_COL + 7 * SEAT_COL;
export const HOME_W = HOME_INNER + 2 * HPADX;
export const HOME_PAGE_W = HOME_W + 2 * MARGIN;

/** The section band drawn before a slot index. */
export const SECTION_BEFORE: Record<number, string> = {
  0: 'GYM LEADERS',
  8: 'ELITE FOUR',
  12: 'CHAMPION',
  13: 'ENDGAME BOSS',
};

/** What an empty row says, by slot kind. */
export const VACANCY: Record<string, string> = {
  gym: 'Gym leader vacancy',
  elite: 'Elite Four vacancy',
  champion: 'Champion vacancy',
  boss: 'No endgame boss trainer',
};

export function homeCardHeight(): number {
  return 2 * HPADY + HOME_HDR_H + 14 * ROW2 + 4 * BAND2 + 3 * 2;
}

export function homePageHeight(): number {
  return MARGIN + homeCardHeight() + FOOT;
}

export { ELITE_ROW, CHAMPION_ROW, BOSS_ROW, ROW_COUNT };
