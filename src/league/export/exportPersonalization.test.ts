import { describe, expect, it } from 'vitest';
import { emptyCard } from '../store/useLeagueStore';
import {
  countDistinctPokemonInLeague,
  earlyExportLine,
  exportBeaconPlan,
  firstPokemonLine,
  pickFirstExportPokemon,
  previewExportHighlight,
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
    expect(earlyExportLine(151, 'pokedex')).toBe(
      "You're the 151st person to export a Pokedex. Coincidentally, that's the size of the national dex after Generation 1. Lucky you!",
    );
    expect(earlyExportLine(1025, 'league')).toContain('national dex after Generation 9');
    expect(earlyExportLine(1025, 'league')).toContain('Lucky you!');
    expect(earlyExportLine(2000, 'league')).toBeNull();
    expect(firstPokemonLine('Pikachu', 'league')).toBe(
      "You're also the first person to have Pikachu in an exported Pokemon League.",
    );
    expect(ordinalSuffix(12)).toBe('12th');
    expect(ordinalSuffix(23)).toBe('23rd');
  });

  it('builds a preview highlight without consuming uniqueness', () => {
    expect(previewExportHighlight('league', [95, 25])).toEqual({
      ordinal: 151,
      tool: 'league',
      firstPokemonId: 95,
    });
    expect(previewExportHighlight('card', [])).toEqual({
      ordinal: 151,
      tool: 'card',
      firstPokemonId: null,
    });
  });

  it('keeps demo exports local and silent on progress', () => {
    expect(exportBeaconPlan({ demo: true, optedOut: false, kind: 'export' })).toBe('preview');
    expect(exportBeaconPlan({ demo: true, optedOut: false, kind: 'progress' })).toBe('skip');
    expect(exportBeaconPlan({ demo: false, optedOut: false, kind: 'export' })).toBe('network');
    expect(exportBeaconPlan({ demo: false, optedOut: true, kind: 'export' })).toBe('network');
    expect(exportBeaconPlan({ demo: false, optedOut: true, kind: 'progress' })).toBe('skip');
    expect(exportBeaconPlan({ demo: true, optedOut: true, kind: 'export' })).toBe('preview');
  });

  it('picks the never-exported pokemon with the highest dex frequency', () => {
    expect(pickFirstExportPokemon([25, 1, 6], [25], { 1: 10, 6: 40, 25: 99 })).toBe(6);
    expect(pickFirstExportPokemon([25], [25], { 25: 9 })).toBeNull();
    expect(pickFirstExportPokemon([7, 4], [], {})).toBe(4);
  });
});
