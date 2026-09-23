import { describe, expect, it } from 'vitest';
import { tileImageCssPx } from '@/lib/tileImage';
import { fitPickerSpriteCssPx, pickerRowInsetPx, pickerSpriteCssPx, PICKER_INSET_MAX } from './pickerSprite';

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

describe('fitPickerSpriteCssPx', () => {
  it('keeps normal lists at dex size and shrinks tall lists to the pane', () => {
    expect(fitPickerSpriteCssPx(62, 3, 600, 4)).toBe(62);
    expect(fitPickerSpriteCssPx(62, 10, 500, 4)).toBe(46);
    expect(10 * 46 + 9 * 4).toBeLessThanOrEqual(500);
  });
});
