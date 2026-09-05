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

import { TYPE_BADGE_ASPECT } from '@/lib/typeBadgeGeometry';
import { ELITE_ROW, CHAMPION_ROW, BOSS_ROW, ROW_COUNT } from '../model/constants';

/** Export px per app rem-unit: the card's 3.25rem sprite is 96px. */
export const K = 96 / 52;

// ---------- the picture, shared by both exports ----------

/**
 * One width for both pictures.
 *
 * Each picture is its content, edge to edge: no page around it and no card
 * chrome, so nothing reads as a card floating on a blank ground. Someone
 * flipping between the league and a trainer card in their photo gallery sees
 * one width; each picture is as tall as its own content.
 *
 * The box is the league's natural width at 1× sprites. The trainer card's
 * columns are derived from it below.
 */
export const BOX_W = 864;

/** The credit strip under the content. */
export const FOOT = 36;

/**
 * The credit's size and its prefix. Fitted to a 393pt phone screen a 14px run
 * lands at about 6.4pt, the size the dex poster's credit lands at.
 */
export const CREDIT_PX = 14;
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
export const BAND_R = 9;
export const SLOT_R = 15;

export const CARD_W = BOX_W;

/**
 * The title row: "Pro Trainer Card", a break, then the type badge and "Type
 * Specialist", all at one size and one weight so the row reads as a header
 * rather than a title with a caption. A card with no type shows the title
 * alone. The row is a whole pixel tall so the grid under it starts on one.
 */
export const CARD_TITLE = 'Pro Trainer Card';
export const SPECIALIST = 'Type Specialist';
export const TITLE_SEP = '·';
export const TITLE_PX = 15 * K;
export const TITLE_TRACK = -0.01 * TITLE_PX;
export const TITLE_ROW_H = 34;
/** Either side of the break. */
export const TITLE_GAP = 14;
/** Between the badge and "Type Specialist". */
export const TITLE_WORD_GAP = 8;
/** The badge, a touch over the 4.5rem the first draft had. */
export const TITLE_BADGE_W = 5 * 16 * K;
export const TITLE_BADGE_H = TITLE_BADGE_W / TYPE_BADGE_ASPECT;

/**
 * The theme row: THEME, then a white rounded field to the right edge, so the
 * theme reads as something its owner filled in. The label keeps the size it
 * had; the value is the size the showcase names were set at.
 */
export const THEME_LABEL_PX = 10.5 * K;
export const THEME_TEXT_PX = 13 * K;
/** Between the title row and the theme field. */
export const THEME_GAP = 14;
export const FIELD_H = 40;
export const FIELD_R = 10;
export const FIELD_PADX = 12;
/** Between THEME and its field. */
export const LABEL_GAP = 8;
/** Under the theme field, above the first band. */
export const HDR_GAP = 16;
/** The title row, the theme field and their gaps: what sits above the grid. */
export const TITLE_BLOCK_H = TITLE_ROW_H + THEME_GAP + FIELD_H + HDR_GAP;

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

/** The grid's top inside the picture: under the padding and the title block. */
export function gridTop(): number {
  return PADY + TITLE_BLOCK_H;
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

// ---------- the pictures: one width, each as tall as its content ----------

/** The trainer card: its padding, the title block, the grid, and the credit. */
export const CARD_IMG_H = PADY + TITLE_BLOCK_H + gridHeight() + FOOT;

/**
 * The league: its padding, the name line, four bands with their gaps,
 * fourteen rows, and the credit.
 */
export const HOME_IMG_H = Math.ceil(HPADY + HOME_HDR_H + 14 * ROW2 + 4 * BAND2 + 3 * 2 + FOOT);

export { ELITE_ROW, CHAMPION_ROW, BOSS_ROW, ROW_COUNT };
