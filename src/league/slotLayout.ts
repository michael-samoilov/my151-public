/**
 * The sprite sizes the live card and the export share: the team rem, the
 * ball and ring behind a chosen Pokémon, and the one-Pokémon showcase size
 * the export draws.
 */

/**
 * Team-cell rem. Ace/partner are 1×, 2×, or 3× of this so the card's fit
 * zoom paints them at n×96, the same integer scale as the team sprites.
 */
export const SPRITE_REM = 3.25;

export type SpriteScale = 1 | 2 | 3;

/** Same padding on both clusters, in rem. Clears the rounded dash. */
export const SLOT_PAD_REM = 0.5;

/**
 * The heading box a lone sprite leaves room for. Matches HEAD_CLASS
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
