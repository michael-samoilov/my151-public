import { cn } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
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
    addToSection(targetSection, members.map((p) => p.id));
  };

  const primaryType = members[0].types[0];
  const bgColor = TYPE_COLORS[primaryType as keyof typeof TYPE_COLORS] ?? '#888';

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center rounded-md p-[1vw] md:p-1 transition-all cursor-pointer border',
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
              <ChevronRight className="w-[2.5vw] h-[2.5vw] md:w-2.5 md:h-2.5 text-muted-foreground/30 flex-shrink-0 -mx-[0.5vw] md:-mx-0.5" />
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
              {/*
                Mobile: ~11vw sprite fits 2 groups of 3 per row
                  (3 sprites × 13vw + 2 chevrons × 2vw + padding ≈ 43vw per card)
                Desktop: fixed 32px for the 420px side panel
              */}
              <img
                src={pokemon.sprite}
                alt={pokemon.name}
                className="w-[11vw] h-[11vw] md:w-8 md:h-8"
                style={{ imageRendering: 'pixelated' }}
                loading="lazy"
              />
              <span className="text-[min(2vw,8px)] md:text-[8px] font-medium capitalize truncate text-center leading-tight w-[13vw] md:w-[42px]">
                {pokemon.name}
              </span>
              <div className="flex gap-[0.5vw] md:gap-0.5 mt-[0.5vw] md:mt-0.5">
                {pokemon.types.map((t) => (
                  <span
                    key={t}
                    className="px-[1vw] md:px-1 py-[0.2vw] md:py-px rounded text-[min(1.6vw,6px)] md:text-[6px] font-semibold capitalize text-white leading-tight"
                    style={{ backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS] }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </button>
  );
}
