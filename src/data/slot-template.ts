import type { DexSection, DexSlot } from '@/types/pokemon';

export const DEX_SECTIONS: DexSection[] = [
  { id: 'starters', name: 'Starters', startSlot: 1, endSlot: 9, description: 'Three starter evolution lines' },
  { id: 'early-game', name: 'Early Game', startSlot: 10, endSlot: 40, description: 'Rodents, birds, bugs, Pikaclones, early routes' },
  { id: 'mid-game', name: 'Mid Game', startSlot: 41, endSlot: 100, description: 'Routes, caves, gyms, diverse types' },
  { id: 'endgame', name: 'Endgame', startSlot: 101, endSlot: 151, description: 'Pseudo-legendaries, legendaries, mythicals' },
];

// Only suggest archetypes for the most structurally obvious slots.
// Everything else is free-form — fill them however you like.
const SLOT_ARCHETYPE_SUGGESTIONS: Record<number, string> = {
  // Starter lines — the one truly universal convention
  1: 'grass-starter', 2: 'grass-starter', 3: 'grass-starter',
  4: 'fire-starter', 5: 'fire-starter', 6: 'fire-starter',
  7: 'water-starter', 8: 'water-starter', 9: 'water-starter',
};

export function getSectionForSlot(slotNumber: number): DexSection | undefined {
  return DEX_SECTIONS.find(s => slotNumber >= s.startSlot && slotNumber <= s.endSlot);
}

export function createDefaultSlots(): DexSlot[] {
  return Array.from({ length: 151 }, (_, i) => {
    const slotNumber = i + 1;
    const section = getSectionForSlot(slotNumber);
    return {
      slotNumber,
      sectionId: section?.id ?? 'mid-game',
      suggestedArchetype: SLOT_ARCHETYPE_SUGGESTIONS[slotNumber] ?? null,
      pokemonId: null,
    };
  });
}
