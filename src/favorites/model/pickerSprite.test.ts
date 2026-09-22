import { describe, expect, it } from 'vitest';
import { tileImageCssPx } from '@/lib/tileImage';
import { pickerRowInsetPx, pickerSpriteCssPx, PICKER_INSET_MAX } from './pickerSprite';

describe('pickerSpriteCssPx', () => {
  it('uses the dex six-column image, including on a 3× phone', () => {
    expect(tileImageCssPx(390)).toBe(62);
    expect(pickerSpriteCssPx(390)).toBe(62);
    expect(pickerSpriteCssPx(390)).not.toBe(64);
    expect(pickerSpriteCssPx(390)).not.toBe(32);
  });

  it('uses the dex image on desktop', () => {
    expect(tileImageCssPx(1280)).toBe(96);
    expect(pickerSpriteCssPx(1280)).toBe(96);
  });

  it('keeps six sprites inside a phone sheet', () => {
    for (let width = 320; width < 1024; width++) {
      const sprite = pickerSpriteCssPx(width);
      const inset = pickerRowInsetPx(width, sprite);
      expect(sprite * 6 + inset * 2, `width ${width}`).toBeLessThanOrEqual(width);
      expect(sprite, `width ${width}`).toBe(tileImageCssPx(width));
    }
    expect(pickerRowInsetPx(390, 62)).toBe(PICKER_INSET_MAX);
    expect(pickerRowInsetPx(1280, 96)).toBe(PICKER_INSET_MAX);
  });
});
