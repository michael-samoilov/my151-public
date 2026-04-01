import { useMemo } from 'react';
import { cn, displayName } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TYPE_COLORS, TYPE_TEXT_COLORS } from '@/data/type-colors';
import { Plus, ChevronRight, X } from 'lucide-react';
import { GenBadge } from '@/components/shared/GenBadge';

const DEFAULT_COLS = 6;

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
  cols?: number;
}

const GRID_CLASSES: Record<number, string> = {
  3: 'grid grid-cols-3 gap-x-0 gap-y-1',
  6: 'grid grid-cols-6 gap-x-0 gap-y-1',
};

/** Renders evo line cards in an N-column grid, inserting spacers so no line wraps mid-row */
export function EvoLineGrid({ groups, assignedIds, stagedIds, onToggleStage, shinyIds, spriteOverrides, cols = DEFAULT_COLS }: EvoLineGridProps) {
  const elements = useMemo(() => {
    const result: React.ReactNode[] = [];
    let col = 0; // 0-based current column position

    for (const group of groups) {
      const size = group.members.length;
      // If this line won't fit in the remaining columns, pad and wrap
      if (col > 0 && (col + size > cols)) {
        const spacers = cols - col;
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
      col = (col + size) % cols;
    }

    return result;
  }, [groups, assignedIds, stagedIds, onToggleStage, shinyIds, spriteOverrides, cols]);

  return (
    <div className={GRID_CLASSES[cols] ?? `grid gap-x-0 gap-y-1`} style={GRID_CLASSES[cols] ? undefined : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
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
    if (!allInDex) {
      onToggleStage(members.map((p) => p.id));
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    const firstId = members[0].id;
    for (const [sectionId, ids] of Object.entries(sections)) {
      if (ids.includes(firstId)) {
        removeEvoLine(sectionId, firstId);
        break;
      }
    }
  };

  const primaryType = members[0].types[0];
  const bgColor = TYPE_COLORS[primaryType as keyof typeof TYPE_COLORS] ?? '#888';

  // Generation(s) of the matched members — used to decide if muted members
  // are muted because of a generation difference vs some other reason
  const matchedGens = useMemo(() => {
    const gens = new Set<number>();
    for (const m of members) {
      if (matchedIds.has(m.id)) gens.add(m.generation);
    }
    return gens;
  }, [members, matchedIds]);

  return (
    <>
      {members.map((pokemon, i) => {
        const inDex = assignedIds.has(pokemon.id);
        const matched = matchedIds.has(pokemon.id);
        const isFirst = i === 0;
        const isLast = i === members.length - 1;
        const showGenBadge = !matched && matchedGens.size > 0 && !matchedGens.has(pokemon.generation);

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
              <button
                onClick={handleRemove}
                className="absolute top-[1px] right-[4px] md:right-1 w-[3vw] h-[3vw] md:w-3.5 md:h-3.5 rounded-full bg-destructive/60 md:bg-destructive/80 text-white flex items-center justify-center z-10"
              >
                <X className="w-[1.5vw] h-[1.5vw] md:w-2 md:h-2" />
              </button>
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
                {showGenBadge && (
                  <GenBadge
                    gen={pokemon.generation}
                    className="absolute top-0 left-[6px] md:left-1 w-[2.5vw] h-[2.5vw] md:w-3 md:h-3 z-10"
                  />
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
                  {displayName(pokemon.name)}
                </span>
                <div className="flex gap-[0.5vw] md:gap-0.5 mt-[0.5vw] md:mt-0.5 justify-center">
                  {pokemon.types.map((t) => (
                    <span
                      key={t}
                      className="w-[6vw] md:w-5 py-[0.2vw] md:py-px rounded text-[min(1.5vw,5px)] md:text-[5px] font-semibold capitalize leading-tight text-center truncate flex items-center justify-center"
                      style={{ backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS], color: TYPE_TEXT_COLORS[t as keyof typeof TYPE_TEXT_COLORS] }}
                    >
                      <span className="translate-y-[0.5px]">{t}</span>
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
