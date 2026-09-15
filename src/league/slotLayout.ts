/**
 * Ace and partner sit in opposite corners. CSS places the live card.
 * This file keeps the seam and the sprite fraction the export shares.
 */

/** The seam's slope: 30°, the empty ball's own band. */
const SEAM_TAN = Math.tan(Math.PI / 6);

/**
 * Sprite edge as a share of the pane. CSS: `min(42cqw, 32cqh)`.
 *
 * Width share alone grows past the height on a squashed card (layout width
 * rises, height stays 12.75rem) and the two squares meet. Cap by height so
 * Braviary-H and Celesteela stay apart.
 */
export const SPRITE_OF_PANE_W = 0.42;
export const SPRITE_OF_PANE_H = 0.32;
export const SLOT_SPRITE_CSS = 'min(42cqw, 32cqh)';
/** Same padding on both clusters, in rem. Clears the rounded dash. */
export const SLOT_PAD_REM = 0.5;

/** Ball behind a chosen sprite, and the empty ring, as shares of the square. */
export const BALL_OF_SPRITE = 1 / 1.2;
export const RING_OF_SPRITE = 0.8 / 1.2;

/** Sprite edge, in the pane's own pixels. */
export function pairSprite(w: number, h: number): number {
  return Math.min(SPRITE_OF_PANE_W * w, SPRITE_OF_PANE_H * h);
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
