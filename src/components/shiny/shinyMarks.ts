/**
 * The Shiny glyph, in Lucide's 24-unit box: a big four-point star at the top right and a small one at
 * the bottom left, both with a narrow waist. When on, the stars are solid yellow. When off, they are a
 * gray outline, and Lucide's slash (`m2 2 20 20`, as in EyeOff) takes the place of the big star's
 * lower-left edge.
 */
export const SHINY_GLYPH = {
  big: 'M15.3 2.1Q15.96 8.04 21.9 8.7Q15.96 9.36 15.3 15.3Q14.64 9.36 8.7 8.7Q14.64 8.04 15.3 2.1Z',
  small: 'M6.2 13.6Q6.62 17.38 10.4 17.8Q6.62 18.22 6.2 22Q5.78 18.22 2 17.8Q5.78 17.38 6.2 13.6Z',
  bigOpen: 'M8.7 8.7Q14.64 8.04 15.3 2.1Q15.96 8.04 21.9 8.7Q15.96 9.36 15.3 15.3',
  slash: 'm2 2 20 20',
} as const;

/** How a shiny button reads. With no shiny art it is the crossed-out mark, not a control. */
export type ShinyMark = 'on' | 'off' | 'none';

/**
 * The Shiny on state: solid yellow stars, edge and fill one colour, inside a gold ring (the pill's
 * border, the card disc's ring) over a pale yellow pill. A cyan, yellow, and magenta stroke was tried
 * first and was hard to read at 16px.
 */
export const SHINY_ON = { star: '#FFC83A', ring: '#F5B301', pillFill: '#FFF6D6' } as const;

/** The mark of a shiny pick: a four-point star with a narrow waist, yellow to orange, with a white rim, in a 24-unit box. */
export const SHINY_STAR = {
  path: 'M12 1.4Q12.848 11.152 22.6 12Q12.848 12.848 12 22.6Q11.152 12.848 1.4 12Q11.152 11.152 12 1.4Z',
  fill: { from: [6, 3], to: [18, 21], stops: [[0, '#FFD84D'], [1, '#F59E0B']] },
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
  const fill = ctx.createLinearGradient(...SHINY_STAR.fill.from, ...SHINY_STAR.fill.to);
  for (const [at, color] of SHINY_STAR.fill.stops) fill.addColorStop(at, color);
  ctx.fillStyle = fill;
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
  ring: 'rgba(15,23,42,0.22)',
} as const;
