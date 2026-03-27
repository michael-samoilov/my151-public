export const TYPE_NAMES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;

export type TypeName = typeof TYPE_NAMES[number];

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
  subgroups?: { label: string; pokemonIds: number[] }[];
  shinyIds?: number[]; // Pokemon IDs that should display shiny sprites in this archetype
  spriteOverrides?: Record<number, string>; // Pokemon ID -> alternate sprite URL
}
