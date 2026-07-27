import { describe, expect, it } from 'vitest';
import { en } from './catalogs/en';
import { keysByTier, tierOf, LAUNCH_TIERS } from './tiers';
import type { MessageKey } from './types';

describe('catalog tiers', () => {
  const byTier = keysByTier();

  it('classifies every key exactly once', () => {
    const total = byTier.official.length + byTier.core.length + byTier.editorial.length;
    expect(total).toBe(Object.keys(en).length);
  });

  it('puts in-game terminology in the official tier', () => {
    // These have published translations in all nine languages; getting one
    // wrong is worse than leaving it in English.
    for (const key of ['term.type.fire', 'term.eggGroup.ground', 'term.shape.ball', 'region.kanto'] as MessageKey[]) {
      expect(tierOf(key), key).toBe('official');
    }
  });

  it('puts navigation, filters and settings in the core tier', () => {
    for (const key of [
      'nav.build',
      'browser.search.placeholder',
      'browser.empty.title',
      'viewSettings.apply',
      'sort.national',
      'category.starter',
      'section.starter',
      'archetype.early-bug',
    ] as MessageKey[]) {
      expect(tierOf(key), key).toBe('core');
    }
  });

  it('puts flavour and explanatory prose in the editorial tier', () => {
    for (const key of [
      'sort.national.desc',
      'archetype.early-bug.desc',
      'milestone.25.detail',
      'nudge.151.body',
      'advisor.noStarter',
      'viewSettings.statsHint',
    ] as MessageKey[]) {
      expect(tierOf(key), key).toBe('editorial');
    }
  });

  it('keeps a category or section name functional, not editorial', () => {
    // A user navigates by these. If they stayed English the app would be
    // half-translated in the most visible possible way.
    expect(tierOf('category.alolan-form' as MessageKey)).toBe('core');
    expect(tierOf('section.pikachu-clone' as MessageKey)).toBe('core');
  });

  it('leaves the launch tiers a tractable share of the corpus', () => {
    // The point of tiering: a locale can go live without the largest and
    // hardest-to-translate slice. If this ratio ever inverts, the split has
    // stopped doing its job.
    const launch = LAUNCH_TIERS.reduce((n, tier) => n + byTier[tier].length, 0);
    expect(launch).toBeLessThan(Object.keys(en).length);
    expect(byTier.editorial.length).toBeGreaterThan(0);
  });
});
