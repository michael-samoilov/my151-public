import type { TypeName } from '@/types/pokemon';

export const POKEAPI_TYPE_IDS: Record<TypeName, number> = {
  normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6,
  bug: 7, ghost: 8, steel: 9, fire: 10, water: 11, grass: 12,
  electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
};

/** Full-size Gen IX badge sprites (128x40px, type name baked in) */
export function typeBadgePath(type: TypeName): string {
  return `/sprites/types/badges/${POKEAPI_TYPE_IDS[type]}.png`;
}

/** Small Gen IX icon sprites (60x60px, icon only) */
export function typeIconPath(type: TypeName): string {
  return `/sprites/types/small/${POKEAPI_TYPE_IDS[type]}.png`;
}
