import { en } from './catalogs/en';
import type { MessageKey } from './types';

export type Tier =
  | 'official'
  | 'core'
  | 'editorial';

const SOURCED_SUBLABELS = new Set<string>([
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `archetype.gift-pokemon.sub.${i}`),
  ...[0, 1, 2].map((i) => `archetype.reward-pokemon.sub.${i}`),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `archetype.static-encounter.sub.${i}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `archetype.evil-team.sub.${i}`),
  'archetype.cross-gen-evo.sub.5',
  'archetype.evolution-item.sub.28',
  'category.starter.sub.8',
]);

const RULES: { test: (key: string) => boolean; tier: Tier }[] = [
  { test: (k) => k.startsWith('term.'), tier: 'official' },
  { test: (k) => k.startsWith('region.'), tier: 'official' },
  { test: (k) => k === 'dex.national', tier: 'official' },
  { test: (k) => k.startsWith('league.category.') || k.startsWith('league.contest.'), tier: 'official' },
  { test: (k) => SOURCED_SUBLABELS.has(k), tier: 'official' },

  { test: (k) => k.endsWith('.desc'), tier: 'editorial' },
  { test: (k) => k.startsWith('analytics.') && k.endsWith('.desc'), tier: 'editorial' },
  { test: (k) => k === 'analytics.type.descMatchup', tier: 'editorial' },
  { test: (k) => k === 'analytics.avgCompare', tier: 'editorial' },
  { test: (k) => k === 'viewSettings.statsHint', tier: 'editorial' },

  { test: (k) => k.startsWith('milestone.'), tier: 'editorial' },
  { test: (k) => k.startsWith('nudge.'), tier: 'editorial' },
  { test: (k) => k.startsWith('intro.'), tier: 'editorial' },
  { test: (k) => k.startsWith('poster.'), tier: 'editorial' },
  { test: (k) => k === 'advisor.heading', tier: 'core' },
  { test: (k) => k.startsWith('advisor.gaps'), tier: 'core' },
  { test: (k) => k.startsWith('advisor.'), tier: 'editorial' },

  { test: () => true, tier: 'core' },
];

export function tierOf(key: MessageKey): Tier {
  for (const rule of RULES) if (rule.test(key)) return rule.tier;
  return 'core';
}

export function keysByTier(): Record<Tier, MessageKey[]> {
  const out: Record<Tier, MessageKey[]> = { official: [], core: [], editorial: [] };
  for (const key of Object.keys(en) as MessageKey[]) out[tierOf(key)].push(key);
  return out;
}

export const LAUNCH_TIERS: readonly Tier[] = ['official', 'core'];
