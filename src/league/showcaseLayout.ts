/**
 * The live card's signature pane: the ace at twice the partner's size.
 *
 * The pane's rules:
 *
 * - The partner is the size of the card's other sprites, as the card draws
 *   them, and centres on the column of sprites below it (the pane's right
 *   column) in the pane's bottom row, the card's 4th.
 * - The ace is exactly twice the partner and centres on the pane's top-left
 *   2x2-cell zone.
 * - The ace's caption, ACE POKÉMON over the name, is centred under the ace.
 *   The partner's, PARTNER / SHOULDERMON over the name, sits to its left,
 *   right-aligned and centred on it. Names are in the page's text colour.
 *   Every locale words the headings its own way (`slotHeadings.ts`).
 * - The 30 degree seam runs between the two sprites. Text may cross it; the
 *   seam then fades right next to the letters instead of breaking.
 *
 * The export draws its own pane from `slotLayout.ts`.
 */
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
 * Measured in the caption face (Inter 800): the widest name in any shipped
 * locale is MANGUSPEKTOR (German Gumshoos), 8.94em. Where the room is short
 * the size comes down from the card's 0.53125rem to the 0.4rem floor the TM
 * and badge labels already use.
 *
 * The headings differ by locale, so they are measured as drawn rather than
 * named here (`fitHeadings`). Their tracking gives way first, as the TM and
 * badge labels' does, and a heading still too wide untracked brings the
 * size down with it.
 */
const CAPTION_WIDEST_EM = 8.9;
const CAPTION_MAX_REM = 0.53125;
export const CAPTION_MIN_REM = 0.4;
/** The headings' tracking where they have the room. */
const CAPTION_TRACK_EM = 0.08;

const GAPS_REM = 2 * SHOWCASE_PAD_REM + CAPTION_GAP_X_REM;
/** The partner's room beside its sprite. */
const PARTNER_ROOM = `(100cqw - ${GAPS_REM}rem - var(--slot-unit))`;

/** One heading line as drawn, in pane px. */
export interface HeadLine {
  /** The line's width untracked. */
  width: number;
  /** The characters the tracking follows, one each. */
  letters: number;
  /** The room the line may take. */
  room: number;
}

/** What the headings allow the pane's face, in px. */
export interface HeadFace {
  /** The largest caption size at which every heading line fits untracked. */
  size: number;
  /** The tracking every line fits at, at the size the lines were read at. */
  track: number;
}

/**
 * The headings' limits on the caption face, from their lines read at the
 * caption size `cap`. A line's width scales with the size, so `size` does
 * not depend on the size it was read at, and a heading that brought the
 * size down keeps it down.
 */
export function fitHeadings(lines: readonly HeadLine[], cap: number): HeadFace {
  let size = Infinity;
  let track = CAPTION_TRACK_EM * cap;
  for (const line of lines) {
    if (line.width > 0) size = Math.min(size, (cap * line.room) / line.width);
    if (line.letters > 0) track = Math.min(track, (line.room - line.width) / line.letters);
  }
  return { size, track: Math.max(0, track) };
}

/**
 * The pane's caption face. The partner's room beside its sprite sets the
 * size, and the headings, once read, can only bring it down and take the
 * tracking in.
 */
export function paneFace(head: HeadFace | null): { size: string; track: string } {
  const room = `${PARTNER_ROOM} / ${CAPTION_WIDEST_EM}`;
  const size = head && Number.isFinite(head.size) ? `min(${room}, ${head.size}px)` : room;
  return {
    size: `clamp(${CAPTION_MIN_REM}rem, ${size}, ${CAPTION_MAX_REM}rem)`,
    track: head ? `clamp(0px, ${head.track}px, ${CAPTION_TRACK_EM}em)` : `${CAPTION_TRACK_EM}em`,
  };
}

/**
 * The captions' halo: the pane's colour in a thin ring round each glyph, so
 * the seam fades where it runs right next to a letter and nowhere else.
 * Eight copies of the text, each 0.15em off in one of eight directions at a
 * quarter of the pane's colour, stack strongest against the letters.
 */
export const CAPTION_HALO = Array.from({ length: 8 }, (_, i) => {
  const turn = (i * Math.PI) / 4;
  const [x, y] = [Math.cos(turn), Math.sin(turn)].map((v) => (0.15 * v).toFixed(3));
  return `${x}em ${y}em 0.05em color-mix(in srgb, var(--lg-slot) 25%, transparent)`;
}).join(', ');

const TAN_30 = Math.tan(Math.PI / 6);
const COS_30 = Math.cos(Math.PI / 6);

/** How far the seam stays off each sprite's square, measured square to it. */
const SQUARE_CLEAR_REM = 0.25;

/** The card's grid, in rem, as the card lays it out. */
export interface CardGridRem {
  /** A row's height. */
  row: number;
  /** How far the pane sits inside its columns, and inside its rows. */
  insetX: number;
  insetY: number;
  /** The card's own pad outside the first column, which the card clips at. */
  padX: number;
  /** A cell sprite's edge. */
  sprite: number;
}

/** Where a sprite's square goes, in pane px. */
interface Square {
  cx: number;
  cy: number;
  size: number;
}

/**
 * The two squares, from the pane's width. The pane spans three of the card's
 * seven columns and four of its rows, inset by `insetX` and `insetY`, so a
 * column is a third of the pane's width plus both insets.
 *
 * The partner is one cell sprite, centred on the pane's right column and
 * bottom row, where the column of sprites below it and the card's 4th row
 * put their own centres. The ace is two, centred on the top-left 2x2 cells.
 * Both may reach a little past the pane's inset box, as the cell sprites
 * reach past their cells, but the ace never past the card's edge, which
 * clips it: on a pane too narrow for it (320px at dpr 1) it moves right just
 * far enough to stay whole.
 */
export function showcaseSquares(w: number, remPx: number, grid: CardGridRem): { ace: Square; partner: Square } {
  const insetX = grid.insetX * remPx;
  const insetY = grid.insetY * remPx;
  const col = (w + 2 * insetX) / 3;
  const row = grid.row * remPx;
  const unit = grid.sprite * remPx;
  const size = ACE_SCALE * unit;
  const cardEdge = -(grid.insetX + grid.padX) * remPx;
  return {
    // The 2x2 cells' centre is one column and one row in from the pane's
    // outer corner, which sits the insets outside the pane.
    ace: { cx: Math.max(col - insetX, cardEdge + size / 2), cy: row - insetY, size },
    partner: { cx: 2.5 * col - insetX, cy: 3.5 * row - insetY, size: unit },
  };
}

interface Point {
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
