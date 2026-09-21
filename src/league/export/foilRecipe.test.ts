import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOIL_RECIPE,
  FOIL_LAYER_IDS,
  activeFoilLayerIds,
  cloneFoilRecipe,
  foilLayerAmount,
  foilLayerClassName,
  foilMapsNeeded,
  foilRecipeCssVars,
  foilRecipeSearch,
  isFoilLayerId,
  parseFoilRecipe,
  parseFoilRecipeFromSearch,
  recipeWithSolo,
  withFoilLayer,
} from './foilRecipe';

describe('foil recipe', () => {
  it('names every lighting layer and rejects unknown ids', () => {
    expect(FOIL_LAYER_IDS).toHaveLength(10);
    expect(isFoilLayerId('holographic')).toBe(true);
    expect(isFoilLayerId('rainbow')).toBe(false);
    expect(foilLayerClassName('pointLight')).toBe('export-foil-point-light');
  });

  it('idle tilt matches production league export', () => {
    expect(DEFAULT_FOIL_RECIPE.idleTilt).toBe(10);
    expect(DEFAULT_FOIL_RECIPE.idleMsX).toBe(14000);
    expect(DEFAULT_FOIL_RECIPE.idleMsY).toBe(14000);
    expect(DEFAULT_FOIL_RECIPE.idleTilt).toBeGreaterThan(DEFAULT_FOIL_RECIPE.deadDeg);
    expect(DEFAULT_FOIL_RECIPE.maxTilt).toBe(10);
  });

  it('live default matches production foil amounts and skips the edge map', () => {
    expect(activeFoilLayerIds(DEFAULT_FOIL_RECIPE)).toEqual([
      'pointLight',
      'holographic',
      'iridescence',
      'sparkle',
      'bloom',
    ]);
    expect(foilMapsNeeded(DEFAULT_FOIL_RECIPE)).toEqual({
      sat: true,
      edge: false,
      gloss: true,
    });
    expect(DEFAULT_FOIL_RECIPE.layers.ambient.on).toBe(false);
    expect(DEFAULT_FOIL_RECIPE.layers.emboss.on).toBe(false);
    expect(DEFAULT_FOIL_RECIPE.layers.holographic.amount).toBe(0.4);
    expect(DEFAULT_FOIL_RECIPE.layers.holographic.on).toBe(true);
    expect(DEFAULT_FOIL_RECIPE.layers.iridescence.amount).toBe(0.15);
    expect(DEFAULT_FOIL_RECIPE.layers.sparkle.amount).toBe(0.52);
    expect(DEFAULT_FOIL_RECIPE.layers.bloom.on).toBe(true);
    expect(DEFAULT_FOIL_RECIPE.layers.bloom.amount).toBe(0.36);
    const withEmboss = withFoilLayer(DEFAULT_FOIL_RECIPE, 'emboss', { on: true, amount: 0.6 });
    expect(foilMapsNeeded(withEmboss).edge).toBe(true);
    const holoOnly = recipeWithSolo(DEFAULT_FOIL_RECIPE, 'holographic');
    expect(foilMapsNeeded(holoOnly)).toEqual({ sat: true, edge: false, gloss: false });
  });

  it('sat-masked multiply tints ink and the sat map keeps paper at zero', () => {
    expect(foilMapsNeeded(DEFAULT_FOIL_RECIPE).sat).toBe(true);
    expect(DEFAULT_FOIL_RECIPE.layers.holographic.amount).toBeGreaterThan(0.3);
    expect(DEFAULT_FOIL_RECIPE.layers.holographic.amount).toBeLessThan(0.7);
  });

  it('drops unknown keys and clamps amounts at the parse boundary', () => {
    const parsed = parseFoilRecipe({
      idleTilt: 99,
      extra: true,
      layers: {
        holographic: { on: false, amount: 4 },
        rainbow: { on: true, amount: 1 },
      },
    });
    expect(parsed.idleTilt).toBe(30);
    expect(parsed.layers.holographic).toEqual({ on: false, amount: 1 });
    expect(parsed.layers.pointLight).toEqual(DEFAULT_FOIL_RECIPE.layers.pointLight);
    expect('rainbow' in parsed.layers).toBe(false);
  });

  it('round-trips through the workshop search string', () => {
    const tuned = withFoilLayer(DEFAULT_FOIL_RECIPE, 'bloom', { amount: 0.9 });
    const again = parseFoilRecipeFromSearch(`?${foilRecipeSearch(tuned)}`);
    expect(again.layers.bloom.amount).toBe(0.9);
    expect(parseFoilRecipeFromSearch('')).toEqual(DEFAULT_FOIL_RECIPE);
    expect(parseFoilRecipeFromSearch('?r=not-json')).toEqual(DEFAULT_FOIL_RECIPE);
  });

  it('zeros a layer that is off and solos one layer for the workshop', () => {
    const off = withFoilLayer(DEFAULT_FOIL_RECIPE, 'sparkle', { on: false });
    expect(foilLayerAmount(off, 'sparkle')).toBe(0);
    const solo = recipeWithSolo(off, 'sparkle');
    expect(foilLayerAmount(solo, 'sparkle')).toBeGreaterThan(0);
    expect(foilLayerAmount(solo, 'bloom')).toBe(0);
  });

  it('writes a CSS variable per layer without mutating the original', () => {
    const original = cloneFoilRecipe(DEFAULT_FOIL_RECIPE);
    const vars = foilRecipeCssVars(DEFAULT_FOIL_RECIPE);
    expect(vars['--foil-holographic']).toBe(DEFAULT_FOIL_RECIPE.layers.holographic.amount.toFixed(3));
    expect(vars['--foil-bloom-blur']).toBe(`${DEFAULT_FOIL_RECIPE.bloomBlurPx}px`);
    expect(DEFAULT_FOIL_RECIPE).toEqual(original);
  });
});
