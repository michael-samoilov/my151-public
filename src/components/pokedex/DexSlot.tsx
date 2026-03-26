import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { getPokemonById } from '@/hooks/usePokemonData';
import { SpriteImage } from '@/components/shared/SpriteImage';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { usePokedexStore } from '@/store/usePokedexStore';
import type { DexSlot as DexSlotType } from '@/types/pokemon';
import { X } from 'lucide-react';

// Only starter slots get visible labels
const STARTER_LABELS: Record<number, { label: string; archetype: string }> = {
  1: { label: 'Starter 1', archetype: 'grass-starter' },
  2: { label: 'Starter 1', archetype: 'grass-starter' },
  3: { label: 'Starter 1', archetype: 'grass-starter' },
  4: { label: 'Starter 2', archetype: 'fire-starter' },
  5: { label: 'Starter 2', archetype: 'fire-starter' },
  6: { label: 'Starter 2', archetype: 'fire-starter' },
  7: { label: 'Starter 3', archetype: 'water-starter' },
  8: { label: 'Starter 3', archetype: 'water-starter' },
  9: { label: 'Starter 3', archetype: 'water-starter' },
};

interface DexSlotProps {
  slot: DexSlotType;
  isSelected: boolean;
  onSelect: () => void;
}

export function DexSlotComponent({ slot, isSelected, onSelect }: DexSlotProps) {
  const removePokemon = usePokedexStore((s) => s.removePokemon);
  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const setArchetypeFilter = usePokedexStore((s) => s.setArchetypeFilter);
  const pokemon = slot.pokemonId ? getPokemonById(slot.pokemonId) : null;
  const starterInfo = STARTER_LABELS[slot.slotNumber];

  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${slot.slotNumber}`,
    data: { slotNumber: slot.slotNumber },
  });

  const handleClick = () => {
    onSelect();
    if (!slot.pokemonId) {
      // Auto-filter to the relevant archetype for starter slots
      if (starterInfo) {
        setArchetypeFilter(starterInfo.archetype);
      }
      setMobileBrowserOpen(true);
    }
  };

  return (
    <div
      ref={setNodeRef}
      onClick={handleClick}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border-2 transition-all cursor-pointer min-h-[100px] p-1',
        isOver && 'border-primary bg-primary/10 scale-105',
        isSelected && !isOver && 'border-primary ring-2 ring-primary/30',
        pokemon ? 'bg-card border-border' : 'bg-muted/30 border-dashed border-muted-foreground/30',
        !isOver && !isSelected && pokemon && 'hover:border-primary/50',
        !isOver && !isSelected && !pokemon && 'hover:border-muted-foreground/50'
      )}
    >
      {/* Slot number */}
      <span className="absolute top-0.5 left-1 text-[10px] text-muted-foreground font-mono">
        #{String(slot.slotNumber).padStart(3, '0')}
      </span>

      {pokemon ? (
        <>
          <SpriteImage src={pokemon.sprite} alt={pokemon.name} size={48} />
          <span className="text-xs font-medium capitalize truncate w-full text-center">
            {pokemon.name}
          </span>
          <div className="flex gap-0.5 mt-0.5">
            {pokemon.types.map((t) => (
              <TypeBadge key={t} type={t} size="sm" />
            ))}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removePokemon(slot.slotNumber);
            }}
            className="absolute top-0.5 right-0.5 rounded-full p-0.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1 py-2">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <span className="text-muted-foreground text-lg">?</span>
          </div>
          {starterInfo && (
            <span className="text-[9px] text-muted-foreground text-center leading-tight px-1">
              {starterInfo.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
