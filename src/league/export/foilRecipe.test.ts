import { describe, expect, it } from 'vitest';
import { DEFAULT_FOIL_RECIPE, parseFoilRecipe } from './foilRecipe';

describe('foil recipe', () => {
  it('drops unknown keys and clamps amounts at the parse boundary', () => {
    const parsed = parseFoilRecipe({
      idleTilt: 99,
      extra: true,
      layers: {
        gleam: { on: false, amount: 4 },
        // A layer that older saved recipes still carry.
        holographic: { on: true, amount: 0.7 },
        sparkle: { on: true, amount: 1 },
        rainbow: { on: true, amount: 1 },
      },
    });
    expect(parsed.idleTilt).toBe(30);
    expect(parsed.layers.gleam).toEqual({ on: false, amount: 1 });
    expect('holographic' in parsed.layers).toBe(false);
    expect(parsed.layers.pointLight).toEqual(DEFAULT_FOIL_RECIPE.layers.pointLight);
    expect('sparkle' in parsed.layers).toBe(false);
    expect('rainbow' in parsed.layers).toBe(false);
  });
});
