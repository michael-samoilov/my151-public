import type { Pokemon } from '@/types/pokemon';

export interface PokemonCategory {
  id: string;
  name: string;
  color: string;
  filter: (p: Pokemon) => boolean;
  subgroups?: { label: string; pokemonIds: number[] }[];
  dualColumns?: {
    left: { label: string; ids: number[] };
    right: { label: string; ids: number[] };
  };
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
      { label: 'Legends Arceus', pokemonIds: [10244, 10233, 10236] },
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
    dualColumns: {
      left: { label: 'Restricted', ids: [150, 249,250, 382,383,384, 483,484,487, 643,644,646, 716,717,718, 789,790,791,792,800, 888,889,890, 898, 1007,1008,1024] },
      right: { label: 'Sub-legendary', ids: [144,145,146, 243,244,245, 377,378,379,380,381, 480,481,482,485,486,488, 638,639,640,641,642,645, 772,773, 785,786,787,788, 891,892, 894,895,896,897, 905, 1001,1002,1003,1004, 1014,1015,1016,1017] },
    },
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
    subgroups: [
      { label: 'Gen 1 originals', pokemonIds: [10161,10162,10163,10164,10165,10166,10167,10168,10169,10170,10171] },
      { label: 'Gen 2 originals', pokemonIds: [10172,10173] },
      { label: 'Gen 3 originals', pokemonIds: [10174,10175] },
      { label: 'Gen 5 originals', pokemonIds: [10176,10177,10178,10179] },
    ],
  },
  // Gen 8 (Legends Arceus)
  {
    id: 'hisuian-form',
    name: 'Hisuian Form',
    color: '#805ad5',
    filter: (p) => p.name.includes('-hisui'),
    subgroups: [
      { label: 'Gen 1 originals', pokemonIds: [10229,10230,10231,10232] },
      { label: 'Gen 2 originals', pokemonIds: [10233,10234,10235] },
      { label: 'Gen 5 originals', pokemonIds: [10236,10237,10238,10239,10240] },
      { label: 'Gen 6 originals', pokemonIds: [10241,10242,10243] },
      { label: 'Gen 7 originals', pokemonIds: [10244] },
    ],
  },
  // Gen 9 (Paldea)
  {
    id: 'paldean-form',
    name: 'Paldean Form',
    color: '#dd6b20',
    filter: (p) => p.name.includes('-paldea'),
    subgroups: [
      { label: 'Gen 1 originals', pokemonIds: [10250,10251,10252] },
      { label: 'Gen 2 originals', pokemonIds: [10253] },
    ],
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
    subgroups: [
      { label: 'Gen 1 originals', pokemonIds: [985,989] }, // Scream Tail (Jigglypuff), Sandy Shocks (Magneton)
      { label: 'Gen 2 originals', pokemonIds: [984,990, 987, 991,995, 1009,1020,1021] }, // Great Tusk/Iron Treads (Donphan), Flutter Mane (Misdreavus), Iron Bundle (Delibird), Iron Thorns (Tyranitar), Walking Wake (Suicune), Gouging Fire (Entei), Raging Bolt (Raikou)
      { label: 'Gen 3 originals', pokemonIds: [992,1005, 1006] }, // Iron Hands (Hariyama), Roaring Moon (Salamence), Iron Valiant (Gardevoir/Gallade)
      { label: 'Gen 5 originals', pokemonIds: [986,988, 993,994, 1010,1022,1023] }, // Brute Bonnet (Amoonguss), Slither Wing (Volcarona), Iron Jugulis (Hydreigon), Iron Moth (Volcarona), Iron Leaves (Virizion), Iron Boulder (Terrakion), Iron Crown (Cobalion)
    ],
    dualColumns: {
      left: { label: 'Past', ids: [984,985,986,987,988,989, 1005, 1009,1020,1021] },
      right: { label: 'Future', ids: [990,991,992,993,994,995, 1006, 1010,1022,1023] },
    },
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
export const STARTER_IDS = new Set([
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
