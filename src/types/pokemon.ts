export const TYPE_NAMES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;

export type TypeName = typeof TYPE_NAMES[number];

/** Official dex body-shape groups (the 14 HOME/Pokédex shape icons), in the
 *  canonical shape-id order. Populated onto pokemon.json by
 *  scripts/add-shapes.mjs from the PokeAPI species data. */
export const SHAPE_NAMES = [
  'ball', 'squiggle', 'fish', 'arms', 'blob', 'upright', 'legs',
  'quadruped', 'wings', 'tentacles', 'heads', 'humanoid', 'bug-wings', 'armor',
] as const;

export type ShapeName = typeof SHAPE_NAMES[number];

/** Official Pokédex color groups (the 10 `pokemon_colors` classifications).
 *  Populated onto pokemon.json by scripts/add-color-egg.mjs. */
export const COLOR_NAMES = [
  'black', 'blue', 'brown', 'gray', 'green', 'pink', 'purple', 'red', 'white', 'yellow',
] as const;

export type ColorName = typeof COLOR_NAMES[number];

/** Official egg groups (the 15 `egg_groups` classifications, using PokeAPI's
 *  internal identifiers; display names live in EggGroupFilter). A species has
 *  one or two. Populated onto pokemon.json by scripts/add-color-egg.mjs. */
export const EGG_GROUP_NAMES = [
  'monster', 'water1', 'water2', 'water3', 'bug', 'flying', 'ground', 'fairy',
  'plant', 'humanshape', 'mineral', 'indeterminate', 'ditto', 'dragon', 'no-eggs',
] as const;

export type EggGroupName = typeof EGG_GROUP_NAMES[number];

export interface PokemonStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface Pokemon {
  id: number;
  name: string;
  types: TypeName[];
  stats: PokemonStats;
  bst: number;
  generation: number;
  evolutionChainId: number;
  evolvesFrom: number | null;
  evolutionStage: 1 | 2 | 3;
  evolutionLevel: number | null;
  isLegendary: boolean;
  isMythical: boolean;
  captureRate: number;
  growthRate: string;
  isBaby: boolean;
  sprite: string;
  archetypes: string[];
  shape: ShapeName;
  color: ColorName;
  eggGroups: EggGroupName[];
}

export interface DexSlot {
  slotNumber: number;
  sectionId: string;
  suggestedArchetype: string | null;
  pokemonId: number | null;
}

export interface DexSection {
  id: string;
  name: string;
  startSlot: number;
  endSlot: number;
  description: string;
}

export interface Archetype {
  id: string;
  name: string;
  description: string;
  pokemonIds: number[];
  suggestedSlotRange: [number, number];
  color: string;
  subgroups?: { label: string; pokemonIds: number[]; shinyIds?: number[] }[];
  shinyIds?: number[]; // Pokemon IDs that should display shiny sprites in this archetype
  spriteOverrides?: Record<number, string>; // Pokemon ID -> alternate sprite URL
}
