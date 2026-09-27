// keeps: a selectable sprite with no ink measurement, which renders at the fallback size
import { describe, expect, it } from 'vitest';
import { allPickerMons } from './catalog';
import spriteInk from './spriteInk.json';

describe('grid sprite sizing', () => {
  it('measures every selectable local sprite', () => {
    const measured = spriteInk as Record<string, number>;
    for (const mon of allPickerMons()) {
      const id = /^\/sprites\/pokemon\/([^/]+)\.png$/.exec(mon.sprite)?.[1];
      expect(id, mon.name).toBeDefined();
      expect(measured[id!], mon.name).toBeGreaterThan(0);
    }
  });
});
