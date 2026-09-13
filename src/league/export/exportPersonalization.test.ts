import { describe, expect, it } from 'vitest';
import { emptyCard } from '../store/useLeagueStore';
import { countDistinctPokemonInLeague } from './exportPersonalization';
import { makePlacedLine } from '../model/engine';

describe('export personalization', () => {
  it('counts distinct species across lines and legends', () => {
    const cards = [emptyCard(), emptyCard()];
    cards[0] = {
      ...emptyCard(),
      lines: [makePlacedLine([1, 2, 3]), makePlacedLine([4, 5])],
      legends: [{ pokemonId: 150, seat: 1 }],
    };
    expect(countDistinctPokemonInLeague(cards)).toBe(6);
  });
});
