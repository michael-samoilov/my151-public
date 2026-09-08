import { describe, expect, it } from 'vitest';
import type { Pokemon } from '@/types/pokemon';
import type { EvolutionGroup } from '@/hooks/usePokemonData';
import { mergeBranchesByChain } from './chainMerge';

/**
 * The merge that lets a picker of individual Pokémon show each one once.
 *
 * `useFilteredPokemonGrouped` emits one group per root-to-leaf path, so the
 * members above a split arrive once per branch.
 */

const mon = (id: number, name: string): Pokemon => ({ id, name }) as unknown as Pokemon;

/** `chainId` is `evolutionChainId * 10000 + leafId`, as the hook builds it. */
const group = (chain: number, members: Pokemon[], matched?: number[]): EvolutionGroup => ({
  chainId: chain * 10000 + members[members.length - 1].id,
  members,
  matchedIds: new Set(matched ?? members.map((m) => m.id)),
});

const cosmog = mon(789, 'cosmog');
const cosmoem = mon(790, 'cosmoem');
const solgaleo = mon(791, 'solgaleo');
const lunala = mon(792, 'lunala');
const pichu = mon(172, 'pichu');
const pikachu = mon(25, 'pikachu');
const raichu = mon(26, 'raichu');

describe('mergeBranchesByChain', () => {
  it('draws a member above a split once, not once per branch', () => {
    const merged = mergeBranchesByChain([
      group(500, [cosmog, cosmoem, solgaleo]),
      group(500, [cosmog, cosmoem, lunala]),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].members.map((m) => m.name)).toEqual([
      'cosmog',
      'cosmoem',
      'solgaleo',
      'lunala',
    ]);
  });

  it('keeps root-to-leaf order rather than dex order', () => {
    // Dex order would put Pichu last, because the baby was added in a later
    // generation than the Pokémon it evolves into.
    const merged = mergeBranchesByChain([group(10, [pichu, pikachu, raichu])]);
    expect(merged[0].members.map((m) => m.name)).toEqual(['pichu', 'pikachu', 'raichu']);
  });

  it('keeps chains apart, and keys each merged group on its chain', () => {
    const merged = mergeBranchesByChain([
      group(500, [cosmog, cosmoem, solgaleo]),
      group(10, [pichu, pikachu, raichu]),
      group(500, [cosmog, cosmoem, lunala]),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((g) => g.chainId)).toEqual([500, 10]);
  });

  it('unions what each branch matched', () => {
    const merged = mergeBranchesByChain([
      group(500, [cosmog, cosmoem, solgaleo], [791]),
      group(500, [cosmog, cosmoem, lunala], [792]),
    ]);
    expect([...merged[0].matchedIds].sort()).toEqual([791, 792]);
  });
});
