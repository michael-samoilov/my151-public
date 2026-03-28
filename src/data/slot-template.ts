export interface BuildGroup {
  id: string;
  name: string;
  filterType: 'archetype' | 'category' | null; // null = catch-all
  filterId: string | null;
  color: string; // subtle tint for the group box
}

/**
 * Ordered list of build groups shown on the Pokedex grid.
 * Each maps to an archetype or category that pre-filters the browser.
 * Excluded: game mechanics (evolution-item, trade-evo, branched-evo, cross-gen-evo,
 * static-encounter, gift, in-game-trade, prize) and gym-champion-ace.
 */
export const BUILD_GROUPS: BuildGroup[] = [
  // Starters
  { id: 'starter', name: 'Starters', filterType: 'category', filterId: 'starter', color: '#48bb78' },

  // Early route
  { id: 'early-bird', name: 'Early Route Bird', filterType: 'archetype', filterId: 'early-bird', color: '#a98ff3' },
  { id: 'early-bug', name: 'Early Bug', filterType: 'archetype', filterId: 'early-bug', color: '#a6b91a' },
  { id: 'early-rodent', name: 'Early Route Mammal', filterType: 'archetype', filterId: 'early-rodent', color: '#a8a77a' },
  { id: 'pikachu-clone', name: 'Pikaclone', filterType: 'archetype', filterId: 'pikachu-clone', color: '#f7d02c' },
  { id: 'early-normal', name: 'Domestic', filterType: 'archetype', filterId: 'early-normal', color: '#a8a77a' },

  // Places (ordered by typical game progression)
  { id: 'forest', name: 'Forest', filterType: 'archetype', filterId: 'forest', color: '#2d6a4f' },
  { id: 'meadow', name: 'Meadow', filterType: 'archetype', filterId: 'meadow', color: '#f9a8d4' },
  { id: 'cave-pokemon', name: 'Cave', filterType: 'archetype', filterId: 'cave-pokemon', color: '#b6a136' },
  { id: 'swamp', name: 'Swamp', filterType: 'archetype', filterId: 'swamp', color: '#5c6d3f' },
  { id: 'beach', name: 'Beach', filterType: 'archetype', filterId: 'beach', color: '#e9c46a' },
  { id: 'fishing-pokemon', name: 'Fishing', filterType: 'archetype', filterId: 'fishing-pokemon', color: '#6390f0' },
  { id: 'dojo', name: 'Dojo', filterType: 'archetype', filterId: 'dojo', color: '#c22e28' },
  { id: 'haunted', name: 'Haunted', filterType: 'archetype', filterId: 'haunted', color: '#735797' },
  { id: 'ruins', name: 'Ruins / Temple', filterType: 'archetype', filterId: 'ruins', color: '#c4b5fd' },
  { id: 'ocean', name: 'Ocean', filterType: 'archetype', filterId: 'ocean', color: '#006494' },
  { id: 'desert', name: 'Desert', filterType: 'archetype', filterId: 'desert', color: '#dda15e' },
  { id: 'volcanic', name: 'Volcanic', filterType: 'archetype', filterId: 'volcanic', color: '#d62828' },
  { id: 'tundra', name: 'Tundra', filterType: 'archetype', filterId: 'tundra', color: '#7ec8e3' },

  // Thematic
  { id: 'industrial', name: 'Industrial/Artificial', filterType: 'archetype', filterId: 'industrial', color: '#b7b7ce' },
  { id: 'mimic', name: 'Mimic/Disguise', filterType: 'archetype', filterId: 'mimic', color: '#735797' },
  { id: 'evil-team', name: 'Evil Team', filterType: 'archetype', filterId: 'evil-team', color: '#705746' },
  { id: 'rivalry-pair', name: 'Rivalry Pair', filterType: 'archetype', filterId: 'rivalry-pair', color: '#c22e28' },

  // Fossil
  { id: 'fossil', name: 'Fossil', filterType: 'category', filterId: 'fossil', color: '#a0855b' },

  // Catch-all (before endgame classifications)
  { id: 'other', name: 'Other Routes & Areas', filterType: null, filterId: null, color: '#888888' },

  // Endgame
  { id: 'pseudo-legendary', name: 'Pseudo-Legendary', filterType: 'category', filterId: 'pseudo-legendary', color: '#6b46c1' },
  { id: 'legendary', name: 'Legendary', filterType: 'category', filterId: 'legendary', color: '#d69e2e' },
  { id: 'mythical', name: 'Mythical', filterType: 'category', filterId: 'mythical', color: '#ed64a6' },
];

export const BUILD_GROUP_IDS = BUILD_GROUPS.map((g) => g.id);

export function createEmptySections(): Record<string, number[]> {
  const sections: Record<string, number[]> = {};
  for (const g of BUILD_GROUPS) {
    sections[g.id] = [];
  }
  return sections;
}
