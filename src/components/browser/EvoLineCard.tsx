import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TYPE_COLORS } from '@/data/type-colors';
import { Check, Plus, ChevronRight } from 'lucide-react';

const COLS = 6;

// ---------- Grid wrapper that prevents evo line splitting ----------

interface EvoLineGroup {
  key: string | number;
  members: Pokemon[];
  matchedIds: Set<number>;
}

interface EvoLineGridProps {
  groups: EvoLineGroup[];
  assignedIds: Set<number>;
  stagedIds: Set<number>;
  onToggleStage: (memberIds: number[]) => void;
  shinyIds?: Set<number>;
  spriteOverrides?: Record<number, string>;
}

/** Renders evo line cards in a 6-column grid, inserting spacers so no line wraps mid-row */
export function EvoLineGrid({ groups, assignedIds, stagedIds, onToggleStage, shinyIds, spriteOverrides }: EvoLineGridProps) {
  const elements = useMemo(() => {
    const result: React.ReactNode[] = [];
    let col = 0; // 0-based current column position

    for (const group of groups) {
      const size = group.members.length;
      // If this line won't fit in the remaining columns, pad and wrap
      if (col > 0 && (col + size > COLS)) {
        const spacers = COLS - col;
        for (let s = 0; s < spacers; s++) {
          result.push(<div key={`spacer-${result.length}`} />);
        }
        col = 0;
      }
      result.push(
        <EvoLineCard
          key={group.key}
          members={group.members}
          matchedIds={group.matchedIds}
          assignedIds={assignedIds}
          stagedIds={stagedIds}
          onToggleStage={onToggleStage}
          shinyIds={shinyIds}
          spriteOverrides={spriteOverrides}
        />
      );
      col = (col + size) % COLS;
    }

    return result;
  }, [groups, assignedIds, stagedIds, onToggleStage, shinyIds, spriteOverrides]);

  return (
    <div
      className="grid grid-cols-6 gap-x-0 gap-y-1"
    >
      {elements}
    </div>
  );
}

// ---------- Single evo line card (renders N cells) ----------

interface EvoLineCardProps {
  members: Pokemon[];
  matchedIds: Set<number>;
  assignedIds: Set<number>;
  stagedIds: Set<number>;
  onToggleStage: (memberIds: number[]) => void;
  shinyIds?: Set<number>;
  spriteOverrides?: Record<number, string>;
}

export function EvoLineCard({ members, matchedIds, assignedIds, stagedIds, onToggleStage, shinyIds, spriteOverrides }: EvoLineCardProps) {
  const removeEvoLine = usePokedexStore((s) => s.removeEvoLine);
  const sections = usePokedexStore((s) => s.sections);
  const allInDex = members.every((p) => assignedIds.has(p.id));

  const handleClick = () => {
    if (allInDex) {
      // Already in dex: remove immediately
      const firstId = members[0].id;
      for (const [sectionId, ids] of Object.entries(sections)) {
        if (ids.includes(firstId)) {
          removeEvoLine(sectionId, firstId);
          break;
        }
      }
    } else {
      // Toggle staging
      onToggleStage(members.map((p) => p.id));
    }
  };

  const primaryType = members[0].types[0];
  const bgColor = TYPE_COLORS[primaryType as keyof typeof TYPE_COLORS] ?? '#888';

  return (
    <>
      {members.map((pokemon, i) => {
        const inDex = assignedIds.has(pokemon.id);
        const matched = matchedIds.has(pokemon.id);
        const isFirst = i === 0;
        const isLast = i === members.length - 1;

        return (
          <div key={pokemon.id} className="relative px-[3px] md:px-[2px]">
            {/* Background + border spanning the evo line */}
            <div
              className={cn(
                'absolute inset-y-0 border-t border-b',
                isFirst ? 'left-[3px] md:left-[2px] rounded-l-md border-l' : 'left-0',
                isLast ? 'right-[3px] md:right-[2px] rounded-r-md border-r' : 'right-0',
                'border-border',
              )}
              style={{ backgroundColor: `${bgColor}10` }}
            />
            {inDex && (
              <div className="absolute top-[3px] right-[6px] md:right-1.5 -translate-y-[0.5px] w-3 h-3 bg-primary rounded-full flex items-center justify-center z-10">
                <Check className="w-1.5 h-1.5 text-primary-foreground" />
              </div>
            )}
            {!inDex && stagedIds.has(pokemon.id) && (
              <div className="absolute top-[3px] right-[6px] md:right-1.5 -translate-y-[0.5px] w-3 h-3 bg-primary rounded-full flex items-center justify-center z-10">
                <Plus className="w-1.5 h-1.5 text-primary-foreground" />
              </div>
            )}
            <button
              onClick={handleClick}
              className={cn(
                'relative flex flex-col items-center py-[1vw] md:py-1 transition-all cursor-pointer w-full',
              )}
            >
              <div className={cn(
                'relative flex flex-col items-center w-full',
                !matched && 'opacity-35',
              )}>
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
            {/* Chevron between evo line members */}
            {!isLast && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10">
                <ChevronRight className="w-[2vw] h-[2vw] md:w-2.5 md:h-2.5 text-muted-foreground/60" />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
