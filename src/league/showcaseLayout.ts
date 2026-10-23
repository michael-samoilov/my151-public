export const ACE_SCALE = 2;

export const SHOWCASE_PAD_REM = 0.25;

export const CAPTION_GAP_X_REM = 0.1875;

export const CAPTION_GAP_Y_REM = 0.0625;

export const CAPTION_LEADING = 1.4;

const CAPTION_WIDEST_EM = 8.9;
const CAPTION_MAX_REM = 0.53125;
export const CAPTION_MIN_REM = 0.4;
const CAPTION_TRACK_EM = 0.08;

const GAPS_REM = 2 * SHOWCASE_PAD_REM + CAPTION_GAP_X_REM;
const PARTNER_ROOM = `(100cqw - ${GAPS_REM}rem - var(--slot-unit))`;

export interface HeadLine {
  width: number;
  letters: number;
  room: number;
}

export interface HeadFace {
  size: number;
  track: number;
}

export function fitHeadings(lines: readonly HeadLine[], cap: number): HeadFace {
  let size = Infinity;
  let track = CAPTION_TRACK_EM * cap;
  for (const line of lines) {
    if (line.width > 0) size = Math.min(size, (cap * line.room) / line.width);
    if (line.letters > 0) track = Math.min(track, (line.room - line.width) / line.letters);
  }
  return { size, track: Math.max(0, track) };
}

export function paneFace(head: HeadFace | null): { size: string; track: string } {
  const room = `${PARTNER_ROOM} / ${CAPTION_WIDEST_EM}`;
  const size = head && Number.isFinite(head.size) ? `min(${room}, ${head.size}px)` : room;
  return {
    size: `clamp(${CAPTION_MIN_REM}rem, ${size}, ${CAPTION_MAX_REM}rem)`,
    track: head ? `clamp(0px, ${head.track}px, ${CAPTION_TRACK_EM}em)` : `${CAPTION_TRACK_EM}em`,
  };
}

export const CAPTION_HALO = Array.from({ length: 8 }, (_, i) => {
  const turn = (i * Math.PI) / 4;
  const [x, y] = [Math.cos(turn), Math.sin(turn)].map((v) => (0.15 * v).toFixed(3));
  return `${x}em ${y}em 0.05em color-mix(in srgb, var(--lg-slot) 25%, transparent)`;
}).join(', ');

const TAN_30 = Math.tan(Math.PI / 6);
const COS_30 = Math.cos(Math.PI / 6);

const SQUARE_CLEAR_REM = 0.25;

export interface CardGridRem {
  row: number;
  insetX: number;
  insetY: number;
  padX: number;
  sprite: number;
}

interface Square {
  cx: number;
  cy: number;
  size: number;
}

export function showcaseSquares(w: number, remPx: number, grid: CardGridRem): { ace: Square; partner: Square } {
  const insetX = grid.insetX * remPx;
  const insetY = grid.insetY * remPx;
  const col = (w + 2 * insetX) / 3;
  const row = grid.row * remPx;
  const unit = grid.sprite * remPx;
  const size = ACE_SCALE * unit;
  const cardEdge = -(grid.insetX + grid.padX) * remPx;
  return {
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

export interface SeamEnds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function seamThrough(w: number, h: number, p: Point): SeamEnds {
  const yAt = (x: number) => p.y + TAN_30 * (p.x - x);
  const xAt = (y: number) => p.x - (y - p.y) / TAN_30;
  const left = yAt(0) > h ? { x: xAt(h), y: h } : { x: 0, y: yAt(0) };
  const right = yAt(w) < 0 ? { x: xAt(0), y: 0 } : { x: w, y: yAt(w) };
  return { x1: left.x / w, y1: left.y / h, x2: right.x / w, y2: right.y / h };
}

export function seamBetween(w: number, h: number, ace: Box, partner: Box, remPx: number): SeamEnds {
  const clear = (SQUARE_CLEAR_REM * remPx) / COS_30;
  const lo = ace.y + ace.h + TAN_30 * (ace.x + ace.w) + clear;
  const hi = partner.y + TAN_30 * partner.x - clear;
  return seamThrough(w, h, { x: 0, y: Math.max(lo, (lo + hi) / 2) });
}
