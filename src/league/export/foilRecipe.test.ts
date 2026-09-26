import { describe, expect, it } from 'vitest';
import { DEFAULT_FOIL_RECIPE, parseFoilRecipe } from './foilRecipe';

describe('foil recipe', () => {
  it('drops unknown keys and clamps amounts at the parse boundary', () => {
    const parsed = parseFoilRecipe({
      idleTilt: 99,
      extra: true,
      layers: {
        holographic: { on: false, amount: 4 },
        sparkle: { on: true, amount: 1 },
        rainbow: { on: true, amount: 1 },
      },
    });
    expect(parsed.idleTilt).toBe(30);
    expect(parsed.layers.holographic).toEqual({ on: false, amount: 1 });
    expect(parsed.layers.pointLight).toEqual(DEFAULT_FOIL_RECIPE.layers.pointLight);
    expect('sparkle' in parsed.layers).toBe(false);
    expect('rainbow' in parsed.layers).toBe(false);
  });
});
