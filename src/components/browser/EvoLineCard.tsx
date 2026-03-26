import { cn } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import { SpriteImage } from '@/components/shared/SpriteImage';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TYPE_COLORS } from '@/data/type-colors';
import { Check, ChevronRight } from 'lucide-react';

interface EvoLineCardProps {
  members: Pokemon[];
  assignedIds: Set<number>;
}

export function EvoLineCard({ members, assignedIds }: EvoLineCardProps) {
  const assignEvoLine = usePokedexStore((s) => s.assignEvoLine);
  const allInDex = members.every((p) => assignedIds.has(p.id));

  const handleClick = () => {
    if (allInDex) return;
    assignEvoLine(members.map((p) => p.id));
  };

  const primaryType = members[0].types[0];
  const bgColor = TYPE_COLORS[primaryType as keyof typeof TYPE_COLORS] ?? '#888';

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-center gap-1 rounded-lg p-2 transition-all cursor-pointer border',
        allInDex
          ? 'opacity-40 border-primary/30'
          : 'border-border hover:border-primary/50 hover:shadow-md'
      )}
      style={{
        background: `linear-gradient(135deg, ${bgColor}12, ${bgColor}05)`,
      }}
    >
      {members.map((pokemon, i) => {
        const inDex = assignedIds.has(pokemon.id);
        return (
          <div key={pokemon.id} className="flex items-center">
            {i > 0 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 -mx-0.5" />
            )}
            <div className="relative flex flex-col items-center min-w-0">
              {inDex && (
                <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center z-10">
                  <Check className="w-2 h-2 text-primary-foreground" />
                </div>
              )}
              <SpriteImage src={pokemon.sprite} alt={pokemon.name} size={44} />
              <span className="text-[9px] font-medium capitalize truncate w-full text-center leading-tight max-w-[56px]">
                {pokemon.name}
              </span>
              <div className="flex gap-0.5 mt-0.5">
                {pokemon.types.map((t) => (
                  <span
                    key={t}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS] }}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </button>
  );
}
