import type { TypeName } from '@/types/pokemon';

// Draft mapping of each build section to a representative Pokémon type, used for
// the corner-spandrel icon. `null` marks a concept/non-type section, which keeps
// the 4-point star instead of a type symbol (per the original spec: starter,
// legendary, mythical, …).
//
// This is a thematic first pass — later it could be derived from the actual
// most-common type of each section's canonical Pokémon. Multiple sections may
// share a type (e.g. beach / fishing / ocean → water).
export const SECTION_TYPE: Record<string, TypeName | null> = {
  'starter': null,            // concept (green/red/blue trio) → star
  'early-bug': 'bug',
  'early-bird': 'flying',
  'early-rodent': 'normal',
  'pikachu-clone': 'electric',
  'early-normal': 'normal',
  'forest': 'grass',
  'meadow': 'fairy',          // flowery field (forest already covers grass)
  'cave-pokemon': 'rock',
  'swamp': 'poison',          // murky bog (alt: ground)
  'dojo': 'fighting',
  'haunted': 'ghost',
  'ruins': 'psychic',         // "ancient ruins / temples, mystical" archetype
  'beach': 'water',
  'fishing-pokemon': 'water',
  'ocean': 'water',
  'desert': 'ground',
  'volcanic': 'fire',
  'tundra': 'ice',
  'industrial': 'steel',
  'mimic': null,              // disguise concept → star
  'rivalry-pair': null,       // pairs span types → star
  'evil-team': 'dark',
  'other': null,             // catch-all → star
  'fossil': 'rock',
  'pseudo-legendary': 'dragon',
  'legendary': null,         // concept → star
  'mythical': null,          // concept → star
};
