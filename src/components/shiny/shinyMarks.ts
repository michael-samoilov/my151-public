/**
 * The Shiny glyph, in Lucide's 24-unit box: a big four-point star at the bottom left and a small one at
 * the top right, as the newer games draw the shiny sparkle, both with a narrow waist. When on, the stars
 * are solid yellow. When off, they are a gray outline, and Lucide's slash (`m2 2 20 20`, as in EyeOff)
 * takes the place of the big star's upper-right edge, which lies on the slash.
 */
export const SHINY_GLYPH = {
  big: 'M8.7 21.9Q8.04 15.96 2.1 15.3Q8.04 14.64 8.7 8.7Q9.36 14.64 15.3 15.3Q9.36 15.96 8.7 21.9Z',
  small: 'M17.8 10.4Q17.38 6.62 13.6 6.2Q17.38 5.78 17.8 2Q18.22 5.78 22 6.2Q18.22 6.62 17.8 10.4Z',
  bigOpen: 'M15.3 15.3Q9.36 15.96 8.7 21.9Q8.04 15.96 2.1 15.3Q8.04 14.64 8.7 8.7',
  slash: 'm2 2 20 20',
} as const;

/** How a shiny button reads. With no shiny art it is the crossed-out mark, not a control. */
export type ShinyMark = 'on' | 'off' | 'none';

/**
 * The Shiny on state: one gold for the stars' edge and fill, the card disc's ring, and the pill's
 * border, over a pale yellow pill. A cyan, yellow, and magenta stroke was tried first and was hard
 * to read at 16px.
 */
export const SHINY_ON = { color: '#F5B301', pillFill: '#FFF6D6' } as const;

/** The mark of a shiny pick: a four-point star with a narrow waist, yellow to orange, with a white rim, in a 24-unit box. */
export const SHINY_STAR = {
  path: 'M12 1.4Q12.848 11.152 22.6 12Q12.848 12.848 12 22.6Q11.152 12.848 1.4 12Q11.152 11.152 12 1.4Z',
  fill: { from: [6, 3], to: [18, 21], stops: [[0, '#FFD84D'], [1, '#F59E0B']] },
  rim: '#ffffff',
  rimWidth: 2.6,
} as const;

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
