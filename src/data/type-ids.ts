import type { TypeName } from '@/types/pokemon';

const POKEAPI_TYPE_IDS: Record<TypeName, number> = {
  normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6,
  bug: 7, ghost: 8, steel: 9, fire: 10, water: 11, grass: 12,
  electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
};

/** Small Gen IX icon sprites (60x60px, white symbol on a coloured square) */
export function typeIconPath(type: TypeName): string {
  return `/sprites/types/small/${POKEAPI_TYPE_IDS[type]}.png`;
}

/**
 * The white symbol alone, cropped to its bounding box, generated from the small
 * icons by `scripts/build-type-glyphs.ts`. Sizes vary per type — draw it into a
 * square box with `preserveAspectRatio="xMidYMid meet"` (or the canvas
 * equivalent) rather than stretching it.
 */
export function typeGlyphPath(type: TypeName): string {
  return `/sprites/types/glyph/${POKEAPI_TYPE_IDS[type]}.png`;
}
