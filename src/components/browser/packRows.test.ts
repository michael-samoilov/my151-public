import { describe, expect, it } from 'vitest';
import type { Pokemon } from '@/types/pokemon';
import { homeGen, packRows, type PackableGroup } from './packRows';

let nextId = 1;
const mon = (generation: number): Pokemon =>
  ({ id: nextId++, name: `p${nextId}`, generation }) as unknown as Pokemon;

const line = (key: string, gens: number[], matched?: (m: Pokemon) => boolean): PackableGroup => {
  const members = gens.map(mon);
  return {
    key,
    members,
    matchedIds: new Set(members.filter(matched ?? (() => true)).map((m) => m.id)),
  };
};

const sizes = (rows: ReturnType<typeof packRows>) =>
  rows.map((r) => ({ sizes: r.groups.map((g) => g.members.length), spacers: r.trailingSpacers }));

describe('packRows', () => {
  it('pads a row out when the next line will not fit', () => {
    const rows = packRows([line('a', [1, 1]), line('b', [1, 1]), line('c', [1]), line('d', [1, 1])], 6);
    expect(sizes(rows)).toEqual([
      { sizes: [2, 2, 1], spacers: 1 },
      { sizes: [2], spacers: 4 },
    ]);
  });

  it('gives each piece the whole line’s home generation', () => {
    const eevee = line('eevee', [1, 1, 1, 1, 2, 2, 4, 4, 6], (m) => m.generation === 1);
    const rows = packRows([eevee], 6);
    const pieces = rows.flatMap((r) => r.groups);
    expect(pieces.map((g) => g.anchorGen)).toEqual([1, 1]);
  });
});

describe('homeGen', () => {
  it('is the earliest matched generation, else the earliest of all', () => {
    const members = [mon(4), mon(3)];
    expect(homeGen(members, new Set([members[1].id]))).toBe(3);
    expect(homeGen(members, new Set([members[0].id]))).toBe(4);
    expect(homeGen(members, new Set())).toBe(3);
  });
});
