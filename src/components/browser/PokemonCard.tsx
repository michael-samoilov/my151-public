import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import { SpriteImage } from '@/components/shared/SpriteImage';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { usePokedexStore } from '@/store/usePokedexStore';
import { Check } from 'lucide-react';

interface PokemonCardProps {
  pokemon: Pokemon;
  isInDex: boolean;
}

export function PokemonCard({ pokemon, isInDex }: PokemonCardProps) {
  const assignToNextEmpty = usePokedexStore((s) => s.assignToNextEmpty);
  const selectedSlot = usePokedexStore((s) => s.selectedSlot);
  const assignPokemon = usePokedexStore((s) => s.assignPokemon);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pokemon-${pokemon.id}`,
    data: { pokemonId: pokemon.id },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 1000 }
    : undefined;

  const handleClick = () => {
    if (isInDex) return;
    if (selectedSlot !== null) {
      assignPokemon(selectedSlot, pokemon.id);
    } else {
      const archetype = pokemon.archetypes[0];
      assignToNextEmpty(pokemon.id, archetype);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer',
        isDragging && 'opacity-50 shadow-lg',
        isInDex
          ? 'bg-primary/5 border-primary/20 opacity-60'
          : 'bg-card border-border hover:border-primary/50 hover:shadow-sm'
      )}
    >
      <SpriteImage src={pokemon.sprite} alt={pokemon.name} size={40} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground font-mono">
            #{String(pokemon.id).padStart(3, '0')}
          </span>
          <span className="text-sm font-medium capitalize truncate">
            {pokemon.name}
          </span>
          {isInDex && <Check className="w-3 h-3 text-primary ml-auto flex-shrink-0" />}
        </div>
        <div className="flex gap-1 mt-0.5">
          {pokemon.types.map((t) => (
            <TypeBadge key={t} type={t} size="sm" />
          ))}
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-mono">{pokemon.bst}</span>
    </div>
  );
}
