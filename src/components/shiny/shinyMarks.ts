/**
 * The Shiny glyph, in Lucide's 24-unit box: a big four-point star at the top right and a small one at
 * the bottom left, both with a narrow waist. When on, they take the shiny look's stroke and fill.
 * When off, they are a gray outline, and Lucide's slash (`m2 2 20 20`, as in EyeOff) takes the place
 * of the big star's lower-left edge.
 */
export const SHINY_GLYPH = {
  big: 'M15.3 2.1Q15.96 8.04 21.9 8.7Q15.96 9.36 15.3 15.3Q14.64 9.36 8.7 8.7Q14.64 8.04 15.3 2.1Z',
  small: 'M6.2 13.6Q6.62 17.38 10.4 17.8Q6.62 18.22 6.2 22Q5.78 18.22 2 17.8Q5.78 17.38 6.2 13.6Z',
  bigOpen: 'M8.7 8.7Q14.64 8.04 15.3 2.1Q15.96 8.04 21.9 8.7Q15.96 9.36 15.3 15.3',
  slash: 'm2 2 20 20',
} as const;

/** How a shiny button reads. With no shiny art it is the crossed-out mark, not a control. */
export type ShinyMark = 'on' | 'off' | 'none';

/** A solid color, or gradient stops running from top-left to bottom-right. */
export type Paint = string | readonly (readonly [offset: number, color: string])[];

/** How every on-state mark is painted: the glyph's stars, the card disc, and the Shiny pill. */
export interface ShinyLook {
  /** Shown in the preview switch. */
  label: string;
  /** The stars' edges, the card disc's ring, and the pill's ring. */
  stroke: Paint;
  /** The stars' interiors. */
  starFill: Paint;
  /** The on pill's background. */
  pillFill: Paint;
  /** The on card disc's background. */
  discFill: Paint;
}

/** Cyan, yellow, magenta, with yellow held through the middle fifth. */
const HOLO: Paint = [[0, '#1FC8F2'], [0.4, '#FFC83A'], [0.6, '#FFC83A'], [1, '#E557D6']];
/** HOLO faded close to white. */
const HOLO_TINT: Paint = [[0, '#f0fbfe'], [0.45, '#fffaea'], [0.55, '#fffaea'], [1, '#fdf3fb']];

/**
 * The shiny looks under review. Production draws `gold`; a preview build can switch among them. The
 * CMY stroke alone, with no fill, was tried first and was hard to read at 16 px.
 */
export const SHINY_LOOKS = {
  gold: { label: 'Gold', stroke: '#F5B301', starFill: '#F5B301', pillFill: '#FFF6D6', discFill: '#ffffff' },
  cmy: { label: 'CMY gradient', stroke: HOLO, starFill: HOLO, pillFill: HOLO_TINT, discFill: HOLO_TINT },
  cmyWhite: { label: 'CMY, white fill', stroke: HOLO, starFill: '#ffffff', pillFill: '#ffffff', discFill: '#ffffff' },
} as const satisfies Record<string, ShinyLook>;

export type ShinyLookId = keyof typeof SHINY_LOOKS;

/** A paint as an SVG `fill` or `stroke`. A gradient becomes a reference to the `PaintGradient` with this id. */
export const svgPaint = (paint: Paint, id: string): string => (typeof paint === 'string' ? paint : `url(#${id})`);

/** A paint as a CSS background. */
export const cssPaint = (paint: Paint): string =>
  typeof paint === 'string' ? paint : `linear-gradient(to bottom right,${paint.map(([at, color]) => `${color} ${at * 100}%`).join(',')})`;

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
