import { translate } from './core';
import { en } from './catalogs/en';
import type { NoArgKey } from './types';

/**
 * Display names for the four data collections — build sections, categories,
 * archetypes and regional dexes.
 *
 * Unlike the term maps in terms.ts, these ids are plain `string`, not const
 * unions, so an exhaustive `Record` isn't available and the key has to be
 * built by concatenation. `en.data.test.ts` buys back what that costs: it
 * asserts every id in every collection has a message, so a missing key fails
 * `npm test` rather than rendering `archetype.pikachu-clone` to a user.
 *
 * `?? key` is the last resort. It is deliberately visible rather than blank —
 * an empty section heading is a mystery, a raw key is a bug report.
 */

function lookup(key: string): string {
  return key in en ? translate(key as NoArgKey) : key;
}

/** A build-section heading, e.g. `starter` → "Starters". */
export function sectionName(id: string): string {
  return lookup(`section.${id}`);
}

/** A browse category, e.g. `alolan-form` → "Alolan Form". */
export function categoryName(id: string): string {
  return lookup(`category.${id}`);
}

export function categorySubgroupLabel(id: string, index: number): string {
  return lookup(`category.${id}.sub.${index}`);
}

export function categoryColumnLabel(id: string, side: 'left' | 'right'): string {
  return lookup(`category.${id}.col.${side}`);
}

/** An archetype, e.g. `early-bug` → "Early Route Bug". */
export function archetypeName(id: string): string {
  return lookup(`archetype.${id}`);
}

export function archetypeDescription(id: string): string {
  return lookup(`archetype.${id}.desc`);
}

export function archetypeSubgroupLabel(id: string, index: number): string {
  return lookup(`archetype.${id}.sub.${index}`);
}

/** A regional dex, e.g. `kanto` → "Kanto". */
export function regionName(id: string): string {
  return lookup(`region.${id}`);
}
