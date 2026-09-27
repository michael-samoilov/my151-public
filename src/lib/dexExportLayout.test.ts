// keeps: glare-mask spots drifting from the PNG's sprite spots (one per evolution line, not per species); no E2E reads the mask geometry.
import { describe, expect, it } from 'vitest';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { getPokemonByIds } from '@/hooks/usePokemonData';
import {
  DEX_EXPORT_POKEBALL_R_FRAC,
  DEX_EXPORT_TILE,
  layoutDexExportGrid,
} from './dexExportLayout';

const WORKSHOP_DEX_SECTIONS: Record<string, number[]> = {
  starter: DEMO_DEX_SECTIONS.starter,
  'early-bug': DEMO_DEX_SECTIONS['early-bug'],
  'pikachu-clone': DEMO_DEX_SECTIONS['pikachu-clone'],
  legendary: DEMO_DEX_SECTIONS.legendary,
  mythical: DEMO_DEX_SECTIONS.mythical,
};

describe('layoutDexExportGrid', () => {
  it('places one pokéball-sized spot per species, not one for the line', () => {
    const ids = Object.values(WORKSHOP_DEX_SECTIONS).flat();
    const pokemon = getPokemonByIds(ids);
    const grid = layoutDexExportGrid(pokemon, WORKSHOP_DEX_SECTIONS);
    expect(grid.sprites).toHaveLength(pokemon.length);
    expect(grid.sprites.length).toBeGreaterThan(3);

    const ball = DEX_EXPORT_TILE * DEX_EXPORT_POKEBALL_R_FRAC;
    const turtwigLine = grid.sprites.slice(0, 3);
    expect(turtwigLine.map((s) => s.pokemon.id)).toEqual([387, 388, 389]);
    expect(new Set(turtwigLine.map((s) => s.cx)).size).toBe(3);
    expect(turtwigLine[0].cy).toBeCloseTo(turtwigLine[1].cy);
    expect(turtwigLine[1].cx).toBeGreaterThan(turtwigLine[0].cx);
    for (const s of turtwigLine) {
      expect(s.r).toBeCloseTo(ball);
    }

    const types = new Set(grid.sprites.map((s) => s.pokemon.types[0]));
    expect(types.has('grass')).toBe(true);
    expect(types.has('fire')).toBe(true);
    expect(types.has('water')).toBe(true);
  });
});
