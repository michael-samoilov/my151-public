/**
 * The live card's signature pane: the ace at twice the partner's size.
 *
 * Michael's rule: the ace sits top left at 2x, the partner bottom right at
 * 1x, and the seam keeps its 30 degrees but moves down so it clears the ace.
 *
 * The pane is three cells wide. On a tall phone that is 9rem, and a 2x and a
 * 1x sprite need 9.75rem, so the two cannot also carry a caption across
 * their width the way the equal pair did. Each caption sits beside its own
 * sprite instead: the ace's under the ace, reading left to right from the
 * pane's edge, and the partner's to the partner's left, right-aligned
 * against it. Both captions share the corner under the ace, and the seam
 * runs between them.
 *
 * The export draws its own pane from `slotLayout.ts` and is unchanged.
 */

/** The ace is this many partner sprites wide. */
export const ACE_SCALE = 2;

/**
 * The pad between each sprite and the pane's edge. Half the equal pair's
 * 0.5rem: the pair's pad was spent on a sprite's own transparent margin, and
 * a 2x sprite carries twice that margin, so its ball still sits where the
 * 1x ball did.
 */
export const SHOWCASE_PAD_REM = 0.25;

/**
 * The room between the partner's caption and the partner. The ball already
 * sits a twelfth of the square inside it, so the words stand clear of the
 * ball by more than this.
 */
export const CAPTION_GAP_X_REM = 0.1875;

/**
 * The room between the ace and the caption under it: a single pixel, for
 * the same reason. The ball's own inset is the gap, and every pixel the
 * caption rises is one more between it and the seam. The pixel keeps the
 * caption's box off the sprite's square rather than touching it.
 */
export const CAPTION_GAP_Y_REM = 0.0625;

/**
 * The caption type, which gives way on a narrow pane.
 *
 * The partner's caption shares the pane's width with the partner, so its
 * widest line has `100cqw` less the pads, the gap and one sprite. The widest
 * lines are SHOULDERMON at full tracking, 8.84em, and Brambleghast, the
 * widest English name, 8.71em; 8.9em covers both. Where that room is short
 * the size comes down from the card's 0.53125rem to the 0.4rem floor the TM
 * and badge labels already use, and below the floor the heading's tracking
 * gives way too, as theirs does: SHOULDERMON is 7.96em untracked, over
 * eleven letters. A 390px phone keeps the full size; a 320px one does not.
 *
 * Both captions take the same size and tracking, so the pair keeps one
 * label face.
 */
const CAPTION_WIDEST_EM = 8.9;
const SHOULDERMON_EM = 7.96;
const SHOULDERMON_LETTERS = 11;
export const CAPTION_MAX_REM = 0.53125;
export const CAPTION_MIN_REM = 0.4;
const CAPTION_ROOM = `(100cqw - ${2 * SHOWCASE_PAD_REM + CAPTION_GAP_X_REM}rem - var(--slot-unit))`;
export const CAPTION_SIZE = `clamp(${CAPTION_MIN_REM}rem, ${CAPTION_ROOM} / ${CAPTION_WIDEST_EM}, ${CAPTION_MAX_REM}rem)`;
export const CAPTION_TRACK =
  `clamp(0rem, (${CAPTION_ROOM} - ${SHOULDERMON_EM} * var(--cap-size)) / ${SHOULDERMON_LETTERS}, 0.08em)`;

/**
 * The partner's edge in pane px: one team sprite, the 3.25rem cell.
 *
 * Only a pane too narrow to hold a 2x ace between its pads, which no phone
 * from 320px up reaches, takes less, and then the pair keeps its 2:1 at
 * whatever the width allows.
 */
export function showcaseUnit(w: number, remPx: number, cellRem: number): number {
  const cell = cellRem * remPx;
  if (w < 8) return cell;
  return Math.min(cell, (w - 2 * SHOWCASE_PAD_REM * remPx) / ACE_SCALE);
}

/**
 * Where the seam passes.
 *
 * - `between`: through the midpoint of the two captions' outer corners, so
 *   the seam splits the room the captions share. The default.
 * - `hug`: as high as it can sit while it clears the ace's square by
 *   `HUG_CLEAR_REM`. The least move from where the seam was.
 */
export type SeamRule = 'between' | 'hug';

/** How far the `hug` seam stays off the ace's square, measured square to it. */
export const HUG_CLEAR_REM = 0.25;

const TAN_30 = Math.tan(Math.PI / 6);

export interface Point {
  x: number;
  y: number;
}

/** The seam's two ends, as fractions of the pane: left or bottom end first. */
export interface SeamEnds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Showcase {
  /** The partner's sprite edge, in pane px. The ace's is `ACE_SCALE` times it. */
  unit: number;
  /** The ace's square, top left. */
  ace: { left: number; top: number; size: number };
  /** The partner's square, bottom right. */
  partner: { left: number; top: number; size: number };
  /** The ace caption's top-left corner. */
  aceCaption: Point;
  /** The partner caption's bottom-right corner. */
  partnerCaption: Point;
  /** A point the seam passes through. */
  through: Point;
  seam: SeamEnds;
}

/**
 * The 30 degree line through `p`, cut to the pane.
 *
 * It rises to the right, as the equal pair's seam did. Each end lands on
 * whichever edge it meets first, so a seam low in the pane leaves through
 * the bottom edge rather than the left one.
 */
export function seamThrough(w: number, h: number, p: Point): SeamEnds {
  const yAt = (x: number) => p.y + TAN_30 * (p.x - x);
  const xAt = (y: number) => p.x - (y - p.y) / TAN_30;
  const left = yAt(0) > h ? { x: xAt(h), y: h } : { x: 0, y: yAt(0) };
  const right = yAt(w) < 0 ? { x: xAt(0), y: 0 } : { x: w, y: yAt(w) };
  return { x1: left.x / w, y1: left.y / h, x2: right.x / w, y2: right.y / h };
}

/** The line's height at `x`, for a seam in pane fractions. */
export function seamYAt(seam: SeamEnds, w: number, h: number, x: number): number {
  const x1 = seam.x1 * w;
  const y1 = seam.y1 * h;
  const x2 = seam.x2 * w;
  const y2 = seam.y2 * h;
  return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
}

/**
 * Every position in the pane, from its size alone.
 *
 * Nothing here reads text. The captions are anchored by CSS at the corners
 * returned, and the seam is placed from those anchors, so a name that
 * changes, or a webfont that lands late, moves no part of the layout.
 */
export function showcase(
  w: number,
  h: number,
  remPx: number,
  unit: number,
  rule: SeamRule = 'between',
): Showcase {
  const pad = SHOWCASE_PAD_REM * remPx;
  const aceSize = ACE_SCALE * unit;
  const ace = { left: pad, top: pad, size: aceSize };
  const partner = { left: w - pad - unit, top: h - pad - unit, size: unit };
  const aceCaption = { x: pad, y: pad + aceSize + CAPTION_GAP_Y_REM * remPx };
  const partnerCaption = { x: partner.left - CAPTION_GAP_X_REM * remPx, y: h - pad };
  // Both candidate lines are parallel, so the lower of the two is the one
  // whose point sits further along the seam's normal. `between` never rises
  // past `hug`: on a narrow pane the captions' midpoint climbs toward the
  // ace, and the seam stops where it would touch it.
  const hug = { x: ace.left + aceSize, y: ace.top + aceSize + (HUG_CLEAR_REM * remPx) / Math.cos(Math.PI / 6) };
  const mid = { x: (aceCaption.x + partnerCaption.x) / 2, y: (aceCaption.y + partnerCaption.y) / 2 };
  const depth = (q: Point) => q.y + TAN_30 * q.x;
  const through = rule === 'hug' || depth(hug) > depth(mid) ? hug : mid;
  return { unit, ace, partner, aceCaption, partnerCaption, through, seam: seamThrough(w, h, through) };
}
