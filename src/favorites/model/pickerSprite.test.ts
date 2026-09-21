import { describe, expect, it } from 'vitest';
import { tileImageCssPx } from '@/lib/tileImage';
import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';
import { pickerSpriteCssPx } from './pickerSprite';

describe('pickerSpriteCssPx', () => {
  it('uses the dex six-column image on a phone, not a 1× bitmap', () => {
    expect(tileImageCssPx(390)).toBe(62);
    expect(pickerSpriteCssPx(3, 390)).toBe(64);
    expect(pickerSpriteCssPx(3, 390)).not.toBe(32);
    expect(pickerSpriteCssPx(2, 390)).toBe(62);
    expect(pickerSpriteCssPx(1, 390)).toBe(62);
  });

  it('uses the dex image on desktop, which is already one bitmap at 1×', () => {
    expect(tileImageCssPx(1280)).toBe(96);
    expect(pickerSpriteCssPx(1, 1280)).toBe(96);
    expect(pickerSpriteCssPx(2, 1280)).toBe(96);
    expect(pickerSpriteCssPx(3, 1280)).toBe(96);
  });

  it('snaps up only when the bitmap scale stays within 4% of the dex size', () => {
    expect(tileImageCssPx(412)).toBe(66);
    expect(pickerSpriteCssPx(2.625, 412)).toBe(66);
    const crisp = pickerSpriteCssPx(3, 390);
    expect(crisp * 3).toBe(2 * SPRITE_NATIVE);
  });

  it('never paints a sprite smaller than the dex six-column image', () => {
    for (const width of [320, 390, 412, 768, 1024, 1280, 1440]) {
      const dex = tileImageCssPx(width);
      for (const dpr of [1, 1.25, 2, 2.625, 3]) {
        expect(pickerSpriteCssPx(dpr, width), `${width} @ ${dpr}`).toBeGreaterThanOrEqual(dex);
      }
    }
  });
});
