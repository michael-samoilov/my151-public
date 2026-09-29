/**
 * The live card's signature pane: the ace at twice the partner's size.
 *
 * Michael's rules for the pane:
 *
 * - The ace sits top left and the partner bottom right, the ace exactly
 *   twice the partner.
 * - Every sprite draws at a whole number of device px per source px, so no
 *   source pixel draws as a wider block than its neighbour. The card's fit
 *   zoom and the screen's dpr both set that, so the pane snaps its sprites
 *   from both, live. The exceptions are the screens `isScaleException`
 *   names.
 * - The ace's caption, ACE POKÉMON over the name, is centred under the ace.
 *   The partner's, PARTNER / SHOULDERMON over the name, sits to its left,
 *   right-aligned and centred on it. Names are in the page's text colour.
 * - The 30 degree seam runs between the two sprites. Text may cross it; the
 *   seam then shows faintly behind the text instead of breaking.
 *
 * Where the ace's caption goes is a mockup choice, `CaptionPlan`, picked
 * with `localStorage['ace-mock']`.
 *
 * The export draws its own pane from `slotLayout.ts` and is unchanged.
 */
import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';

/** The ace is this many partner sprites wide. */
export const ACE_SCALE = 2;

/** The pad between each sprite and the pane's edge. */
export const SHOWCASE_PAD_REM = 0.25;

/** The room between a sprite and a caption beside it. */
export const CAPTION_GAP_X_REM = 0.1875;

/**
 * The room between a sprite and a caption under or over it: a single pixel.
 * The ball's own inset is the visible gap.
 */
export const CAPTION_GAP_Y_REM = 0.0625;

/** A caption's line height, in em of its type. */
export const CAPTION_LEADING = 1.4;

/**
 * The caption type, which gives way on a narrow pane.
 *
 * Measured in the caption face (Inter 800): SHOULDERMON is 8.83em at full
 * tracking and 7.95em untracked. The widest name in any shipped locale is
 * MANGUSPEKTOR (German Gumshoos), 8.94em. Where the room is short the size
 * comes down from the card's 0.53125rem to the 0.4rem floor the TM and
 * badge labels already use, and below the floor the heading's tracking
 * gives way too, as theirs does.
 */
const CAPTION_WIDEST_EM = 8.9;
const SHOULDERMON_EM = 7.96;
const SHOULDERMON_LETTERS = 11;
export const CAPTION_MAX_REM = 0.53125;
export const CAPTION_MIN_REM = 0.4;

const GAPS_REM = 2 * SHOWCASE_PAD_REM + CAPTION_GAP_X_REM;
/** The partner's room beside its sprite. */
const PARTNER_ROOM = `(100cqw - ${GAPS_REM}rem - var(--slot-unit))`;

/** The pane's caption face, set by the partner's room beside its sprite. */
export const PANE_FACE = {
  size: `clamp(${CAPTION_MIN_REM}rem, ${PARTNER_ROOM} / ${CAPTION_WIDEST_EM}, ${CAPTION_MAX_REM}rem)`,
  track: `clamp(0rem, (${PARTNER_ROOM} - ${SHOULDERMON_EM} * var(--cap-size)) / ${SHOULDERMON_LETTERS}, 0.08em)`,
};

/**
 * How much of its strength the seam keeps where it passes behind a
 * caption's text box. Each text box wears the pane's colour at the rest.
 */
export const SEAM_BEHIND_TEXT = 0.35;

const TAN_30 = Math.tan(Math.PI / 6);
const COS_30 = Math.cos(Math.PI / 6);

/** How far the seam stays off each sprite's square, measured square to it. */
export const SQUARE_CLEAR_REM = 0.25;

/** Where the ace's caption goes. The partner's is the same in every plan. */
export interface CaptionPlan {
  /**
   * `under` the ace and centred on it, ACE POKÉMON over the name; or
   * `around` it, ACE POKÉMON over the ace and the name under it.
   */
  ace: 'under' | 'around';
}

export const PLANS = {
  center: { ace: 'under' },
  centersplit: { ace: 'around' },
} as const satisfies Record<string, CaptionPlan>;

export type PlanName = keyof typeof PLANS;
export const DEFAULT_PLAN: PlanName = 'center';

export function isPlanName(value: unknown): value is PlanName {
  return typeof value === 'string' && Object.hasOwn(PLANS, value);
}

/**
 * The largest partner edge, in pane px, that keeps the layout: the ace,
 * twice it, sits between the pads; the ace, its caption lines and the
 * partner stack down the pane without meeting; and a 30 degree seam passes
 * between the two squares, clear of each.
 */
function largestUnit(w: number, h: number, remPx: number, plan: CaptionPlan): number {
  const pad = SHOWCASE_PAD_REM * remPx;
  const line = CAPTION_LEADING * CAPTION_MAX_REM * remPx;
  const gap = CAPTION_GAP_Y_REM * remPx;
  // The ace's caption takes two lines under it, or one over and one under.
  const captions = 2 * line + (plan.ace === 'around' ? 2 * gap : gap);
  const aceTop = pad + (plan.ace === 'around' ? line + gap : 0);
  // The ace's lower right corner and the partner's upper left one, a seam's
  // clearance on each side of the line: linear in the edge, so solved here.
  const clear = (2 * SQUARE_CLEAR_REM * remPx) / COS_30;
  const seam = (h - pad - aceTop + TAN_30 * (w - 2 * pad) - clear) / ((ACE_SCALE + 1) * (1 + TAN_30));
  return Math.min((w - 2 * pad) / ACE_SCALE, (h - 2 * pad - captions) / (ACE_SCALE + 1), seam);
}

/**
 * The screens that break the whole-scale rule: those where even a partner
 * at 1 device px per source px does not fit the layout.
 *
 * Michael's rule is a whole number of device px per source px wherever
 * possible, with exceptions only for pathological displays. Measured on
 * the card, those are a 1x desktop (1280x800 at dpr 1: a 1x partner is 96
 * screen px and its ace 192, in a pane 148 screen px wide) and a phone
 * whose card zooms out or lays out narrow (320x568 at dpr 2, and 320x844
 * at dpr 1). Every other size tested fits k = 1 or more.
 */
export function isScaleException(w: number, h: number, remPx: number, devicePerPx: number, plan: CaptionPlan): boolean {
  return (largestUnit(w, h, remPx, plan) * devicePerPx) / SPRITE_NATIVE < 1;
}

/** How the pane draws its pair on one screen. */
export interface PairScale {
  /** The partner's edge, in pane px. The ace's is `ACE_SCALE` times it. */
  unit: number;
  /** Device px per source px, for the partner. The ace's is twice it. */
  k: number;
  /**
   * `whole`: both sprites at whole scales. `exception`: the pair at the
   * largest size that fits, drawn by production's rule for the screen.
   */
  mode: 'whole' | 'exception';
}

/**
 * The pair's size, from the pane's size and how many device px one pane px
 * paints (`dpr` times the card's zoom): the largest whole scale that fits,
 * or, on an exception screen, the largest size that fits.
 */
export function pairScale(
  w: number, h: number, remPx: number, devicePerPx: number, plan: CaptionPlan, cellRem: number,
): PairScale {
  // Before the pane is measured, the team cell stands in.
  if (w < 8 || h < 8 || devicePerPx <= 0) return { unit: cellRem * remPx, k: 1, mode: 'exception' };
  const room = largestUnit(w, h, remPx, plan);
  if (isScaleException(w, h, remPx, devicePerPx, plan)) {
    return { unit: room, k: (room * devicePerPx) / SPRITE_NATIVE, mode: 'exception' };
  }
  const k = Math.floor((room * devicePerPx) / SPRITE_NATIVE);
  return { unit: (k * SPRITE_NATIVE) / devicePerPx, k, mode: 'whole' };
}


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
 * The seam between the two sprites: the 30 degree line halfway between the
 * ace's lower right corner and the partner's upper left one, measured along
 * the seam's normal. Captions do not move it.
 */
export function seamBetween(w: number, h: number, ace: Box, partner: Box, remPx: number): SeamEnds {
  const clear = (SQUARE_CLEAR_REM * remPx) / COS_30;
  const lo = ace.y + ace.h + TAN_30 * (ace.x + ace.w) + clear;
  const hi = partner.y + TAN_30 * partner.x - clear;
  return seamThrough(w, h, { x: 0, y: Math.max(lo, (lo + hi) / 2) });
}
