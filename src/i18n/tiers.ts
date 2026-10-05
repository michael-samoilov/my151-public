import { en } from './catalogs/en';
import type { MessageKey } from './types';

/**
 * Not every string needs to ship in every language on day one.
 *
 * A locale is *usable* once its official terminology and its functional UI are
 * translated — someone can navigate, filter, build a dex and read what the
 * charts are counting. The editorial voice (archetype descriptions, milestone
 * copy, the poster's insight line) is what makes the app feel native, and it is
 * both the largest slice of the corpus and the hardest to machine-translate
 * well, because it has no official source and a lot of fandom register.
 *
 * Splitting them lets a locale launch on the first two tiers with editorial
 * copy falling back to English, rather than holding the whole language back or
 * shipping flavour text nobody vouched for. The runtime already falls back per
 * key, so a partial catalog needs no special handling — this just names which
 * part is "partial" on purpose.
 */
export type Tier =
  /** In-game terminology with an official published translation — types,
   *  colours, egg groups, regions, Pokémon names. Must match the games
   *  exactly; a wrong term here is worse than English. */
  | 'official'
  /** Functional UI: navigation, filters, settings, counts, empty states,
   *  chart headings. What the app needs to be operable in another language. */
  | 'core'
  /** Voice and flavour: descriptions, advice prose, milestone copy, poster
   *  insights. Improves the experience; its absence doesn't block use. */
  | 'editorial';

/**
 * Ordered longest-prefix-first: `sort.type.desc` must match the `.desc` rule
 * before the `sort.` one. Anything unmatched fails the test below rather than
 * silently defaulting, so a new key has to be classified deliberately.
 */
const RULES: { test: (key: string) => boolean; tier: Tier }[] = [
  // Official terminology, sourced rather than translated.
  { test: (k) => k.startsWith('term.'), tier: 'official' },
  { test: (k) => k.startsWith('region.'), tier: 'official' },
  { test: (k) => k === 'dex.national', tier: 'official' },

  // Prose attached to an otherwise functional label.
  { test: (k) => k.endsWith('.desc'), tier: 'editorial' },
  { test: (k) => k.startsWith('analytics.') && k.endsWith('.desc'), tier: 'editorial' },
  { test: (k) => k === 'analytics.type.descMatchup', tier: 'editorial' },
  { test: (k) => k === 'analytics.avgCompare', tier: 'editorial' },
  { test: (k) => k === 'viewSettings.statsHint', tier: 'editorial' },

  // Editorial voice.
  { test: (k) => k.startsWith('milestone.'), tier: 'editorial' },
  { test: (k) => k.startsWith('nudge.'), tier: 'editorial' },
  { test: (k) => k.startsWith('intro.'), tier: 'editorial' },
  { test: (k) => k.startsWith('poster.'), tier: 'editorial' },
  // The advisor's heading and badges are chrome; its advice is prose.
  { test: (k) => k === 'advisor.heading', tier: 'core' },
  { test: (k) => k.startsWith('advisor.gaps'), tier: 'core' },
  { test: (k) => k.startsWith('advisor.'), tier: 'editorial' },

  // Everything else is functional: nav, browser, view settings, sections,
  // categories and archetype names are all things a user navigates by.
  { test: () => true, tier: 'core' },
];

export function tierOf(key: MessageKey): Tier {
  for (const rule of RULES) if (rule.test(key)) return rule.tier;
  return 'core';
}

/** Every key, grouped by tier. Used by the translation pipeline to scope a run. */
export function keysByTier(): Record<Tier, MessageKey[]> {
  const out: Record<Tier, MessageKey[]> = { official: [], core: [], editorial: [] };
  for (const key of Object.keys(en) as MessageKey[]) out[tierOf(key)].push(key);
  return out;
}

/** The tiers a locale must supply in full before it can leave the flag. */
export const LAUNCH_TIERS: readonly Tier[] = ['official', 'core'];
