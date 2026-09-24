import { describe, expect, it } from 'vitest';
import { allPickerMons } from './catalog';
import spriteInk from './spriteInk.json';
import { gridSpriteSizePercent } from './gridSpriteSize';

describe('grid sprite sizing', () => {
  it('preserves small artwork and shrinks edge-to-edge artwork', () => {
    expect(gridSpriteSizePercent('/sprites/pokemon/25.png')).toBe(120);
    expect(gridSpriteSizePercent('/sprites/pokemon/644.png')).toBeLessThan(90);
    expect(gridSpriteSizePercent('/sprites/pokemon/888.png')).toBeLessThan(95);
    expect(gridSpriteSizePercent('/sprites/pokemon/644.png')).toBeLessThan(gridSpriteSizePercent('/sprites/pokemon/718.png'));
  });

  it('uses a conservative cap for a sprite missing from the measured catalog', () => {
    expect(gridSpriteSizePercent('/sprites/pokemon/999999.png')).toBe(88);
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
