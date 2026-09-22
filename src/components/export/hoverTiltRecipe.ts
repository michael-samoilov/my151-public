/**
 * Native hover-tilt recipe for the export preview.
 *
 * Props and CSS custom properties follow https://hover-tilt.simey.me/options/props/
 * and https://hover-tilt.simey.me/options/css/. Masks are a closed set: unknown
 * ids from a URL or localStorage drop out at parse time.
 */

export const HOVER_TILT_MASK_IDS = [
  'none',
  'typeIcon',
  'wordmark',
  'cardSparkle',
  'pokeBall',
  'dexNumber',
  'dexBorder',
] as const;

export type HoverTiltMaskId = (typeof HOVER_TILT_MASK_IDS)[number];

export const HOVER_TILT_BLEND_MODES = [
  'overlay',
  'soft-light',
  'screen',
  'color-dodge',
  'color-burn',
  'plus-lighter',
] as const;

export type HoverTiltBlendMode = (typeof HOVER_TILT_BLEND_MODES)[number];

export const HOVER_TILT_MASK_MODES = ['alpha', 'luminance'] as const;
export type HoverTiltMaskMode = (typeof HOVER_TILT_MASK_MODES)[number];

export const HOVER_TILT_MASK_COMPOSITES = ['intersect', 'add', 'subtract'] as const;
export type HoverTiltMaskComposite = (typeof HOVER_TILT_MASK_COMPOSITES)[number];

export type HoverTiltRecipe = {
  tiltFactor: number;
  tiltFactorY: number;
  scaleFactor: number;
  enterDelay: number;
  exitDelay: number;
  shadow: boolean;
  shadowBlur: number;
  blendMode: HoverTiltBlendMode;
  glareIntensity: number;
  glareHue: number;
  glareMask: HoverTiltMaskId;
  glareMaskMode: HoverTiltMaskMode;
  glareMaskComposite: HoverTiltMaskComposite;
  sparkleMask: HoverTiltMaskId;
  sparkleIntensity: number;
};

export const HOVER_TILT_MASK_META = {
  none: {
    title: 'None',
    blurb: 'Full-card glare and sparkle. No texture clip.',
  },
  typeIcon: {
    title: 'Primary type icon',
    blurb: 'Each Pokémon\'s primary-type glyph, contain-fit on its own sprite at Poké Ball size.',
  },
  wordmark: {
    title: 'my151.app wordmark',
    blurb: 'Brand wordmark tiled across the export.',
  },
  cardSparkle: {
    title: 'Pokémon-card sparkles',
    blurb: 'Fine-grain hover-tilt pokemon-cards sparkle field. Small repeating grains, not one smear.',
  },
  pokeBall: {
    title: 'Poké Ball tile',
    blurb: 'Poké Ball silhouette tiled across the card.',
  },
  dexNumber: {
    title: 'National Dex number',
    blurb: 'Each Pokémon\'s national Dex number, centered on its sprite.',
  },
  dexBorder: {
    title: 'Export frame',
    blurb: 'Trainer-card FRAME stroke. Tiled holo on the red border, not one stretched glyph.',
  },
} as const satisfies Record<HoverTiltMaskId, { title: string; blurb: string }>;

export const HOVER_TILT_WORKSHOP_STORAGE_KEY = 'my151-foil-workshop-tilt';

/** hover-tilt default `tiltFactor` (multiplier on ROTATION=10). */
export const DEFAULT_TILT_FACTOR = 1;

export const DEFAULT_HOVER_TILT_RECIPE: HoverTiltRecipe = {
  tiltFactor: DEFAULT_TILT_FACTOR,
  tiltFactorY: DEFAULT_TILT_FACTOR,
  scaleFactor: 1.15,
  enterDelay: 0,
  exitDelay: 200,
  shadow: true,
  shadowBlur: 48,
  blendMode: 'overlay',
  glareIntensity: 0.6,
  glareHue: 40,
  glareMask: 'dexBorder',
  glareMaskMode: 'alpha',
  glareMaskComposite: 'intersect',
  sparkleMask: 'cardSparkle',
  sparkleIntensity: 0.55,
};

export function isHoverTiltMaskId(value: unknown): value is HoverTiltMaskId {
  return typeof value === 'string' && (HOVER_TILT_MASK_IDS as readonly string[]).includes(value);
}

export function isHoverTiltBlendMode(value: unknown): value is HoverTiltBlendMode {
  return typeof value === 'string' && (HOVER_TILT_BLEND_MODES as readonly string[]).includes(value);
}

export function isHoverTiltMaskMode(value: unknown): value is HoverTiltMaskMode {
  return typeof value === 'string' && (HOVER_TILT_MASK_MODES as readonly string[]).includes(value);
}

export function isHoverTiltMaskComposite(value: unknown): value is HoverTiltMaskComposite {
  return typeof value === 'string' && (HOVER_TILT_MASK_COMPOSITES as readonly string[]).includes(value);
}

export function cloneHoverTiltRecipe(recipe: HoverTiltRecipe): HoverTiltRecipe {
  return { ...recipe };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' ? clamp(value, min, max) : fallback;
}

/** hover-tilt `tiltFactor` is a 0–4 multiplier. Old recipes stored edge degrees. */
function readTiltFactor(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value > 4) return clamp(value / 10, 0, 4);
  return clamp(value, 0, 4);
}

/** Parse untrusted JSON / URL / localStorage into a complete recipe. */
export function parseHoverTiltRecipe(input: unknown): HoverTiltRecipe {
  const base = cloneHoverTiltRecipe(DEFAULT_HOVER_TILT_RECIPE);
  if (typeof input !== 'object' || input === null) return base;
  const rec = input as Record<string, unknown>;
  return {
    tiltFactor: readTiltFactor(rec.tiltFactor, base.tiltFactor),
    tiltFactorY: readTiltFactor(rec.tiltFactorY, base.tiltFactorY),
    scaleFactor: readNumber(rec.scaleFactor, base.scaleFactor, 1, 1.5),
    enterDelay: readNumber(rec.enterDelay, base.enterDelay, 0, 600),
    exitDelay: readNumber(rec.exitDelay, base.exitDelay, 0, 1200),
    shadow: typeof rec.shadow === 'boolean' ? rec.shadow : base.shadow,
    shadowBlur: readNumber(rec.shadowBlur, base.shadowBlur, 0, 80),
    blendMode: isHoverTiltBlendMode(rec.blendMode) ? rec.blendMode : base.blendMode,
    glareIntensity: readNumber(rec.glareIntensity, base.glareIntensity, 0, 1),
    glareHue: readNumber(rec.glareHue, base.glareHue, 0, 360),
    glareMask: isHoverTiltMaskId(rec.glareMask) ? rec.glareMask : base.glareMask,
    glareMaskMode: isHoverTiltMaskMode(rec.glareMaskMode) ? rec.glareMaskMode : base.glareMaskMode,
    glareMaskComposite: isHoverTiltMaskComposite(rec.glareMaskComposite)
      ? rec.glareMaskComposite
      : base.glareMaskComposite,
    sparkleMask: isHoverTiltMaskId(rec.sparkleMask) ? rec.sparkleMask : base.sparkleMask,
    sparkleIntensity: readNumber(rec.sparkleIntensity, base.sparkleIntensity, 0, 1),
  };
}

export function parseHoverTiltRecipeFromSearch(search: string): HoverTiltRecipe {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('t');
  if (!raw) return cloneHoverTiltRecipe(DEFAULT_HOVER_TILT_RECIPE);
  try {
    return parseHoverTiltRecipe(JSON.parse(raw) as unknown);
  } catch {
    return cloneHoverTiltRecipe(DEFAULT_HOVER_TILT_RECIPE);
  }
}

export function hoverTiltSearch(recipe: HoverTiltRecipe): string {
  return `t=${encodeURIComponent(JSON.stringify(recipe))}`;
}

const MASK_COMPOSITE_WEBKIT: Record<HoverTiltMaskComposite, string> = {
  intersect: 'source-in',
  add: 'source-over',
  subtract: 'source-out',
};

/** Static CSS custom properties the preview card reads from the recipe. */
export function hoverTiltCssVars(recipe: HoverTiltRecipe): Record<string, string> {
  return {
    '--hover-tilt-scale': recipe.scaleFactor.toFixed(3),
    '--hover-tilt-rotation-x': `${(10 * recipe.tiltFactor).toFixed(2)}deg`,
    '--hover-tilt-rotation-y': `${(10 * recipe.tiltFactorY).toFixed(2)}deg`,
    '--hover-tilt-glare-intensity': recipe.glareIntensity.toFixed(3),
    '--hover-tilt-glare-hue': String(Math.round(recipe.glareHue)),
    '--hover-tilt-shadow-blur': String(Math.round(recipe.shadowBlur)),
    '--hover-tilt-blend-mode': recipe.blendMode,
    '--hover-tilt-sparkle-intensity': recipe.sparkleIntensity.toFixed(3),
    '--hover-tilt-mask-mode': recipe.glareMaskMode,
    '--hover-tilt-glare-mask-composite': recipe.glareMaskComposite,
    '--hover-tilt-glare-mask-composite-webkit': MASK_COMPOSITE_WEBKIT[recipe.glareMaskComposite],
  };
}

/**
 * hover-tilt `--hover-tilt-default-shadow` at one pose.
 * Offset follows `--shadow-x/y` = `nx*2-1` toward the raised edge.
 */
export function hoverTiltBoxShadow(
  recipe: HoverTiltRecipe,
  pose?: { nx: number; ny: number; opacity: number },
): string {
  if (!recipe.shadow || recipe.shadowBlur <= 0) return 'none';
  const blur = Math.round(recipe.shadowBlur);
  const nx = pose?.nx ?? 0.5;
  const ny = pose?.ny ?? 0.5;
  const opacity = pose?.opacity ?? 0;
  const sx = nx * 2 - 1;
  const sy = ny * 2 - 1;
  const o = opacity * 0.125;
  const layer = (b: number) => {
    const x = sx * b;
    const y = (sy * b) / 2 + b / 4;
    return `${x.toFixed(1)}px ${y.toFixed(1)}px ${(b / 2).toFixed(1)}px ${(-b * 0.25).toFixed(1)}px rgb(0 0 0 / ${o.toFixed(3)})`;
  };
  return `${layer(blur)}, ${layer(blur / 2)}`;
}
