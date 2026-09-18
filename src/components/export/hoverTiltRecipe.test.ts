import { describe, expect, it } from 'vitest';
import { typeGlyphPath } from '@/data/type-ids';
import { hoverTiltMaskCssVars, hoverTiltMaskPaint, SPARKLE_FIELD_URL } from './hoverTiltMasks';
import {
  DEFAULT_HOVER_TILT_RECIPE,
  DEFAULT_TILT_FACTOR,
  HOVER_TILT_MASK_IDS,
  hoverTiltCssVars,
  hoverTiltSearch,
  isHoverTiltMaskId,
  parseHoverTiltRecipe,
  parseHoverTiltRecipeFromSearch,
} from './hoverTiltRecipe';

describe('hover-tilt recipe', () => {
  it('names every glare/sparkle mask and rejects unknown ids', () => {
    expect(HOVER_TILT_MASK_IDS).toEqual([
      'none',
      'typeIcon',
      'wordmark',
      'cardSparkle',
      'pokeBall',
      'dexNumber',
    ]);
    expect(isHoverTiltMaskId('wordmark')).toBe(true);
    expect(isHoverTiltMaskId('rainbow')).toBe(false);
  });

  it('defaults match poke-holo tilt and keep scale at 1', () => {
    expect(DEFAULT_HOVER_TILT_RECIPE.tiltFactor).toBeCloseTo(DEFAULT_TILT_FACTOR);
    expect(DEFAULT_HOVER_TILT_RECIPE.tiltFactorY).toBeCloseTo(DEFAULT_TILT_FACTOR);
    expect(DEFAULT_HOVER_TILT_RECIPE.scaleFactor).toBe(1);
    expect(DEFAULT_HOVER_TILT_RECIPE.shadow).toBe(true);
    expect(DEFAULT_HOVER_TILT_RECIPE.glareMask).toBe('cardSparkle');
    expect(DEFAULT_HOVER_TILT_RECIPE.sparkleMask).toBe('cardSparkle');
  });

  it('drops unknown keys and clamps at the parse boundary', () => {
    const parsed = parseHoverTiltRecipe({
      tiltFactor: 99,
      scaleFactor: 0.2,
      glareMask: 'holo-foil',
      sparkleMask: 'wordmark',
      blendMode: 'multiply',
      extra: true,
    });
    expect(parsed.tiltFactor).toBe(25);
    expect(parsed.scaleFactor).toBe(1);
    expect(parsed.glareMask).toBe('cardSparkle');
    expect(parsed.sparkleMask).toBe('wordmark');
    expect(parsed.blendMode).toBe('overlay');
  });

  it('round-trips through the workshop search string', () => {
    const tuned = { ...DEFAULT_HOVER_TILT_RECIPE, glareMask: 'pokeBall' as const, glareHue: 210 };
    const again = parseHoverTiltRecipeFromSearch(`?${hoverTiltSearch(tuned)}`);
    expect(again.glareMask).toBe('pokeBall');
    expect(again.glareHue).toBe(210);
    expect(parseHoverTiltRecipeFromSearch('')).toEqual(DEFAULT_HOVER_TILT_RECIPE);
    expect(parseHoverTiltRecipeFromSearch('?t=not-json')).toEqual(DEFAULT_HOVER_TILT_RECIPE);
  });

  it('writes the documented hover-tilt CSS custom properties', () => {
    const vars = hoverTiltCssVars({
      ...DEFAULT_HOVER_TILT_RECIPE,
      glareIntensity: 0.8,
      glareHue: 200,
      scaleFactor: 1.05,
    });
    expect(vars['--hover-tilt-glare-intensity']).toBe('0.800');
    expect(vars['--hover-tilt-glare-hue']).toBe('200');
    expect(vars['--hover-tilt-scale']).toBe('1.050');
    expect(vars['--hover-tilt-blend-mode']).toBe('overlay');
  });
});

describe('hover-tilt masks', () => {
  it('paints a type glyph over the featured sprite', () => {
    const paint = hoverTiltMaskPaint('typeIcon', { type: 'grass', dexNumber: 387 });
    expect(paint.image).toBe(`url("${typeGlyphPath('grass')}")`);
    expect(paint.repeat).toBe('no-repeat');
  });

  it('tiles the my151.app wordmark', () => {
    const paint = hoverTiltMaskPaint('wordmark');
    expect(paint.image).toContain('data:image/svg+xml');
    expect(decodeURIComponent(paint.image)).toContain('my151.app');
    expect(paint.repeat).toBe('repeat');
  });

  it('uses the pokemon-card sparkle field', () => {
    const paint = hoverTiltMaskPaint('cardSparkle');
    expect(paint.image).toBe(SPARKLE_FIELD_URL);
    expect(decodeURIComponent(paint.image)).toContain('circle');
  });

  it('glues every mask to a fixed card point, not the pointer', () => {
    for (const id of HOVER_TILT_MASK_IDS) {
      const paint = hoverTiltMaskPaint(id);
      const vars = hoverTiltMaskCssVars(paint, paint);
      expect(vars['--hover-tilt-glare-mask-position'], id).not.toMatch(/pointer/);
      expect(vars['--hover-tilt-sparkle-mask-position'], id).not.toMatch(/pointer/);
      expect(vars['--hover-tilt-glare-mask-position'], id).toBe(paint.position);
    }
  });

  it('tiles a Poké Ball silhouette', () => {
    const paint = hoverTiltMaskPaint('pokeBall');
    expect(decodeURIComponent(paint.image)).toContain('circle');
    expect(paint.repeat).toBe('repeat');
  });

  it('watermarks the national Dex number', () => {
    const paint = hoverTiltMaskPaint('dexNumber', { type: 'grass', dexNumber: 387 });
    expect(decodeURIComponent(paint.image)).toContain('#0387');
    expect(paint.repeat).toBe('no-repeat');
  });

  it('applies separate glare and sparkle mask CSS vars', () => {
    const vars = hoverTiltMaskCssVars(
      hoverTiltMaskPaint('wordmark'),
      hoverTiltMaskPaint('cardSparkle'),
    );
    expect(vars['--hover-tilt-glare-mask']).toContain('svg+xml');
    expect(decodeURIComponent(vars['--hover-tilt-glare-mask'] ?? '')).toContain('my151.app');
    expect(vars['--hover-tilt-sparkle-mask']).toBe(SPARKLE_FIELD_URL);
    expect(vars['--hover-tilt-sparkle-field']).toBe(SPARKLE_FIELD_URL);
  });
});
