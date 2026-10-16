import { translate } from './core';
import { en } from './catalogs/en';
import type { NoArgKey } from './types';

function lookup(key: string): string {
  return key in en ? translate(key as NoArgKey) : key;
}

export function sectionName(id: string): string {
  return lookup(`section.${id}`);
}

export function categoryName(id: string): string {
  return lookup(`category.${id}`);
}

export function categorySubgroupLabel(id: string, index: number): string {
  return lookup(`category.${id}.sub.${index}`);
}

export function categoryColumnLabel(id: string, side: 'left' | 'right'): string {
  return lookup(`category.${id}.col.${side}`);
}

export function archetypeName(id: string): string {
  return lookup(`archetype.${id}`);
}

export function archetypeDescription(id: string): string {
  return lookup(`archetype.${id}.desc`);
}

export function archetypeSubgroupLabel(id: string, index: number): string {
  return lookup(`archetype.${id}.sub.${index}`);
}

export function regionName(id: string): string {
  return lookup(`region.${id}`);
}
