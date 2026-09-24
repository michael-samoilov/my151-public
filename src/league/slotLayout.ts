/**
 * Ace and partner sit in opposite corners. CSS places the live card.
 * This file keeps the seam and the pair sprite size the export shares.
 */

import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';

/** The seam's slope: 30°, the empty ball's own band. */
const SEAM_TAN = Math.tan(Math.PI / 6);

export { SPRITE_NATIVE };

/**
 * Team-cell rem. Ace/partner are 1×, 2×, or 3× of this so the card's fit
 * zoom paints them at n×96, the same integer scale as the team sprites.
 */
export const SPRITE_REM = 3.25;

export type SpriteScale = 1 | 2 | 3;

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

/** CSS edge for scale n: n × 3.25 rem. After the card zoom, that is n×96. */
export function spriteEdge(n: SpriteScale, remPx: number): number {
  return n * SPRITE_REM * remPx;
}

/**
 * True when two opposite-corner squares of `sprite` CSS px do not intersect.
 * Headings sit in the flow above/below each square. Names are not part of this
 * test. 1× is always used when 2× and 3× fail; a 1× that still intersects is still 1×.
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

/** Largest of 3×, 2×, 1× whose two squares fit the pane. Never a fraction. */
export function pairSpriteScale(
  w: number,
  h: number,
  remPx: number = 16,
): SpriteScale {
  if (pairSquaresFit(w, h, spriteEdge(3, remPx), remPx)) return 3;
  if (pairSquaresFit(w, h, spriteEdge(2, remPx), remPx)) return 2;
  return 1;
}

/** Sprite edge in CSS px: `n * 3.25 * remPx`, n is 1, 2, or 3. */
export function pairSprite(
  w: number,
  h: number,
  remPx: number = 16,
): number {
  return spriteEdge(pairSpriteScale(w, h, remPx), remPx);
}

/** Room for one centered sprite: pad on all sides, heading and name in height. */
export function soloMaxEdge(w: number, h: number, remPx: number = 16): number {
  const pad = SLOT_PAD_REM * remPx;
  const headH = slotHeadPx(remPx);
  const nameH = SLOT_HEAD_REM * SLOT_HEAD_LEADING * remPx;
  return Math.min(w - 2 * pad, h - 2 * pad - headH - nameH);
}

/** Largest of 1×, 2×, 3× whose edge fits `maxEdge`. Never a fraction. */
export function soloSpriteScale(
  w: number,
  h: number,
  remPx: number = 16,
): SpriteScale {
  const maxEdge = soloMaxEdge(w, h, remPx);
  if (spriteEdge(3, remPx) <= maxEdge) return 3;
  if (spriteEdge(2, remPx) <= maxEdge) return 2;
  return 1;
}

/**
 * Largest of 1×, 2×, 3× of the team rem that still fits. 1× is the floor.
 */
export function soloSprite(
  w: number,
  h: number,
  remPx: number = 16,
): number {
  return spriteEdge(soloSpriteScale(w, h, remPx), remPx);
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
