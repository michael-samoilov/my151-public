/**
 * Ace and partner sit in opposite corners. CSS places the live card.
 * This file keeps the seam and the pair sprite size the export shares.
 */

import { pixelPerfectCssPx, SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';

/** The seam's slope: 30°, the empty ball's own band. */
const SEAM_TAN = Math.tan(Math.PI / 6);

export { SPRITE_NATIVE };

/** Same padding on both clusters, in rem. Clears the rounded dash. */
export const SLOT_PAD_REM = 0.5;

/**
 * Heading box used to test whether two squares fit. Matches HEAD_CLASS
 * (`text-[0.53125rem] leading-[1.4]`, two lines) in CardGrid.
 */
export const SLOT_HEAD_REM = 0.53125;
export const SLOT_HEAD_LEADING = 1.4;
export const SLOT_HEAD_LINES = 2;

/** Ball behind a chosen sprite, and the empty ring, as shares of the square. */
export const BALL_OF_SPRITE = 1 / 1.2;
export const RING_OF_SPRITE = 0.8 / 1.2;

export function slotHeadPx(remPx: number): number {
  return SLOT_HEAD_REM * SLOT_HEAD_LEADING * SLOT_HEAD_LINES * remPx;
}

/**
 * True when two opposite-corner squares of `sprite` CSS px do not intersect.
 * Headings sit in the flow above/below each square. Names are not part of this
 * test. 1× is always used when 2× fails; a 1× that still intersects is still 1×.
 */
export function pairSquaresFit(
  w: number,
  h: number,
  sprite: number,
  remPx: number = 16,
): boolean {
  const pad = SLOT_PAD_REM * remPx;
  const headH = slotHeadPx(remPx);
  const ace = { l: pad, t: pad + headH, r: pad + sprite, b: pad + headH + sprite };
  const partner = {
    l: w - pad - sprite,
    t: h - pad - headH - sprite,
    r: w - pad,
    b: h - pad - headH,
  };
  const overlapX = Math.min(ace.r, partner.r) - Math.max(ace.l, partner.l);
  const overlapY = Math.min(ace.b, partner.b) - Math.max(ace.t, partner.t);
  return overlapX <= 0 || overlapY <= 0;
}

/** 2× when both squares fit the pane, else 1×. Never a fraction. */
export function pairSpriteScale(
  w: number,
  h: number,
  dpr: number = 1,
  remPx: number = 16,
): 1 | 2 {
  return pairSquaresFit(w, h, pixelPerfectCssPx(2, dpr), remPx) ? 2 : 1;
}

/** Sprite edge in CSS px: `n * 96 / dpr`, rounded, n is 1 or 2. */
export function pairSprite(
  w: number,
  h: number,
  dpr: number = 1,
  remPx: number = 16,
): number {
  return pixelPerfectCssPx(pairSpriteScale(w, h, dpr, remPx), dpr);
}

/** Room for one centered sprite: pad on all sides, heading and name in height. */
export function soloMaxEdge(w: number, h: number, remPx: number = 16): number {
  const pad = SLOT_PAD_REM * remPx;
  const headH = slotHeadPx(remPx);
  const nameH = SLOT_HEAD_REM * SLOT_HEAD_LEADING * remPx;
  return Math.min(w - 2 * pad, h - 2 * pad - headH - nameH);
}

/**
 * Largest integer native scale whose CSS edge fits `maxEdge`.
 * 1× is the floor. Never a fraction of the pane.
 */
export function soloSprite(
  w: number,
  h: number,
  dpr: number = 1,
  remPx: number = 16,
): number {
  const maxEdge = soloMaxEdge(w, h, remPx);
  const d = Math.max(dpr, 1);
  let n = 1;
  for (let s = 2; ; s++) {
    const css = Math.round((s * SPRITE_NATIVE) / d);
    if (css > maxEdge) break;
    n = s;
  }
  return Math.round((n * SPRITE_NATIVE) / d);
}

/**
 * Where the seam meets the slot's edges, as fractions of the slot.
 *
 * The SVG stretches a square viewBox to fill the slot, so a 30° line there
 * is not 30° on screen. These ends keep the drawn line at 30° through the
 * middle.
 */
export function seamEnds(w: number, h: number): { x1: number; y1: number; x2: number; y2: number } {
  const dy = (SEAM_TAN * w) / 2;
  if (h / 2 + dy <= h) {
    return { x1: 0, y1: (h / 2 + dy) / h, x2: 1, y2: (h / 2 - dy) / h };
  }
  const dx = h / 2 / SEAM_TAN;
  return { x1: (w / 2 - dx) / w, y1: 1, x2: (w / 2 + dx) / w, y2: 0 };
}
