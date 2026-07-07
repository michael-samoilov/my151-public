// Display metadata for the two official Pokédex classifications used as browse
// filters: color (10 `pokemon_colors` groups) and egg group (15 `egg_groups`).
// The raw identifiers live on each Pokémon in pokemon.json (stamped by
// scripts/add-color-egg.mjs); these maps give them user-facing labels. Egg
// group labels use the in-game English names (Field/Grass/Human-Like/Amorphous/
// Undiscovered) rather than PokeAPI's internal slugs.

import type { ColorName, EggGroupName } from '@/types/pokemon';
import { COLOR_NAMES, EGG_GROUP_NAMES } from '@/types/pokemon';

export const COLOR_ORDER: readonly ColorName[] = COLOR_NAMES;

export const COLOR_LABELS: Record<ColorName, string> = {
  black: 'Black',
  blue: 'Blue',
  brown: 'Brown',
  gray: 'Gray',
  green: 'Green',
  pink: 'Pink',
  purple: 'Purple',
  red: 'Red',
  white: 'White',
  yellow: 'Yellow',
};

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

export const EGG_GROUP_ORDER: readonly EggGroupName[] = EGG_GROUP_NAMES;

export const EGG_GROUP_LABELS: Record<EggGroupName, string> = {
  monster: 'Monster',
  water1: 'Water 1',
  water2: 'Water 2',
  water3: 'Water 3',
  bug: 'Bug',
  flying: 'Flying',
  ground: 'Field',
  fairy: 'Fairy',
  plant: 'Grass',
  humanshape: 'Human-Like',
  mineral: 'Mineral',
  indeterminate: 'Amorphous',
  ditto: 'Ditto',
  dragon: 'Dragon',
  'no-eggs': 'Undiscovered',
};
