import { cn } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import { SpriteImage } from '@/components/shared/SpriteImage';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TYPE_COLORS } from '@/data/type-colors';
import { Check } from 'lucide-react';

interface PokemonTileProps {
  pokemon: Pokemon;
  isInDex: boolean;
}

export function PokemonTile({ pokemon, isInDex }: PokemonTileProps) {
  const assignToNextEmpty = usePokedexStore((s) => s.assignToNextEmpty);
  const selectedSlot = usePokedexStore((s) => s.selectedSlot);
  const assignPokemon = usePokedexStore((s) => s.assignPokemon);

  const handleClick = () => {
    if (isInDex) return;
    if (selectedSlot !== null) {
      assignPokemon(selectedSlot, pokemon.id);
    } else {
      assignToNextEmpty(pokemon.id);
    }
  };

  const primaryType = pokemon.types[0];
  const bgColor = TYPE_COLORS[primaryType as keyof typeof TYPE_COLORS] ?? '#888';

  return (
    <button
      onClick={handleClick}
      className={cn(
        'relative flex flex-col items-center rounded-lg p-1.5 transition-all cursor-pointer border',
        isInDex
          ? 'opacity-40 border-primary/30'
          : 'border-transparent hover:border-primary/50 hover:shadow-md'
      )}
      style={{
        background: `linear-gradient(135deg, ${bgColor}18, ${bgColor}08)`,
      }}
    >
      {isInDex && (
        <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-primary-foreground" />
        </div>
      )}
      <SpriteImage src={pokemon.sprite} alt={pokemon.name} size={52} />
      <span className="text-[10px] font-medium capitalize truncate w-full text-center leading-tight">
        {pokemon.name}
      </span>
      <div className="flex gap-0.5 mt-0.5">
        {pokemon.types.map((t) => (
          <span
            key={t}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS] }}
          />
        ))}
      </div>
    </button>
  );
}
