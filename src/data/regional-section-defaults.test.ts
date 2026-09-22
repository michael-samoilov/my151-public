import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '@/data/archetypes';
import { STARTER_IDS } from '@/data/categories';
import { BUILD_GROUPS } from '@/data/slot-template';
import { getPokemonById } from '@/hooks/usePokemonData';
import { en } from '@/i18n/catalogs/en';
import { fitLabel, getSectionLabel, getSectionLabelChain, measureLabelWidth } from '@/lib/sectionOutlines';

/** First-stage faces for Regional Bird: screenshot lines plus Natu, Chatot, and Rookidee. */
const REGIONAL_BIRD_ROOTS = [16, 21, 163, 177, 276, 278, 396, 441, 519, 661, 731, 821, 931, 940];

/** First-stage faces for Regional Bug: screenshot lines plus Blipbug. */
const REGIONAL_BUG_ROOTS = [10, 13, 165, 167, 265, 401, 540, 543, 664, 736, 824, 917, 919, 953];

const LILLIPUP_LINE = [506, 507, 508];
const ROWLET_LINE = [722, 723, 724];
const NATU_LINE = [177, 178];
const CHATOT = 441;
const ROOKIDEE_LINE = [821, 822, 823];
const BLIPBUG_LINE = [824, 825, 826];

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
  it('names the build page Regional and falls back Early, then the animal word', () => {
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

    expect(getSectionLabelChain('early-bird')).toEqual(['Regional Bird', 'Early Bird', 'Bird']);
    expect(getSectionLabelChain('early-bug')).toEqual(['Regional Bug', 'Early Bug']);
    expect(getSectionLabelChain('early-rodent')).toEqual(['Regional Mammal', 'Early Mammal', 'Mammal']);

    expect(en['sectionShort.early-bird']).toBe('Early Bird');
    expect(en['sectionShort.early-bug']).toBe('Early Bug');
    expect(en['sectionShort.early-rodent']).toBe('Early Mammal');
    expect(en['sectionTiny.early-bird']).toBe('Bird');
    expect(en).not.toHaveProperty('sectionTiny.early-bug');
    expect(en['sectionTiny.early-rodent']).toBe('Mammal');
  });

  it('keeps Early Bug on a one-tile outline instead of falling to Bug', () => {
    const chain = getSectionLabelChain('early-bug');
    const fontPx = 10;
    const avail = measureLabelWidth('Early Bug', fontPx) * 0.6;
    expect(fitLabel(chain, avail, fontPx).text).toBe('Early Bug');
  });

  it('sets Regional Bird and Regional Bug to the screenshot evo lines, exclusively', () => {
    expect(rootsOf(arch('early-bird').pokemonIds)).toEqual(REGIONAL_BIRD_ROOTS);
    expect(rootsOf(arch('early-bug').pokemonIds)).toEqual(REGIONAL_BUG_ROOTS);

    for (const id of ROOKIDEE_LINE) {
      expect(arch('early-bird').pokemonIds, `bird ${id}`).toContain(id);
      expect(archetypeGroupIdsHolding(id), `rookidee ${id}`).toEqual(['early-bird']);
    }
    for (const id of BLIPBUG_LINE) {
      expect(arch('early-bug').pokemonIds, `bug ${id}`).toContain(id);
      expect(archetypeGroupIdsHolding(id), `blipbug ${id}`).toEqual(['early-bug']);
    }

    for (const id of arch('early-bird').pokemonIds) {
      expect(archetypeGroupIdsHolding(id), `bird ${id}`).toEqual(['early-bird']);
    }
    for (const id of arch('early-bug').pokemonIds) {
      expect(archetypeGroupIdsHolding(id), `bug ${id}`).toEqual(['early-bug']);
    }
  });

  it('keeps Rowlet in Starters only, and Natu and Chatot in Regional Bird only', () => {
    for (const id of ROWLET_LINE) {
      expect(arch('early-bird').pokemonIds, `bird ${id}`).not.toContain(id);
      expect(STARTER_IDS.has(id), `starter ${id}`).toBe(true);
      expect(archetypeGroupIdsHolding(id), `rowlet ${id}`).toEqual([]);
    }
    for (const id of NATU_LINE) {
      expect(arch('early-bird').pokemonIds, `bird ${id}`).toContain(id);
      expect(archetypeGroupIdsHolding(id), `natu ${id}`).toEqual(['early-bird']);
    }
    expect(arch('early-bird').pokemonIds).toContain(CHATOT);
    expect(archetypeGroupIdsHolding(CHATOT)).toEqual(['early-bird']);
  });

  it('keeps the Lillipup line in Domestic only', () => {
    for (const id of LILLIPUP_LINE) {
      expect(arch('early-rodent').pokemonIds, `mammal ${id}`).not.toContain(id);
      expect(arch('early-normal').pokemonIds, `domestic ${id}`).toContain(id);
      expect(archetypeGroupIdsHolding(id), `lillipup ${id}`).toEqual(['early-normal']);
    }
  });
});
