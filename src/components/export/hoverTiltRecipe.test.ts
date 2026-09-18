import { describe, expect, it } from 'vitest';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { typeGlyphPath } from '@/data/type-ids';
import { getPokemonByIds } from '@/hooks/usePokemonData';
import { DEX_EXPORT_POKEBALL_R_FRAC, DEX_EXPORT_TILE } from '@/lib/dexExportLayout';
import {
  hoverTiltMaskContextFromDex,
  hoverTiltMaskCssVars,
  hoverTiltMaskPaint,
  SPARKLE_FIELD_URL,
  SPARKLE_MASK_SIZE,
  typeIconGlyphBoxes,
} from './hoverTiltMasks';
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

const WORKSHOP_SECTIONS: Record<string, number[]> = {
  starter: DEMO_DEX_SECTIONS.starter,
  'early-bug': DEMO_DEX_SECTIONS['early-bug'],
  'pikachu-clone': DEMO_DEX_SECTIONS['pikachu-clone'],
  legendary: DEMO_DEX_SECTIONS.legendary,
  mythical: DEMO_DEX_SECTIONS.mythical,
};

function workshopMaskContext() {
  return hoverTiltMaskContextFromDex(
    getPokemonByIds(Object.values(WORKSHOP_SECTIONS).flat()),
    WORKSHOP_SECTIONS,
  );
}

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
  it('paints one contain-fit type glyph per sprite, not one stretched featured glyph', () => {
    const ctx = workshopMaskContext();
    const paint = hoverTiltMaskPaint('typeIcon', ctx);
    expect(paint.size).toBe('100% 100%');
    expect(paint.repeat).toBe('no-repeat');
    expect(paint.position).toBe('0 0');
    const decoded = decodeURIComponent(paint.image);
    expect(decoded).toContain(typeGlyphPath('grass'));
    expect(decoded).toContain(typeGlyphPath('fire'));
    expect(decoded).toContain(typeGlyphPath('water'));
    expect(decoded).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(paint.image).not.toBe(`url("${typeGlyphPath('grass')}")`);
    expect(paint.size).not.toBe('28% 28%');

    const boxes = typeIconGlyphBoxes(ctx);
    expect(boxes.length).toBe(ctx.sprites.length);
    expect(boxes.length).toBeGreaterThan(8);
    const ball = DEX_EXPORT_TILE * DEX_EXPORT_POKEBALL_R_FRAC * 2;
    const turtwigLine = boxes.slice(0, 3);
    expect(turtwigLine.map((b) => b.dexNumber)).toEqual([387, 388, 389]);
    expect(new Set(turtwigLine.map((b) => b.x)).size).toBe(3);
    expect(turtwigLine[0].size).toBeCloseTo(ball);
    expect(turtwigLine[1].size).toBeCloseTo(ball);
    expect(turtwigLine.every((b) => b.type === 'grass')).toBe(true);
    expect(boxes.some((b) => b.type === 'fire')).toBe(true);
    expect(boxes.some((b) => b.type === 'water')).toBe(true);
  });

  it('tiles the my151.app wordmark', () => {
    const paint = hoverTiltMaskPaint('wordmark');
    expect(paint.image).toContain('data:image/svg+xml');
    expect(decodeURIComponent(paint.image)).toContain('my151.app');
    expect(paint.repeat).toBe('repeat');
  });

  it('uses a fine repeating pokemon-card sparkle grain', () => {
    const paint = hoverTiltMaskPaint('cardSparkle');
    expect(paint.image).toBe(SPARKLE_FIELD_URL);
    expect(paint.size).toBe(SPARKLE_MASK_SIZE);
    expect(paint.size).not.toBe('180% 180%');
    const pct = Number(paint.size.split('%')[0]);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(16);
    const decoded = decodeURIComponent(paint.image);
    const circles = decoded.match(/<circle/g) ?? [];
    expect(circles.length).toBeGreaterThan(80);
  });

  it('glues every mask to a fixed card point, not the pointer', () => {
    const ctx = workshopMaskContext();
    for (const id of HOVER_TILT_MASK_IDS) {
      const paint = hoverTiltMaskPaint(id, ctx);
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

  it('watermarks each sprite national Dex number', () => {
    const ctx = workshopMaskContext();
    const paint = hoverTiltMaskPaint('dexNumber', ctx);
    const decoded = decodeURIComponent(paint.image);
    expect(decoded).toContain('#0387');
    expect(decoded).toContain('#0255');
    expect(decoded).toContain('#0656');
    expect(paint.size).toBe('100% 100%');
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
    expect(vars['--hover-tilt-sparkle-mask-size']).toBe(SPARKLE_MASK_SIZE);
    expect(vars['--hover-tilt-sparkle-field']).toBe(SPARKLE_FIELD_URL);
  });
});
