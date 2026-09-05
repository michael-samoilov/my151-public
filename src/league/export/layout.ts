/**
 * The export's geometry, in export pixels.
 *
 * Both exports are drawn on a canvas at 1× sprites, which fixes the scale: a
 * team sprite is its native 96px, and every rem-based measurement is the app's
 * own value multiplied by `K`. Nothing here reads the DOM, so the numbers are
 * the same on every engine and the tests can assert them without a browser.
 *
 * The design of record is the canvas at
 * docs/future-tools/league-builder/DECISIONS.md; the artboards were generated
 * from these same constants.
 */

import { ELITE_ROW, CHAMPION_ROW, BOSS_ROW, ROW_COUNT } from '../model/constants';

/** Export px per app rem-unit: the card's 3.25rem sprite is 96px. */
export const K = 96 / 52;

// ---------- the page, shared by both exports ----------

/**
 * One page and one card box for both exports.
 *
 * Someone flipping between the league and a trainer card in their photo
 * gallery should see the card stay put: same page size, same left edge, same
 * top, same width. The gallery centres each picture, so a shorter page would
 * drop the card down the screen; the pages are therefore the same height too,
 * and the trainer card, which is three rows shorter than the league, leaves
 * the page's bottom margin deeper rather than moving.
 *
 * The box is the league's natural width at 1× sprites. The trainer card's
 * columns are derived from it below.
 */
export const BOX_W = 864;

/** The page margin above the card, and the credit strip under it. */
export const MARGIN = 40;
export const FOOT = 36;

/**
 * Every export page is 9:16, the story frame.
 *
 * Photos on an iPhone fits a picture to the screen's width and centres it. A
 * page taller than about 9:16.8 leaves so little above it that the top edge
 * sits under the notch; the first pages were 9:16.9 and 9:17.7 and lost their
 * headers to it. At 9:16 the bars above and below are 9% of the screen each,
 * which clears any notch. The content's height is fixed by 1× sprites, so
 * the ratio is met by the side margins, never by squeezing rows.
 */
export const PAGE_ASPECT = 16 / 9;

/**
 * The credit's size and its prefix. About 6pt on a phone screen once the
 * page is fitted to its width, the size the dex poster's credit lands at.
 */
export const CREDIT_PX = 16;
export const CARD_CREDIT_PREFIX = "/vp/'s Pro Trainer Card";
export const HOME_CREDIT_PREFIX = 'Pokémon League Builder';

// ---------- the gym card ----------

/**
 * Half a pixel over the app's 15, so that with an odd column every cell
 * centre, and so every sprite, lands on a whole pixel. A sprite drawn from a
 * half pixel is resampled by one device pixel against the same sprite laid
 * out by the browser, which showed up as hatching over every team member
 * when the export was diffed against its artboard.
 */
export const PADX = 15.5;
export const PADY = 20;
/**
 * The column: the box less the card's padding, over seven.
 *
 * On a phone the app fits the card by keeping the pane's width and giving up
 * height, so the columns end up wider than the rows are tall: 3.9rem across
 * to 3.375rem down, measured on an iPhone. The desktop's 3.11rem column made
 * the export taller and narrower than the card people actually look at. At
 * 119px the column is a touch wider still, so the trainer card can share the
 * league's box.
 */
export const COL = (BOX_W - 2 * PADX) / 7;
export const ROW = 100;
/** A spacer band's height. */
export const BAND = 37;
/** Vertical inset of a cell inside its row. */
export const INY = 11;
/** Horizontal inset of a cell inside its column. */
export const INX = 5.5;

export const CELL_R = 11;
export const CARD_R = 30;
export const BAND_R = 9;
export const SLOT_R = 15;

export const CARD_W = BOX_W;

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

/** Placeholder copy in an empty slot: the app's 0.6875rem hint size. */
export const HINT_PX = 11 * K;

/** The glyph cell spans two columns on rows 1, 8 and 9. */
export const GLYPH_SPAN: Record<number, number> = { 1: 2, 8: 2, 9: 2 };

export const BAND_BEFORE: Record<number, [string, string]> = {
  [ELITE_ROW]: ['ELITE FOUR & CHAMPION', 'Champion may have one Mega/Gigantamax'],
  [BOSS_ROW]: ['ENDGAME BOSS TEAM', 'may also include one minor Legendary'],
};

/**
 * Three sizes that have to agree inside the TM and badge boxes: the label
 * column, the label in it, and the TM's type badge beside it.
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
/** The move name, at the app's 0.6875rem, and the smallest it may shrink to. */
export const MOVE_PX = 11 * K;
export const MOVE_MIN_PX = 12;

/** Top of a row inside the grid box, which starts at the first band. */
export function rowTop(row: number): number {
  let top = BAND;
  for (let r = 1; r < row; r++) {
    top += ROW;
    if (BAND_BEFORE[r + 1]) top += BAND + 2;
  }
  return top;
}

/**
 * Left edge and width of a slot spanning columns `from`..`to`, 1-indexed,
 * measured from the grid's own left edge (the card's content box).
 *
 * The slot wears the same horizontal inset a team cell does, so its left
 * edge lines up with the cells below it and its right edge stops one inset
 * short of the next column. An earlier version also added the card's padding
 * here, which pushed all three slots 15px right and over the glyph cells.
 */
export function slotX(from: number, to: number): { left: number; width: number } {
  return {
    left: (from - 1) * COL + INX,
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

// ---------- the league home ----------

/** Export px per app rem-unit on the home, whose seat sprite is 2.625rem. */
export const K2 = 96 / 42;

export const ROW2 = 44 * K2;
export const BAND2 = 20 * K2;
export const HPADY = 4 * K2;
export const HPADX = 8 * K2;
/**
 * The glyph column is wider than the app's own 2.75rem: its cell is drawn at
 * three by two, the shape the cell has on a phone once the home is fitted to
 * the screen, rather than the near-square the stylesheet asks for.
 */
export const GLYPH_COL = 57 * K2;
export const TYPE_COL = 32 * K2;
/** One line: the league's name, with the team tag at the right. */
export const HOME_HDR_H = 24 * K2;
export const HOME_R = 5 * K2;

export const HOME_W = BOX_W;
export const HOME_INNER = HOME_W - 2 * HPADX;
/** The seven seats share what the glyph and type columns leave. */
export const SEAT_COL = (HOME_INNER - GLYPH_COL - TYPE_COL) / 7;

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

// ---------- the shared page, sized by the taller card ----------

/** The page's height: the league, which is the taller of the two cards. */
export const PAGE_H = Math.ceil(MARGIN + homeCardHeight() + FOOT);

/**
 * The page's width: what 9:16 needs, and never less than the box with its
 * top margin either side. Kept to a whole side margin, so the box and every
 * column in it start on a pixel: a half-pixel margin once put every sprite
 * between two pixels.
 */
export const PAGE_W = (() => {
  let w = Math.max(BOX_W + 2 * MARGIN, Math.ceil(PAGE_H / PAGE_ASPECT));
  if ((w - BOX_W) % 2 !== 0) w += 1;
  return w;
})();

/** The box's left edge on the page. */
export const SIDE = (PAGE_W - BOX_W) / 2;

export { ELITE_ROW, CHAMPION_ROW, BOSS_ROW, ROW_COUNT };
