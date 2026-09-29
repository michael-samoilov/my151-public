/**
 * The live card's signature pane: the ace at twice the partner's size.
 *
 * Michael's rule: the ace sits top left at 2x, the partner bottom right at
 * 1x, and the seam keeps its 30 degrees but moves down so it clears the ace.
 *
 * The pane is three cells wide. On a tall phone that is 9rem, and a 2x and a
 * 1x sprite need 9.75rem, so the captions cannot run across the pair's width
 * the way the equal pair's did. Where each caption goes instead is a mockup
 * choice, `CaptionPlan`, picked with `localStorage['ace-mock']`.
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

/** The room between a sprite and a caption beside it. */
export const CAPTION_GAP_X_REM = 0.1875;

/**
 * The room between a sprite and a caption under or over it: a single pixel.
 * The ball's own inset is the visible gap.
 */
export const CAPTION_GAP_Y_REM = 0.0625;

/**
 * The caption type, which gives way on a narrow pane.
 *
 * Measured in the caption face (Inter 800): SHOULDERMON is 8.83em at full
 * tracking and 7.95em untracked; ACE POKÉMON is 8.43em and 7.55em. The widest
 * name in any shipped locale is MANGUSPEKTOR (German Gumshoos), 8.94em, and
 * the widest English one is BRAMBLEGHAST, 8.70em. Where the room is short the
 * size comes down from the card's 0.53125rem to the 0.4rem floor the TM and
 * badge labels already use, and below the floor the heading's tracking gives
 * way too, as theirs does.
 */
const CAPTION_WIDEST_EM = 8.9;
const SHOULDERMON_EM = 7.96;
const SHOULDERMON_LETTERS = 11;
const ACE_HEAD_EM = 8.44;
const ACE_HEAD_PLAIN_EM = 7.56;
const ACE_HEAD_LETTERS = 10;
/** The widest name in any shipped locale, MANGUSPEKTOR, rounded up. */
const WIDEST_NAME_EM = 8.94;
export const CAPTION_MAX_REM = 0.53125;
export const CAPTION_MIN_REM = 0.4;

const GAPS_REM = 2 * SHOWCASE_PAD_REM + CAPTION_GAP_X_REM;
/** The partner's room beside its sprite. */
const PARTNER_ROOM = `(100cqw - ${GAPS_REM}rem - var(--slot-unit))`;
/** The ace's room beside its sprite. */
const ACE_ROOM = `(100cqw - ${GAPS_REM}rem - ${ACE_SCALE} * var(--slot-unit))`;
export const PARTNER_ROOM_CSS = `calc${PARTNER_ROOM}`;
export const ACE_ROOM_CSS = `calc${ACE_ROOM}`;

/**
 * A caption's size and tracking when its widest fixed line has `room`: the
 * size first, down to the floor, then the tracking.
 */
function captionFace(room: string, widestEm: number, plainEm: number, letters: number, max: string) {
  return {
    size: `clamp(${CAPTION_MIN_REM}rem, ${room} / ${widestEm}, ${max})`,
    track: `clamp(0rem, (${room} - ${plainEm} * var(--cap-size)) / ${letters}, 0.08em)`,
  };
}

/** The pane's caption face, set by the partner's room beside its sprite. */
export const PANE_FACE = captionFace(
  PARTNER_ROOM, CAPTION_WIDEST_EM, SHOULDERMON_EM, SHOULDERMON_LETTERS, `${CAPTION_MAX_REM}rem`,
);
/** The ace caption's face when it sits beside the ace and must fit there. */
export const ACE_BESIDE_FACE = captionFace(
  ACE_ROOM, ACE_HEAD_EM, ACE_HEAD_PLAIN_EM, ACE_HEAD_LETTERS, 'var(--pane-cap)',
);

/**
 * Where the two captions go. Each field is one decision, so the options
 * Michael compares differ only where they say they do.
 */
export interface CaptionPlan {
  /**
   * The ace's caption: `under-left` under the ace from the pane's edge (the
   * first mock), `beside` to its right and centred on it, `under` under it
   * and centred on it, `around` with the heading over the ace and the name
   * under it.
   */
  ace: 'under-left' | 'beside' | 'under' | 'around';
  /**
   * The partner's caption: `foot` to its left on the bottom pad, heading
   * first (the first mock); `beside` to its left and centred on it, name
   * first; `around` with the name over the partner and the heading under it.
   */
  partner: 'foot' | 'beside' | 'around';
  /** A name too wide for its room runs on, wraps at a space or hyphen, or shrinks. */
  names: 'overflow' | 'wrap' | 'fit';
  /** The partner's caption may slide down from centred, as far as the partner's foot, to clear the seam. */
  slide: boolean;
  /** The pair steps down on a pane too narrow for a caption beside the ace. */
  step: boolean;
  /** The seam comes from the caption anchors or from the drawn text. */
  seam: 'anchor' | 'measured';
}

export const PLANS = {
  mock: { ace: 'under-left', partner: 'foot', names: 'overflow', slide: false, step: false, seam: 'anchor' },
  side: { ace: 'beside', partner: 'beside', names: 'overflow', slide: false, step: false, seam: 'measured' },
  stack: { ace: 'around', partner: 'around', names: 'overflow', slide: false, step: false, seam: 'measured' },
  wrap: { ace: 'beside', partner: 'beside', names: 'wrap', slide: false, step: false, seam: 'measured' },
  fit: { ace: 'beside', partner: 'beside', names: 'fit', slide: false, step: false, seam: 'measured' },
  under: { ace: 'under', partner: 'beside', names: 'overflow', slide: false, step: false, seam: 'measured' },
  step: { ace: 'beside', partner: 'beside', names: 'fit', slide: false, step: true, seam: 'measured' },
  underfit: { ace: 'under', partner: 'beside', names: 'fit', slide: false, step: false, seam: 'measured' },
  slide: { ace: 'under', partner: 'beside', names: 'fit', slide: true, step: false, seam: 'measured' },
  slideleft: { ace: 'under-left', partner: 'beside', names: 'fit', slide: true, step: false, seam: 'measured' },
} as const satisfies Record<string, CaptionPlan>;

export type PlanName = keyof typeof PLANS;
export const DEFAULT_PLAN: PlanName = 'slideleft';

export function isPlanName(value: unknown): value is PlanName {
  return typeof value === 'string' && Object.hasOwn(PLANS, value);
}

/** The steps a stepped pair takes, as shares of the team cell. */
const STEPS = [1, 7 / 8, 3 / 4, 5 / 8, 1 / 2];

/**
 * The partner's edge in pane px: one team sprite, the 3.25rem cell.
 *
 * Only a pane too narrow to hold a 2x ace between its pads, which no phone
 * from 320px up reaches, takes less, and then the pair keeps its 2:1 at
 * whatever the width allows. A stepped plan also steps down, an eighth of a
 * cell at a time, until the widest name fits beside the ace at the floor.
 */
export function showcaseUnit(w: number, remPx: number, cellRem: number, step = false): number {
  const cell = cellRem * remPx;
  if (w < 8) return cell;
  const fit = (w - 2 * SHOWCASE_PAD_REM * remPx) / ACE_SCALE;
  if (!step) return Math.min(cell, fit);
  const room = (w - GAPS_REM * remPx - WIDEST_NAME_EM * CAPTION_MIN_REM * remPx) / ACE_SCALE;
  const share = STEPS.find((s) => s * cell <= room) ?? STEPS[STEPS.length - 1];
  return Math.min(share * cell, fit);
}

const TAN_30 = Math.tan(Math.PI / 6);
const COS_30 = Math.cos(Math.PI / 6);

/** How far the seam stays off the ace's square, measured square to it. */
export const SQUARE_CLEAR_REM = 0.25;
/** How far the seam stays off a line of text, measured square to it. */
export const TEXT_CLEAR_REM = 0.125;

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The seam's two ends, as fractions of the pane: left or bottom end first. */
export interface SeamEnds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The 30 degree line through `p`, cut to the pane.
 *
 * It rises to the right, as the equal pair's seam did. Each end lands on
 * whichever edge it meets first, so a seam low in the pane leaves through
 * the bottom edge rather than the left one.
 */
function seamThrough(w: number, h: number, p: Point): SeamEnds {
  const yAt = (x: number) => p.y + TAN_30 * (p.x - x);
  const xAt = (y: number) => p.x - (y - p.y) / TAN_30;
  const left = yAt(0) > h ? { x: xAt(h), y: h } : { x: 0, y: yAt(0) };
  const right = yAt(w) < 0 ? { x: xAt(0), y: 0 } : { x: w, y: yAt(w) };
  return { x1: left.x / w, y1: left.y / h, x2: right.x / w, y2: right.y / h };
}

/**
 * How far along the seam's normal a point sits. The seam is the set of
 * points of one depth, so a point above it has less depth and one below more.
 */
function depthOf(p: Point): number {
  return p.y + TAN_30 * p.x;
}

/**
 * The first mock's seam, from the caption anchors alone: through the
 * midpoint of the ace caption's top-left corner and the partner caption's
 * bottom-right one, and never nearer the ace than `SQUARE_CLEAR_REM`.
 */
export function anchorSeam(w: number, h: number, remPx: number, unit: number): SeamEnds {
  const pad = SHOWCASE_PAD_REM * remPx;
  const aceSize = ACE_SCALE * unit;
  const aceCaption = { x: pad, y: pad + aceSize + CAPTION_GAP_Y_REM * remPx };
  const partnerCaption = { x: w - pad - unit - CAPTION_GAP_X_REM * remPx, y: h - pad };
  const hug = { x: pad + aceSize, y: pad + aceSize + (SQUARE_CLEAR_REM * remPx) / COS_30 };
  const mid = { x: (aceCaption.x + partnerCaption.x) / 2, y: (aceCaption.y + partnerCaption.y) / 2 };
  return seamThrough(w, h, depthOf(hug) > depthOf(mid) ? hug : mid);
}

/** A box beside the seam, and how far off the seam it keeps. */
export interface Keep {
  box: Box;
  clear: number;
}

/**
 * The band the seam may run in: below every ace-side box by its clearance
 * and above every partner-side box by its. `lo > hi` means no 30 degree line
 * separates the two sides.
 */
export function seamBand(ace: readonly Keep[], partner: readonly Keep[]): { lo: number; hi: number } {
  let lo = -Infinity;
  for (const { box, clear } of ace) {
    lo = Math.max(lo, depthOf({ x: box.x + box.w, y: box.y + box.h }) + clear / COS_30);
  }
  let hi = Infinity;
  for (const { box, clear } of partner) {
    hi = Math.min(hi, depthOf({ x: box.x, y: box.y }) - clear / COS_30);
  }
  return { lo, hi };
}

/**
 * The seam through the middle of the band. Where no line separates the two
 * sides it still keeps off the ace's square (`square`, a depth), and the
 * text it crosses is the collision a reviewer sees.
 */
export function measuredSeam(w: number, h: number, band: { lo: number; hi: number }, square: number): SeamEnds {
  const mid = Number.isFinite(band.hi) ? (band.lo + band.hi) / 2 : band.lo;
  return seamThrough(w, h, { x: 0, y: Math.max(square, mid) });
}

/** The depth the seam may not rise above: the ace's square and its clearance. */
export function squareDepth(ace: Box, remPx: number): number {
  return depthOf({ x: ace.x + ace.w, y: ace.y + ace.h }) + (SQUARE_CLEAR_REM * remPx) / COS_30;
}

/**
 * The widest a partner name may run, right-aligned at `right` with its top
 * at `top`, and still sit below every seam the ace side allows (`lo`).
 */
export function partnerNameRoom(right: number, top: number, lo: number, remPx: number): number {
  const clear = (TEXT_CLEAR_REM * remPx) / COS_30;
  return Math.min(right - SHOWCASE_PAD_REM * remPx, right - (lo + clear - top) / TAN_30);
}

/**
 * How far a partner caption must slide down so a name of `natural` width
 * clears the seam: zero when it already does.
 */
export function partnerSlide(right: number, top: number, natural: number, lo: number, remPx: number): number {
  const clear = (TEXT_CLEAR_REM * remPx) / COS_30;
  return Math.max(0, lo + clear - TAN_30 * (right - natural) - top);
}
