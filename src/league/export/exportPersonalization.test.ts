import { describe, expect, it } from 'vitest';
import { emptyCard } from '../store/useLeagueStore';
import {
  countDistinctPokemonInLeague,
  earlyExportLine,
  pickFirstExportPokemon,
  ordinalSuffix,
} from './exportPersonalization';
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

  it('names early-export buckets and generation milestones', () => {
    expect(earlyExportLine(1, 'league')).toBe(
      "You're among the first 10 users to export a Pokemon League.",
    );
    expect(earlyExportLine(40, 'card')).toBe(
      "You're among the first 50 users to export a Gym Leader Card.",
    );
    expect(earlyExportLine(151, 'pokedex')).toContain('151st');
    expect(earlyExportLine(151, 'pokedex')).toContain('Generation 1');
    expect(earlyExportLine(2000, 'league')).toBeNull();
    expect(ordinalSuffix(12)).toBe('12th');
    expect(ordinalSuffix(23)).toBe('23rd');
  });

  it('picks the never-exported pokemon with the highest dex frequency', () => {
    expect(pickFirstExportPokemon([25, 1, 6], [25], { 1: 10, 6: 40, 25: 99 })).toBe(6);
    expect(pickFirstExportPokemon([25], [25], { 25: 9 })).toBeNull();
    expect(pickFirstExportPokemon([7, 4], [], {})).toBe(4);
  });
});
