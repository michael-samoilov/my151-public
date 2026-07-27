// Display metadata for the two official Pokédex classifications used as browse
// filters: color (10 `pokemon_colors` groups) and egg group (15 `egg_groups`).
// The raw identifiers live on each Pokémon in pokemon.json (stamped by
// scripts/add-color-egg.mjs); these maps give them user-facing labels. Egg
// group labels use the in-game English names (Field/Grass/Human-Like/Amorphous/
// Undiscovered) rather than PokeAPI's internal slugs.

import type { ColorName, EggGroupName } from '@/types/pokemon';
import { COLOR_NAMES, EGG_GROUP_NAMES } from '@/types/pokemon';

export const COLOR_ORDER: readonly ColorName[] = COLOR_NAMES;


/** Representative swatch color for each Pokédex color group. These are UI
 *  swatches (a legible mid-tone of each named color), not exact game values. */
export const COLOR_SWATCHES: Record<ColorName, string> = {
  black: '#33363b',
  blue: '#4a86d8',
  brown: '#a5673f',
  gray: '#9299a1',
  green: '#5fbb54',
  pink: '#f19bc0',
  purple: '#9a5bbd',
  red: '#e0574f',
  white: '#eceef0',
  yellow: '#f7d94c',
};

/** Readable text color (near-black or white) to place on top of a swatch,
 *  chosen by perceived luminance. Used when a selected color filter paints its
 *  button/chip in its own swatch color. */
export function colorTextOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}

/** Inset ring color for a swatch-painted button/chip, so light fills (white,
 *  yellow) still have a defined edge against the light UI. Dark on light fills,
 *  faint-white on dark fills. */
export function colorRingOn(hex: string): string {
  return colorTextOn(hex) === '#1a1a1a' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.4)';
}

export const EGG_GROUP_ORDER: readonly EggGroupName[] = EGG_GROUP_NAMES;

