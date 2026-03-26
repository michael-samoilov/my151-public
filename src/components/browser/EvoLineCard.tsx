import { cn } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import { SpriteImage } from '@/components/shared/SpriteImage';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TYPE_COLORS } from '@/data/type-colors';
import { Check, ChevronRight } from 'lucide-react';

interface EvoLineCardProps {
  members: Pokemon[];
  matchedIds: Set<number>;
  assignedIds: Set<number>;
}

export function EvoLineCard({ members, matchedIds, assignedIds }: EvoLineCardProps) {
  const addToSection = usePokedexStore((s) => s.addToSection);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const allInDex = members.every((p) => assignedIds.has(p.id));

  const handleClick = () => {
    if (allInDex) return;
    const targetSection = activeSection ?? 'mid-game';
    // Always add the full line, even if some members didn't match the filter
    addToSection(targetSection, members.map((p) => p.id));
  };

  const primaryType = members[0].types[0];
  const bgColor = TYPE_COLORS[primaryType as keyof typeof TYPE_COLORS] ?? '#888';

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-0 rounded-md p-1 transition-all cursor-pointer border',
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
        const matched = matchedIds.has(pokemon.id);
        return (
          <div key={pokemon.id} className="flex items-center">
            {i > 0 && (
              <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0 -mx-0.5" />
            )}
            <div className={cn(
              'relative flex flex-col items-center',
              !matched && 'opacity-35',
            )}>
              {inDex && (
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full flex items-center justify-center z-10">
                  <Check className="w-1.5 h-1.5 text-primary-foreground" />
                </div>
              )}
              <SpriteImage src={pokemon.sprite} alt={pokemon.name} size={32} />
              <span className="text-[8px] font-medium capitalize truncate text-center leading-tight w-[42px]">
                {pokemon.name}
              </span>
            </div>
          </div>
        );
      })}
    </button>
  );
}
