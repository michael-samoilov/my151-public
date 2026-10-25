/** The mark of a shiny pick: a filled four-point star, gold with a white rim, in a 24-unit box. */
export const SHINY_STAR = {
  path: 'M12 1.5 L14.6 9.4 L22.5 12 L14.6 14.6 L12 22.5 L9.4 14.6 L1.5 12 L9.4 9.4 Z',
  fill: '#F5B301',
  rim: '#ffffff',
  rimWidth: 2.6,
} as const;

/** Paints the star in the `size` px square whose top-left corner is (x, y). */
export function drawShinyStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const star = new Path2D(SHINY_STAR.path);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineJoin = 'round';
  ctx.lineWidth = SHINY_STAR.rimWidth;
  ctx.strokeStyle = SHINY_STAR.rim;
  ctx.stroke(star);
  ctx.fillStyle = SHINY_STAR.fill;
  ctx.fill(star);
  ctx.restore();
}

/**
 * How a Pokémon with no shiny looks while the Shiny switch is on: its normal
 * sprite, faded to gray, under a crossed-out sparkle. Michael may still pick
 * another look, so all of it is here. `placement` 'badge' puts a small disc
 * at the sprite's top-left; 'center' puts a larger glyph over the sprite.
 */
export const NO_SHINY = {
  sprite: { filter: 'grayscale(1)', opacity: 0.45 },
  placement: 'badge' as 'badge' | 'center',
  ink: '#64748b',
  disc: '#ffffff',
  ring: '0 0 0 1px rgba(15,23,42,0.22)',
} as const;
