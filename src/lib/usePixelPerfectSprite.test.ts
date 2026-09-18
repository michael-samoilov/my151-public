import { describe, expect, it } from 'vitest';
import {
  SPRITE_NATIVE,
  isIntegerSpriteScale,
  pixelPerfectCssPx,
} from './usePixelPerfectSprite';

describe('pixelPerfectCssPx', () => {
  it('snaps below 1× up to native and accepts 3×', () => {
    expect(pixelPerfectCssPx(0.4, 1)).toBe(SPRITE_NATIVE);
    expect(pixelPerfectCssPx(3, 1)).toBe(3 * SPRITE_NATIVE);
    expect(pixelPerfectCssPx(1, 2)).toBe(48);
  });
});

describe('isIntegerSpriteScale', () => {
  it('accepts 1× and 2× device pixels and rejects a 1.25× rem size', () => {
    expect(isIntegerSpriteScale(96)).toBe(true);
    expect(isIntegerSpriteScale(192)).toBe(true);
    expect(isIntegerSpriteScale(48)).toBe(false);
    expect(isIntegerSpriteScale(120)).toBe(false);
  });
});
