import type { DexSection, DexSlot } from '@/types/pokemon';

export const DEX_SECTIONS: DexSection[] = [
  { id: 'starters', name: 'Starters', startSlot: 1, endSlot: 9, description: 'Your region\'s three starter lines' },
  { id: 'early-game', name: 'Early Game', startSlot: 10, endSlot: 30, description: 'Early route encounters' },
  { id: 'mid-game', name: 'Mid Game', startSlot: 31, endSlot: 80, description: 'The bulk of your regional dex' },
  { id: 'late-game', name: 'Late Game', startSlot: 81, endSlot: 130, description: 'Stronger Pokemon, complex evolutions' },
  { id: 'endgame', name: 'Endgame & Legends', startSlot: 131, endSlot: 151, description: 'Pseudo-legendaries, legendaries, mythicals' },
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
