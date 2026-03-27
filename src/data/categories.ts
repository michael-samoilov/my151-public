import type { Pokemon } from '@/types/pokemon';

export interface PokemonCategory {
  id: string;
  name: string;
  color: string;
  filter: (p: Pokemon) => boolean;
  subgroups?: { label: string; pokemonIds: number[] }[];
}

// Ultra Beast IDs
const ULTRA_BEAST_IDS = new Set([793,794,795,796,797,798,799, 803,804,805,806]);

// Paradox Pokemon IDs (ancient + future)
const PARADOX_IDS = new Set([984,985,986,987,988,989, 990,991,992,993,994,995, 1005,1006, 1009,1010, 1020,1021,1022,1023]);

// Convergent Evolution IDs
const CONVERGENT_IDS = new Set([948,949, 960,961]);

// Ordered by introduction to the series
export const CATEGORIES: PokemonCategory[] = [
  // Gen 1 concepts
  {
    id: 'starter',
    name: 'Starter',
    color: '#48bb78',
    filter: (p) => STARTER_IDS.has(p.id),
    subgroups: [
      { label: 'Gen 1', pokemonIds: [1,2,3, 4,5,6, 7,8,9] },
      { label: 'Gen 2', pokemonIds: [152,153,154, 155,156,157, 158,159,160] },
      { label: 'Gen 3', pokemonIds: [252,253,254, 255,256,257, 258,259,260] },
      { label: 'Gen 4', pokemonIds: [387,388,389, 390,391,392, 393,394,395] },
      { label: 'Gen 5', pokemonIds: [495,496,497, 498,499,500, 501,502,503] },
      { label: 'Gen 6', pokemonIds: [650,651,652, 653,654,655, 656,657,658] },
      { label: 'Gen 7', pokemonIds: [722,723,724, 725,726,727, 728,729,730] },
      { label: 'Gen 8', pokemonIds: [810,811,812, 813,814,815, 816,817,818] },
      { label: 'Legends Arceus', pokemonIds: [722,723,10244, 155,156,10233, 501,502,10236] },
      { label: 'Gen 9', pokemonIds: [906,907,908, 909,910,911, 912,913,914] },
    ],
  },
  {
    id: 'fossil',
    name: 'Fossil',
    color: '#a0855b',
    filter: (p) => FOSSIL_IDS.has(p.id),
  },
  {
    id: 'pseudo-legendary',
    name: 'Pseudo-Legendary',
    color: '#6b46c1',
    filter: (p) => PSEUDO_LEGENDARY_IDS.has(p.id),
  },
  {
    id: 'legendary',
    name: 'Legendary',
    color: '#d69e2e',
    filter: (p) => p.isLegendary,
  },
  {
    id: 'mythical',
    name: 'Mythical',
    color: '#ed64a6',
    filter: (p) => p.isMythical,
  },
  // Gen 2
  {
    id: 'baby',
    name: 'Baby Pokemon',
    color: '#ed8936',
    filter: (p) => p.isBaby,
  },
  // Gen 7 (Alola)
  {
    id: 'alolan-form',
    name: 'Alolan Form',
    color: '#f6ad55',
    filter: (p) => p.name.includes('-alola'),
  },
  {
    id: 'ultra-beast',
    name: 'Ultra Beast',
    color: '#1a202c',
    filter: (p) => ULTRA_BEAST_IDS.has(p.id),
  },
  // Gen 8 (Galar)
  {
    id: 'galarian-form',
    name: 'Galarian Form',
    color: '#e53e3e',
    filter: (p) => p.name.includes('-galar'),
  },
  // Gen 8 (Legends Arceus)
  {
    id: 'hisuian-form',
    name: 'Hisuian Form',
    color: '#805ad5',
    filter: (p) => p.name.includes('-hisui'),
  },
  // Gen 9 (Paldea)
  {
    id: 'paldean-form',
    name: 'Paldean Form',
    color: '#dd6b20',
    filter: (p) => p.name.includes('-paldea'),
  },
  {
    id: 'convergent',
    name: 'Convergent',
    color: '#38a169',
    filter: (p) => CONVERGENT_IDS.has(p.id),
  },
  {
    id: 'paradox',
    name: 'Paradox',
    color: '#e53e3e',
    filter: (p) => PARADOX_IDS.has(p.id),
  },
];

// Fossil Pokemon (all stages)
const FOSSIL_IDS = new Set([
  138,139, 140,141, 142,
  345,346, 347,348,
  408,409, 410,411,
  564,565, 566,567,
  696,697, 698,699,
  880,881,882,883,
]);

// Pseudo-Legendary lines (600 BST final forms + pre-evos)
const PSEUDO_LEGENDARY_IDS = new Set([
  147,148,149, 246,247,248, 371,372,373, 374,375,376,
  443,444,445, 633,634,635, 704,705,706, 782,783,784,
  885,886,887, 996,997,998,
]);

// Starter Pokemon (all stages, all gens)
const STARTER_IDS = new Set([
  1,2,3, 4,5,6, 7,8,9,
  152,153,154, 155,156,157, 158,159,160,
  252,253,254, 255,256,257, 258,259,260,
  387,388,389, 390,391,392, 393,394,395,
  495,496,497, 498,499,500, 501,502,503,
  650,651,652, 653,654,655, 656,657,658,
  722,723,724, 725,726,727, 728,729,730,
  810,811,812, 813,814,815, 816,817,818,
  906,907,908, 909,910,911, 912,913,914,
  // Regional starter forms
  10233, 10236, 10244,
]);

export function getCategoryById(id: string): PokemonCategory | undefined {
  return CATEGORIES.find(c => c.id === id);
}
