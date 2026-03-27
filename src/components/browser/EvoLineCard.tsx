import { cn } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TYPE_COLORS } from '@/data/type-colors';
import { Check } from 'lucide-react';

interface EvoLineCardProps {
  members: Pokemon[];
  matchedIds: Set<number>;
  assignedIds: Set<number>;
  shinyIds?: Set<number>;
  spriteOverrides?: Record<number, string>;
}

export function EvoLineCard({ members, matchedIds, assignedIds, shinyIds, spriteOverrides }: EvoLineCardProps) {
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
  const bg = `linear-gradient(135deg, ${bgColor}12, ${bgColor}05)`;

  return (
    <>
      {members.map((pokemon, i) => {
        const inDex = assignedIds.has(pokemon.id);
        const matched = matchedIds.has(pokemon.id);
        const isFirst = i === 0;
        const isLast = i === members.length - 1;

        return (
          <button
            key={pokemon.id}
            onClick={handleClick}
            className={cn(
              'flex flex-col items-center py-[1vw] md:py-1 transition-all cursor-pointer',
              // Border & rounding logic for connected evo line appearance
              'border-y border-r',
              isFirst && 'border-l rounded-l-md',
              isLast && 'rounded-r-md',
              allInDex
                ? 'opacity-40 border-primary/30'
                : 'border-border hover:border-primary/50',
            )}
            style={{ background: bg, outline: '1px solid rgba(0,255,0,0.5)' }}
          >
            <div className={cn(
              'relative flex flex-col items-center w-full',
              !matched && 'opacity-35',
            )}>
              {inDex && (
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full flex items-center justify-center z-10">
                  <Check className="w-1.5 h-1.5 text-primary-foreground" />
                </div>
              )}
              <img
                src={spriteOverrides?.[pokemon.id]
                  ?? (shinyIds?.has(pokemon.id)
                    ? pokemon.sprite.replace('/pokemon/', '/pokemon/shiny/')
                    : pokemon.sprite)}
                alt={pokemon.name}
                className="w-[11vw] h-[11vw] md:w-8 md:h-8"
                style={{ imageRendering: 'pixelated' }}
                loading="lazy"
              />
              <span className="text-[min(2vw,8px)] md:text-[8px] font-medium capitalize truncate text-center leading-tight w-full px-[0.5vw] md:px-0.5">
                {pokemon.name}
              </span>
              <div className="flex gap-[0.5vw] md:gap-0.5 mt-[0.5vw] md:mt-0.5 justify-center">
                {pokemon.types.map((t) => (
                  <span
                    key={t}
                    className="w-[6vw] md:w-5 py-[0.2vw] md:py-px rounded text-[min(1.5vw,5px)] md:text-[5px] font-semibold capitalize text-white leading-tight text-center truncate"
                    style={{ backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS] }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </>
  );
}
