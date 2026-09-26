import { describe, expect, it } from 'vitest';
import {
  SPRITE_NATIVE,
  exportSurveySpriteScale,
  isIntegerSpriteScale,
  pixelPerfectCssPx,
} from './usePixelPerfectSprite';

describe('exportSurveySpriteScale', () => {
  it('uses 2× on a 390 phone and an integer desktop scale', () => {
    expect(exportSurveySpriteScale({ viewportWidth: 390, dpr: 3 })).toBe(2);
    expect(exportSurveySpriteScale({ viewportWidth: 390, dpr: 1 })).toBe(2);
    expect(exportSurveySpriteScale({ viewportWidth: 1280, dpr: 1 })).toBe(1);
    expect(exportSurveySpriteScale({ viewportWidth: 1280, dpr: 2 })).toBe(2);
    const desktopCss = pixelPerfectCssPx(2, 2);
    expect(desktopCss).toBe(SPRITE_NATIVE);
    expect(isIntegerSpriteScale(desktopCss * 2)).toBe(true);
  });

  it('stays 1× when 2× would overflow a tiny viewport', () => {
    expect(exportSurveySpriteScale({ viewportWidth: 200, dpr: 1 })).toBe(1);
  });
});
