import { usePokedexStore } from '@/store/usePokedexStore';
import { DEX_SECTIONS } from '@/data/slot-template';
import { DexSlotComponent } from './DexSlot';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export function PokedexGrid() {
  const slots = usePokedexStore((s) => s.slots);
  const selectedSlot = usePokedexStore((s) => s.selectedSlot);
  const setSelectedSlot = usePokedexStore((s) => s.setSelectedSlot);
  const clearAll = usePokedexStore((s) => s.clearAll);
  const filledCount = slots.filter((s) => s.pokemonId !== null).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="text-lg font-bold">Your Pokedex</h2>
          <p className="text-sm text-muted-foreground">
            {filledCount}/151 slots filled
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Clear
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {DEX_SECTIONS.map((section) => {
              const sectionSlots = slots.filter(
                (s) => s.slotNumber >= section.startSlot && s.slotNumber <= section.endSlot
              );
              const filled = sectionSlots.filter((s) => s.pokemonId !== null).length;

              return (
                <div key={section.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {section.name}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      ({filled}/{sectionSlots.length})
                    </span>
                    <span className="text-xs text-muted-foreground italic">
                      {section.description}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                    {sectionSlots.map((slot) => (
                      <DexSlotComponent
                        key={slot.slotNumber}
                        slot={slot}
                        isSelected={selectedSlot === slot.slotNumber}
                        onSelect={() =>
                          setSelectedSlot(
                            selectedSlot === slot.slotNumber ? null : slot.slotNumber
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
