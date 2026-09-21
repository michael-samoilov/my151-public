import { describe, expect, it } from 'vitest';
import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';
import { pickerSpriteCssPx } from './pickerSprite';

describe('pickerSpriteCssPx', () => {
  it('makes css px times dpr an integer multiple of the native bitmap', () => {
    for (const dpr of [1, 2, 3, 2.625, 1.25]) {
      const devicePx = pickerSpriteCssPx(dpr) * dpr;
      expect(devicePx / SPRITE_NATIVE, `dpr ${dpr}`).toBeCloseTo(1, 8);
    }
  });

  it('is 32 CSS px at 3× and 96 CSS px at 1×', () => {
    expect(pickerSpriteCssPx(3)).toBe(32);
    expect(pickerSpriteCssPx(1)).toBe(96);
    expect(pickerSpriteCssPx(2)).toBe(48);
  });

  it('keeps the bitmap when rounding the quotient would miss it', () => {
    const dpr = 2.625;
    const rounded = Math.round(SPRITE_NATIVE / dpr);
    expect(rounded * dpr).not.toBeCloseTo(SPRITE_NATIVE, 5);
    expect(pickerSpriteCssPx(dpr) * dpr).toBeCloseTo(SPRITE_NATIVE, 8);
  });
});
