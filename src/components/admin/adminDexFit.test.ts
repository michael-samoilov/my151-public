import { describe, expect, it } from 'vitest';
import { dexPaintWidth, dexTileSize } from './adminDexFit';

describe('adminDexFit', () => {
  it('keeps the painted dex at or under the wrap width', () => {
    const cols = 15;
    for (const width of [320, 390, 768, 1024, 1280, 1440]) {
      const tile = dexTileSize(width, cols);
      expect(dexPaintWidth(tile, cols)).toBeLessThanOrEqual(width + 0.01);
    }
  });
});
