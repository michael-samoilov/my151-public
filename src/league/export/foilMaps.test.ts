import { describe, expect, it } from 'vitest';
import { deriveFoilMaps, type RgbaBitmap } from './foilMaps';

function bitmap(width: number, height: number, pixels: number[][]): RgbaBitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    const px = pixels[i]!;
    data.set(px, i * 4);
  }
  return { width, height, data };
}

function alphaAt(map: RgbaBitmap, x: number, y: number): number {
  return map.data[(y * map.width + x) * 4 + 3]!;
}

describe('foil maps from export pixels', () => {
  it('puts saturation on colored ink and leaves white paper at zero', () => {
    const src = bitmap(2, 1, [
      [255, 255, 255, 255],
      [220, 40, 40, 255],
    ]);
    const maps = deriveFoilMaps(src);
    expect(alphaAt(maps.sat, 0, 0)).toBe(0);
    expect(alphaAt(maps.sat, 1, 0)).toBeGreaterThan(180);
    expect(alphaAt(maps.gloss, 1, 0)).toBeGreaterThan(80);
    expect(alphaAt(maps.gloss, 0, 0)).toBe(0);
  });

  it('puts an edge ridge between dark ink and paper', () => {
    const row = [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ];
    const src = bitmap(4, 3, [...row, ...row, ...row]);
    const maps = deriveFoilMaps(src);
    expect(alphaAt(maps.edge, 1, 1)).toBeGreaterThan(40);
    expect(alphaAt(maps.sat, 2, 1)).toBe(0);
  });
});
