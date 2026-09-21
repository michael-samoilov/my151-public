import { describe, expect, it } from 'vitest';
import { getPickerMon } from './catalog';
import {
  enumeratePaths,
  packingNeeded,
  selectorChain,
  type TypeFills,
} from './packing';
import type { PickerMon } from './catalog';

function mon(id: number, fallback: Partial<PickerMon> = {}): PickerMon {
  const found = getPickerMon(id);
  if (found) return found;
  return {
    id,
    name: fallback.name ?? `mon-${id}`,
    types: fallback.types ?? ['normal'],
    generation: fallback.generation ?? 2,
    sprite: `/sprites/pokemon/${id}.png`,
    source: 'dex',
    ownerId: id,
    ...fallback,
  };
}

describe('selectorChain', () => {
  it('shows the incoming Pokémon faded in the vacated origin, not a blank', () => {
    const azu = mon(184);
    const path = [
      { mon: azu, from: 'water' as const, to: 'fairy' as const, kind: 'slide' as const },
    ];
    const slots = selectorChain(path);
    expect(slots[0]).toMatchObject({ type: 'water', role: 'vacate', mon: azu });
    expect(slots[0].mon?.id).toBe(184);
    expect(slots[1]).toMatchObject({ type: 'fairy', role: 'place', mon: azu });
  });
});

describe('enumeratePaths', () => {
  it('slides Azumarill Water → Fairy in two short chains when Fairy is taken', () => {
    const azu = mon(184);
    const wiggly = mon(40);
    const map: TypeFills = { water: azu, fairy: wiggly };
    expect(packingNeeded(map, 'fairy', azu)).toBe(true);
    const { paths } = enumeratePaths(map, 'fairy', azu);
    expect(paths.length).toBeGreaterThan(0);
    const shortest = paths[0];
    expect(shortest[0]).toMatchObject({ mon: azu, from: 'water', to: 'fairy' });
    const leave = paths.find((p) => p.some((s) => s.kind === 'leave' && s.mon.id === wiggly.id));
    expect(leave).toBeTruthy();
  });

  it('does not pack when the dest is empty and the form is new to the row', () => {
    const azu = mon(184);
    expect(packingNeeded({}, 'water', azu)).toBe(false);
  });
});
