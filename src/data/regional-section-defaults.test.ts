import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '@/data/archetypes';
import { BUILD_GROUPS } from '@/data/slot-template';
import { getPokemonById } from '@/hooks/usePokemonData';
import { en } from '@/i18n/catalogs/en';
import { getSectionLabel, getSectionLabelChain } from '@/lib/sectionOutlines';

/** First-stage faces from Michael's Regional Bird screenshot, national-dex order. */
const REGIONAL_BIRD_ROOTS = [16, 21, 163, 276, 278, 396, 519, 661, 722, 731, 931, 940];

/** First-stage faces from Michael's Regional Bug screenshot, national-dex order. */
const REGIONAL_BUG_ROOTS = [10, 13, 165, 167, 265, 401, 540, 543, 664, 736, 917, 919, 953];

const LILLIPUP_LINE = [506, 507, 508];
const ROOKIDEE = 821;

function arch(id: string) {
  const found = ARCHETYPES.find((a) => a.id === id);
  if (!found) throw new Error(`missing archetype ${id}`);
  return found;
}

function group(id: string) {
  const found = BUILD_GROUPS.find((g) => g.id === id);
  if (!found) throw new Error(`missing build group ${id}`);
  return found;
}

function nationalRoot(id: number): number {
  let cur = getPokemonById(id);
  if (!cur) return id;
  while (cur.evolvesFrom) {
    const prev = getPokemonById(cur.evolvesFrom);
    if (!prev) break;
    cur = prev;
  }
  return cur.id;
}

function rootsOf(ids: readonly number[]): number[] {
  return [...new Set(ids.map(nationalRoot))].sort((a, b) => a - b);
}

function archetypeGroupIdsHolding(id: number): string[] {
  return BUILD_GROUPS.filter((g) => {
    if (g.filterType !== 'archetype' || !g.filterId) return false;
    return arch(g.filterId).pokemonIds.includes(id);
  }).map((g) => g.id);
}

describe('regional section defaults', () => {
  it('renames Early Route Bird/Bug/Mammal on the build page and View outlines', () => {
    expect(group('early-bird').name).toBe('Regional Bird');
    expect(group('early-bug').name).toBe('Regional Bug');
    expect(group('early-rodent').name).toBe('Regional Mammal');
    expect(arch('early-bird').name).toBe('Regional Bird');
    expect(arch('early-bug').name).toBe('Regional Bug');
    expect(arch('early-rodent').name).toBe('Regional Mammal');

    for (const g of BUILD_GROUPS) {
      expect(g.name, g.id).not.toMatch(/Early Route/i);
    }

    expect(getSectionLabel('early-bird')).toBe('Regional Bird');
    expect(getSectionLabel('early-bug')).toBe('Regional Bug');
    expect(getSectionLabel('early-rodent')).toBe('Regional Mammal');

    for (const id of ['early-bird', 'early-bug', 'early-rodent'] as const) {
      for (const label of getSectionLabelChain(id)) {
        expect(label, `${id} outline "${label}"`).not.toMatch(/early/i);
      }
    }

    expect(en['sectionShort.early-bird']).not.toMatch(/Early/i);
    expect(en['sectionShort.early-bug']).not.toMatch(/Early/i);
    expect(en['sectionShort.early-rodent']).not.toMatch(/Early/i);
  });

  it('sets Regional Bird and Regional Bug to the screenshot evo lines, exclusively', () => {
    expect(rootsOf(arch('early-bird').pokemonIds)).toEqual(REGIONAL_BIRD_ROOTS);
    expect(rootsOf(arch('early-bug').pokemonIds)).toEqual(REGIONAL_BUG_ROOTS);
    expect(arch('early-bird').pokemonIds).not.toContain(ROOKIDEE);

    for (const id of arch('early-bird').pokemonIds) {
      expect(archetypeGroupIdsHolding(id), `bird ${id}`).toEqual(['early-bird']);
    }
    for (const id of arch('early-bug').pokemonIds) {
      expect(archetypeGroupIdsHolding(id), `bug ${id}`).toEqual(['early-bug']);
    }
  });

  it('keeps the Lillipup line in Domestic only', () => {
    for (const id of LILLIPUP_LINE) {
      expect(arch('early-rodent').pokemonIds, `mammal ${id}`).not.toContain(id);
      expect(arch('early-normal').pokemonIds, `domestic ${id}`).toContain(id);
      expect(archetypeGroupIdsHolding(id), `lillipup ${id}`).toEqual(['early-normal']);
    }
  });
});
