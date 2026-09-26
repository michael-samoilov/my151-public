import { describe, expect, it } from 'vitest';
import {
  earlyExportLine,
  exportBeaconPlan,
  firstPokemonLine,
  ordinalSuffix,
} from './exportPersonalization';

describe('export personalization', () => {
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

  it('keeps demo exports local and silent on progress', () => {
    expect(exportBeaconPlan({ demo: true, optedOut: false, kind: 'export' })).toBe('preview');
    expect(exportBeaconPlan({ demo: true, optedOut: false, kind: 'progress' })).toBe('skip');
    expect(exportBeaconPlan({ demo: false, optedOut: false, kind: 'export' })).toBe('network');
    expect(exportBeaconPlan({ demo: false, optedOut: true, kind: 'export' })).toBe('network');
    expect(exportBeaconPlan({ demo: false, optedOut: true, kind: 'progress' })).toBe('skip');
    expect(exportBeaconPlan({ demo: true, optedOut: true, kind: 'export' })).toBe('preview');
  });
});
