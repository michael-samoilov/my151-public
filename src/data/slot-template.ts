export interface SectionDef {
  id: string;
  name: string;
  defaultSize: number;
  priority: number; // higher = keeps its default size more aggressively
  description: string;
}

export const SECTION_DEFS: SectionDef[] = [
  { id: 'starters', name: 'Starters', defaultSize: 9, priority: 3, description: 'Three starter evolution lines' },
  { id: 'early-game', name: 'Early Game', defaultSize: 31, priority: 1, description: 'Rodents, birds, bugs, Pikaclones, early routes' },
  { id: 'mid-game', name: 'Mid Game', defaultSize: 60, priority: 0, description: 'Routes, caves, gyms, diverse types' },
  { id: 'endgame', name: 'Endgame', defaultSize: 51, priority: 2, description: 'Pseudo-legendaries, legendaries, mythicals' },
];

export const SECTION_IDS = SECTION_DEFS.map((s) => s.id);

export function createEmptySections(): Record<string, number[]> {
  const sections: Record<string, number[]> = {};
  for (const def of SECTION_DEFS) {
    sections[def.id] = [];
  }
  return sections;
}

/**
 * Compute how many empty slots each section should display.
 * Higher-priority sections keep their default empty count first;
 * lower-priority sections (mid-game) absorb overflow from others.
 */
export function computeEmptySlots(sections: Record<string, number[]>): Record<string, number> {
  const totalPlaced = Object.values(sections).reduce((sum, arr) => sum + arr.length, 0);
  let remaining = Math.max(0, 151 - totalPlaced);

  // Sort by priority descending — high priority sections get empty slots first
  const sorted = [...SECTION_DEFS].sort((a, b) => b.priority - a.priority);
  const empties: Record<string, number> = {};

  for (const def of sorted) {
    const placed = (sections[def.id] ?? []).length;
    const wanted = Math.max(0, def.defaultSize - placed);
    const given = Math.min(wanted, remaining);
    empties[def.id] = given;
    remaining -= given;
  }

  // Distribute any leftover remaining to mid-game (lowest priority flex section)
  if (remaining > 0) {
    empties['mid-game'] = (empties['mid-game'] ?? 0) + remaining;
  }

  return empties;
}
