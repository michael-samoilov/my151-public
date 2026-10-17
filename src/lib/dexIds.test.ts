import { describe, expect, it } from 'vitest';
import pokemonData from '@/data/pokemon.json';
import { EVOLUTION_CHAIN_BY_ID } from '../../api/_chains';

describe('Pokédex ids the analytics API accepts', () => {
  it('are exactly the species and forms a build can hold', () => {
    const data = (pokemonData as { id: number }[]).map((p) => p.id).sort((a, b) => a - b);
    const accepted = Object.keys(EVOLUTION_CHAIN_BY_ID).map(Number).sort((a, b) => a - b);
    expect(accepted, 'api/_chains.ts is stale. Run: node scripts/gen-chains.mjs').toEqual(data);
  });
});
