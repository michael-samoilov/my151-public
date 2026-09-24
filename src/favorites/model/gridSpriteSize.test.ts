import { describe, expect, it } from 'vitest';
import { allPickerMons } from './catalog';
import spriteInk from './spriteInk.json';
import { gridSpriteSizePercent } from './gridSpriteSize';

describe('grid sprite sizing', () => {
  it('preserves small artwork and caps large visible artwork at the cell edge', () => {
    expect(gridSpriteSizePercent('/sprites/pokemon/25.png')).toBe(120);
    expect(gridSpriteSizePercent('/sprites/pokemon/644.png')).toBeLessThan(120);
    expect(gridSpriteSizePercent('/sprites/pokemon/888.png')).toBeLessThan(120);
    expect(gridSpriteSizePercent('/sprites/pokemon/644.png')).toBeLessThan(gridSpriteSizePercent('/sprites/pokemon/718.png'));
    expect(gridSpriteSizePercent('/sprites/pokemon/644.png') * (spriteInk as Record<string, number>)['644']).toBeCloseTo(100, 0);
  });

  it('keeps an unmeasured sprite inside the cell', () => {
    expect(gridSpriteSizePercent('/sprites/pokemon/999999.png')).toBe(100);
  });

  it('measures every selectable local sprite', () => {
    const measured = spriteInk as Record<string, number>;
    for (const mon of allPickerMons()) {
      const id = /^\/sprites\/pokemon\/([^/]+)\.png$/.exec(mon.sprite)?.[1];
      expect(id, mon.name).toBeDefined();
      expect(measured[id!], mon.name).toBeGreaterThan(0);
    }
  });
});
