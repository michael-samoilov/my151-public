import type { DexSection, DexSlot } from '@/types/pokemon';

export const DEX_SECTIONS: DexSection[] = [
  { id: 'starters', name: 'Starters', startSlot: 1, endSlot: 9, description: 'Your region\'s three starter lines' },
  { id: 'early-routes', name: 'Early Routes', startSlot: 10, endSlot: 18, description: 'Rodent, bird, and bug lines' },
  { id: 'early-encounters', name: 'Early Encounters', startSlot: 19, endSlot: 25, description: 'Pikaclone, early normals' },
  { id: 'caves-water', name: 'Caves & Water', startSlot: 26, endSlot: 40, description: 'Cave dwellers and fishing Pokemon' },
  { id: 'mid-game', name: 'Mid-Game Pokemon', startSlot: 41, endSlot: 70, description: 'Diverse types, multi-stage lines' },
  { id: 'fossils-gifts', name: 'Fossils & Gifts', startSlot: 71, endSlot: 85, description: 'Fossil revives, gift Pokemon, trade evos' },
  { id: 'late-game', name: 'Late-Game Pokemon', startSlot: 86, endSlot: 120, description: 'Strong types, complex evolutions' },
  { id: 'powerhouses', name: 'Powerhouses', startSlot: 121, endSlot: 139, description: 'Dragons, pseudo-legendaries, rare finds' },
  { id: 'pseudo-legendary', name: 'Pseudo-Legendary', startSlot: 140, endSlot: 144, description: 'The pseudo-legendary line + late rarities' },
  { id: 'legendary-trio', name: 'Legendary Trio', startSlot: 145, endSlot: 147, description: 'Your region\'s legendary trio' },
  { id: 'box-legendaries', name: 'Box Legendaries', startSlot: 148, endSlot: 149, description: 'Cover legendaries' },
  { id: 'mythicals', name: 'Mythicals', startSlot: 150, endSlot: 151, description: 'Mythical event Pokemon' },
];

const SLOT_ARCHETYPE_SUGGESTIONS: Record<number, string> = {
  1: 'grass-starter', 2: 'grass-starter', 3: 'grass-starter',
  4: 'fire-starter', 5: 'fire-starter', 6: 'fire-starter',
  7: 'water-starter', 8: 'water-starter', 9: 'water-starter',
  10: 'early-rodent', 11: 'early-rodent', 12: 'early-rodent',
  13: 'early-bird', 14: 'early-bird', 15: 'early-bird',
  16: 'early-bug', 17: 'early-bug', 18: 'early-bug',
  19: 'pikachu-clone', 20: 'pikachu-clone',
  21: 'early-normal', 22: 'early-normal', 23: 'early-normal',
  24: 'early-normal', 25: 'early-normal',
  26: 'cave-pokemon', 27: 'cave-pokemon', 28: 'cave-pokemon',
  29: 'cave-pokemon', 30: 'cave-pokemon', 31: 'cave-pokemon', 32: 'cave-pokemon',
  33: 'fishing-pokemon', 34: 'fishing-pokemon', 35: 'fishing-pokemon',
  36: 'fishing-pokemon', 37: 'fishing-pokemon', 38: 'fishing-pokemon',
  39: 'elemental-trio', 40: 'elemental-trio',
  71: 'fossil', 72: 'fossil', 73: 'fossil', 74: 'fossil', 75: 'fossil', 76: 'fossil',
  77: 'gift-pokemon', 78: 'gift-pokemon', 79: 'gift-pokemon',
  80: 'gift-pokemon', 81: 'gift-pokemon', 82: 'gift-pokemon',
  140: 'pseudo-legendary', 141: 'pseudo-legendary', 142: 'pseudo-legendary',
  143: 'pseudo-legendary', 144: 'pseudo-legendary',
  145: 'legendary-trio', 146: 'legendary-trio', 147: 'legendary-trio',
  148: 'box-legendary', 149: 'box-legendary',
  150: 'mythical', 151: 'mythical',
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
