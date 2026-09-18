/**
 * Lighting recipe for the export preview foil.
 *
 * One record drives both the live overlay and the preview-only workshop.
 * Layers are a closed set; unknown ids from a URL or localStorage drop out
 * at parse time. Amount is 0–1. Off still keeps the stored amount so a
 * workshop toggle can come back without losing the slider.
 */

export const FOIL_LAYER_IDS = [
  'pointLight',
  'ambient',
  'specular',
  'rim',
  'holographic',
  'iridescence',
  'emboss',
  'parallax',
  'sparkle',
  'bloom',
] as const;

export type FoilLayerId = (typeof FOIL_LAYER_IDS)[number];

export type FoilLayer = {
  on: boolean;
  amount: number;
};

export type FoilRecipe = {
  idleTilt: number;
  idleMsX: number;
  idleMsY: number;
  deadDeg: number;
  maxTilt: number;
  parallaxPx: number;
  bloomBlurPx: number;
  specSize: number;
  layers: Record<FoilLayerId, FoilLayer>;
};

export const FOIL_LAYER_META = {
  pointLight: {
    title: 'Point light',
    blurb: 'Soft disc at the tilt. Lights the paper and the print.',
  },
  ambient: {
    title: 'Ambient / diffuse',
    blurb: 'Broad fill plus a shadow opposite the light.',
  },
  specular: {
    title: 'Specular hotspot',
    blurb: 'Tight highlight, masked to glossy color.',
  },
  rim: {
    title: 'Rim lighting',
    blurb: 'Edge glow opposite the light, masked to ridges.',
  },
  holographic: {
    title: 'Foil / holographic sheen',
    blurb: 'Rainbow sheen on saturated ink, not on the white paper.',
  },
  iridescence: {
    title: 'Iridescence / color shift',
    blurb: 'Hue of colored surfaces shifts with the tilt.',
  },
  emboss: {
    title: 'Surface texture / embossing',
    blurb: 'Ridge lighting from an edge map of the export.',
  },
  parallax: {
    title: 'Parallax',
    blurb: 'Colored ink slides a few pixels above the paper.',
  },
  sparkle: {
    title: 'Specular glints / sparkles',
    blurb: 'Tiny glints on glossy and ridged pixels.',
  },
  bloom: {
    title: 'Bloom / glow',
    blurb: 'Blurred copy of the hotspot.',
  },
} as const satisfies Record<FoilLayerId, { title: string; blurb: string }>;

export const FOIL_WORKSHOP_STORAGE_KEY = 'my151-foil-workshop-recipe';

const DEFAULT_LAYERS: Record<FoilLayerId, FoilLayer> = {
  pointLight: { on: true, amount: 1 },
  ambient: { on: false, amount: 0 },
  specular: { on: false, amount: 0 },
  rim: { on: false, amount: 0 },
  holographic: { on: true, amount: 0.75 },
  iridescence: { on: true, amount: 0.15 },
  emboss: { on: false, amount: 0 },
  parallax: { on: false, amount: 0 },
  sparkle: { on: true, amount: 0.52 },
  bloom: { on: false, amount: 0.36 },
};

/** Live overlay default. Idle matches production league export on my151.app. */
export const DEFAULT_FOIL_RECIPE: FoilRecipe = {
  idleTilt: 10,
  idleMsX: 14000,
  idleMsY: 14000,
  deadDeg: 3,
  maxTilt: 20,
  parallaxPx: 0,
  bloomBlurPx: 34,
  specSize: 0.5,
  layers: DEFAULT_LAYERS,
};

const SAT_MASK_LAYERS: readonly FoilLayerId[] = ['holographic', 'iridescence', 'parallax'];
const EDGE_MASK_LAYERS: readonly FoilLayerId[] = ['emboss', 'rim'];
const GLOSS_MASK_LAYERS: readonly FoilLayerId[] = ['specular', 'sparkle', 'bloom'];

export type FoilMapNeed = {
  sat: boolean;
  edge: boolean;
  gloss: boolean;
};

export function isFoilLayerId(value: unknown): value is FoilLayerId {
  return typeof value === 'string' && (FOIL_LAYER_IDS as readonly string[]).includes(value);
}

export function cloneFoilRecipe(recipe: FoilRecipe): FoilRecipe {
  const layers = {} as Record<FoilLayerId, FoilLayer>;
  for (const id of FOIL_LAYER_IDS) {
    layers[id] = { ...recipe.layers[id] };
  }
  return { ...recipe, layers };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' ? clamp(value, min, max) : fallback;
}

function readLayer(value: unknown, fallback: FoilLayer): FoilLayer {
  if (typeof value !== 'object' || value === null) return { ...fallback };
  const rec = value as Record<string, unknown>;
  const amount = readNumber(rec.amount, fallback.amount, 0, 1);
  const on = typeof rec.on === 'boolean' ? rec.on : fallback.on;
  return { on, amount };
}

/** Parse untrusted JSON / URL / localStorage into a complete recipe. */
export function parseFoilRecipe(input: unknown): FoilRecipe {
  const base = cloneFoilRecipe(DEFAULT_FOIL_RECIPE);
  if (typeof input !== 'object' || input === null) return base;
  const rec = input as Record<string, unknown>;
  const layers = { ...base.layers };
  if (typeof rec.layers === 'object' && rec.layers !== null) {
    const rawLayers = rec.layers as Record<string, unknown>;
    for (const id of FOIL_LAYER_IDS) {
      layers[id] = readLayer(rawLayers[id], base.layers[id]);
    }
  }
  return {
    idleTilt: readNumber(rec.idleTilt, base.idleTilt, 0, 30),
    idleMsX: readNumber(rec.idleMsX, base.idleMsX, 2000, 40000),
    idleMsY: readNumber(rec.idleMsY, base.idleMsY, 2000, 40000),
    deadDeg: readNumber(rec.deadDeg, base.deadDeg, 0, 15),
    maxTilt: readNumber(rec.maxTilt, base.maxTilt, 8, 35),
    parallaxPx: readNumber(rec.parallaxPx, base.parallaxPx, 0, 24),
    bloomBlurPx: readNumber(rec.bloomBlurPx, base.bloomBlurPx, 0, 40),
    specSize: readNumber(rec.specSize, base.specSize, 0.08, 0.8),
    layers,
  };
}

export function parseFoilRecipeFromSearch(search: string): FoilRecipe {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('r');
  if (!raw) return cloneFoilRecipe(DEFAULT_FOIL_RECIPE);
  try {
    return parseFoilRecipe(JSON.parse(raw) as unknown);
  } catch {
    return cloneFoilRecipe(DEFAULT_FOIL_RECIPE);
  }
}

export function foilRecipeSearch(recipe: FoilRecipe): string {
  return `r=${encodeURIComponent(JSON.stringify(recipe))}`;
}

export function foilLayerAmount(recipe: FoilRecipe, id: FoilLayerId): number {
  const layer = recipe.layers[id];
  return layer.on ? layer.amount : 0;
}

export function activeFoilLayerIds(recipe: FoilRecipe): FoilLayerId[] {
  return FOIL_LAYER_IDS.filter((id) => foilLayerAmount(recipe, id) > 0);
}

export function foilMapsNeeded(recipe: FoilRecipe): FoilMapNeed {
  const on = (ids: readonly FoilLayerId[]) => ids.some((id) => foilLayerAmount(recipe, id) > 0);
  return {
    sat: on(SAT_MASK_LAYERS),
    edge: on(EDGE_MASK_LAYERS),
    gloss: on(GLOSS_MASK_LAYERS),
  };
}

/** CSS custom properties the preview card reads each frame. */
export function foilRecipeCssVars(recipe: FoilRecipe): Record<string, string> {
  const vars: Record<string, string> = {
    '--foil-parallax-px': `${recipe.parallaxPx}px`,
    '--foil-bloom-blur': `${recipe.bloomBlurPx}px`,
    '--foil-spec-size': recipe.specSize.toFixed(3),
  };
  for (const id of FOIL_LAYER_IDS) {
    vars[`--foil-${id}`] = foilLayerAmount(recipe, id).toFixed(3);
  }
  return vars;
}

export function foilLayerClassName(id: FoilLayerId): string {
  return `export-foil-${id.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
}

export function withFoilLayer(
  recipe: FoilRecipe,
  id: FoilLayerId,
  patch: Partial<FoilLayer>,
): FoilRecipe {
  const next = cloneFoilRecipe(recipe);
  next.layers[id] = { ...next.layers[id], ...patch };
  if (patch.amount !== undefined) {
    next.layers[id].amount = clamp(patch.amount, 0, 1);
  }
  return next;
}

export function recipeWithSolo(recipe: FoilRecipe, solo: FoilLayerId | null): FoilRecipe {
  if (solo === null) return recipe;
  const next = cloneFoilRecipe(recipe);
  for (const id of FOIL_LAYER_IDS) {
    next.layers[id] = { ...next.layers[id], on: id === solo };
  }
  return next;
}
