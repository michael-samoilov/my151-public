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
  // Starters (category)
  { id: 'starter', name: 'Starters', filterType: 'category', filterId: 'starter', color: '#48bb78' },

  // Early route archetypes
  { id: 'early-bird', name: 'Early Route Bird', filterType: 'archetype', filterId: 'early-bird', color: '#a98ff3' },
  { id: 'early-bug', name: 'Early Bug', filterType: 'archetype', filterId: 'early-bug', color: '#a6b91a' },
  { id: 'early-rodent', name: 'Early Route Mammal', filterType: 'archetype', filterId: 'early-rodent', color: '#a8a77a' },
  { id: 'pikachu-clone', name: 'Pikaclone', filterType: 'archetype', filterId: 'pikachu-clone', color: '#f7d02c' },
  { id: 'early-normal', name: 'Domestic', filterType: 'archetype', filterId: 'early-normal', color: '#a8a77a' },

  // Geography
  { id: 'forest', name: 'Forest', filterType: 'archetype', filterId: 'forest', color: '#2d6a4f' },
  { id: 'cave-pokemon', name: 'Cave', filterType: 'archetype', filterId: 'cave-pokemon', color: '#b6a136' },
  { id: 'beach', name: 'Beach', filterType: 'archetype', filterId: 'beach', color: '#e9c46a' },
  { id: 'fishing-pokemon', name: 'Fishing', filterType: 'archetype', filterId: 'fishing-pokemon', color: '#6390f0' },
  { id: 'ocean', name: 'Ocean', filterType: 'archetype', filterId: 'ocean', color: '#006494' },
  { id: 'desert', name: 'Desert', filterType: 'archetype', filterId: 'desert', color: '#dda15e' },
  { id: 'volcanic', name: 'Volcanic', filterType: 'archetype', filterId: 'volcanic', color: '#d62828' },
  { id: 'tundra', name: 'Tundra', filterType: 'archetype', filterId: 'tundra', color: '#7ec8e3' },

  // Thematic archetypes
  { id: 'elemental-trio', name: 'Elemental Trio/Duo', filterType: 'archetype', filterId: 'elemental-trio', color: '#ee8130' },
  { id: 'industrial', name: 'Industrial/Artificial', filterType: 'archetype', filterId: 'industrial', color: '#b7b7ce' },
  { id: 'mimic', name: 'Mimic/Disguise', filterType: 'archetype', filterId: 'mimic', color: '#735797' },
  { id: 'evil-team', name: 'Evil Team', filterType: 'archetype', filterId: 'evil-team', color: '#705746' },
  { id: 'rivalry-pair', name: 'Rivalry Pair', filterType: 'archetype', filterId: 'rivalry-pair', color: '#c22e28' },
  { id: 'version-exclusive', name: 'Version Exclusive', filterType: 'archetype', filterId: 'version-exclusive', color: '#737373' },

  // Classifications
  { id: 'fossil', name: 'Fossil', filterType: 'category', filterId: 'fossil', color: '#a0855b' },
  { id: 'pseudo-legendary', name: 'Pseudo-Legendary', filterType: 'category', filterId: 'pseudo-legendary', color: '#6b46c1' },
  { id: 'legendary', name: 'Legendary', filterType: 'category', filterId: 'legendary', color: '#d69e2e' },
  { id: 'mythical', name: 'Mythical', filterType: 'category', filterId: 'mythical', color: '#ed64a6' },

  // Catch-all
  { id: 'other', name: 'Other', filterType: null, filterId: null, color: '#888888' },
];

export const BUILD_GROUP_IDS = BUILD_GROUPS.map((g) => g.id);

export function createEmptySections(): Record<string, number[]> {
  const sections: Record<string, number[]> = {};
  for (const g of BUILD_GROUPS) {
    sections[g.id] = [];
  }
  return sections;
}

// Keep old exports for backward compatibility during migration
export interface SectionDef {
  id: string;
  name: string;
  defaultSize: number;
  priority: number;
  description: string;
}

export const SECTION_DEFS = BUILD_GROUPS;

export function computeEmptySlots(_sections: Record<string, number[]>): Record<string, number> {
  return {};
}
