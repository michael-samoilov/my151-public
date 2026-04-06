import { useMemo, useState, useEffect } from 'react';
import { cn, displayName } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TYPE_COLORS, TYPE_TEXT_COLORS } from '@/data/type-colors';
import { Plus, ChevronRight, X, Sword, Shield } from 'lucide-react';
import { GenBadge } from '@/components/shared/GenBadge';

const SPRITE_SOURCE_PX = 96;

/**
 * Compute the largest CSS pixel size for a 96px sprite that maps to exact
 * device pixels within the sprite container. Picks the biggest integer
 * multiple of (96/dpr) that fits, so each source pixel maps to a perfect
 * N×N block of device pixels — no fractional scaling artifacts.
 *
 * The container is 11vw on mobile, 32px (md:w-8) on desktop.
 */
function useNativeSpriteSizePx(): number | undefined {
  const compute = () => {
    if (typeof window === 'undefined') return undefined;
    const dpr = window.devicePixelRatio || 1;
    // Container size in CSS pixels
    const vw = window.innerWidth / 100;
    const containerCssPx = window.innerWidth >= 768 ? 32 : 11 * vw;
    // Unit = one source pixel in CSS pixels (e.g. 32 on 3× display)
    const unit = SPRITE_SOURCE_PX / dpr;
    // How many whole multiples fit in the container?
    const multiples = Math.floor(containerCssPx / unit);
    if (multiples < 1) return undefined; // sprite larger than container — fall back to contain
    return Math.round(unit * multiples);
  };

  const [size, setSize] = useState<number | undefined>(compute);
  useEffect(() => {
    const update = () => setSize(compute());
    window.addEventListener('resize', update);
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      mq.removeEventListener('change', update);
    };
  }, []);
  return size;
}

/** Tiny pokeball icon: red-filled top half, open bottom half, center button */
function PokeballIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <path d="M1 8 A7 7 0 0 1 15 8" fill="#ef4444" stroke="#ef4444" strokeWidth="1.5" />
      <path d="M1 8 A7 7 0 0 0 15 8" fill="none" stroke="#ef4444" strokeWidth="1.5" />
      <line x1="1" y1="8" x2="15" y2="8" stroke="#ef4444" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" fill="white" stroke="#ef4444" strokeWidth="1.5" />
    </svg>
  );
}

export type EvoLineVariant = 'browser' | 'analytics';

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
  variant?: EvoLineVariant;
  showGenBadges?: boolean;
  /** Per-Pokemon offense/defense multipliers for matchup drill-downs */
  matchupInfo?: Map<number, { offense: number; defense: number }>;
}

const GRID_CLASSES: Record<number, string> = {
  3: 'grid grid-cols-3 gap-x-0 gap-y-1',
  6: 'grid grid-cols-6 gap-x-0 gap-y-1',
};

/** Renders evo line cards in an N-column grid, inserting spacers so no line wraps mid-row */
export function EvoLineGrid({ groups, assignedIds, stagedIds, onToggleStage, shinyIds, spriteOverrides, cols = DEFAULT_COLS, variant = 'browser', showGenBadges = true, matchupInfo }: EvoLineGridProps) {
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
          variant={variant}
          showGenBadges={showGenBadges}
          matchupInfo={matchupInfo}
        />
      );
      col = (col + size) % cols;
    }

    return result;
  }, [groups, assignedIds, stagedIds, onToggleStage, shinyIds, spriteOverrides, cols, matchupInfo]);

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
  variant?: EvoLineVariant;
  showGenBadges?: boolean;
  matchupInfo?: Map<number, { offense: number; defense: number }>;
}

function formatMult(v: number): string {
  if (v === 0) return '0';
  if (v === 0.125) return '0';
  if (v === 0.25) return '¼';
  if (v === 0.5) return '½';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

/** Compute how many doublings a multiplier contributes to the matchup score.
 *  Offense: log2(value), Defense: -log2(value). Immunities (0) clamped to 0.125 = ±3. */
function doublings(value: number, isDefense: boolean): number {
  const clamped = Math.max(value, 0.125);
  const d = Math.round(Math.log2(clamped));
  return isDefense ? -d : d;
}

function formatDoublings(n: number): string {
  // Use Unicode minus (U+2212) which is same width as '+' for tabular alignment
  return n >= 0 ? `+${n}` : `\u2212${Math.abs(n)}`;
}

export function EvoLineCard({ members, matchedIds, assignedIds, stagedIds, onToggleStage, shinyIds, spriteOverrides, variant = 'browser', showGenBadges = true, matchupInfo }: EvoLineCardProps) {
  const removeEvoLine = usePokedexStore((s) => s.removeEvoLine);
  const sections = usePokedexStore((s) => s.sections);
  const allInDex = members.every((p) => assignedIds.has(p.id));
  const nativeSpriteSizePx = useNativeSpriteSizePx();

  const doRemove = () => {
    const firstId = members[0].id;
    for (const [sectionId, ids] of Object.entries(sections)) {
      if (ids.includes(firstId)) {
        removeEvoLine(sectionId, firstId);
        break;
      }
    }
  };

  const handleClick = () => {
    if (allInDex && variant === 'browser') {
      doRemove();
    } else if (!allInDex) {
      onToggleStage(members.map((p) => p.id));
    }
  };

  const handleRemoveButton = (e: React.MouseEvent) => {
    e.stopPropagation();
    doRemove();
  };

  const primaryType = members[0].types[0];
  const bgColor = TYPE_COLORS[primaryType as keyof typeof TYPE_COLORS] ?? '#888';

  // Generation of the line's root member — used to show gen badges on
  // members from a different generation (cross-gen evolutions)
  const lineGen = members[0].generation;

  return (
    <>
      {members.map((pokemon, i) => {
        const inDex = assignedIds.has(pokemon.id);
        const matched = matchedIds.has(pokemon.id);
        const isFirst = i === 0;
        const isLast = i === members.length - 1;
        const showGenBadge = showGenBadges && pokemon.generation !== lineGen;

        return (
          <div key={pokemon.id} className="relative px-[3px] md:px-[2px] overflow-visible">
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
            {inDex && variant === 'analytics' && (
              <button
                onClick={handleRemoveButton}
                className="absolute top-[1px] right-[4px] md:right-1 w-[3vw] h-[3vw] md:w-3.5 md:h-3.5 rounded-full bg-destructive/60 md:bg-destructive/80 text-white flex items-center justify-center z-10"
              >
                <X className="w-[1.5vw] h-[1.5vw] md:w-2 md:h-2" />
              </button>
            )}
            {inDex && variant === 'browser' && (
              <div className="absolute top-[3px] right-[6px] md:right-1.5 -translate-y-[0.5px] w-3 h-3 z-10">
                <PokeballIcon className="w-3 h-3" />
              </div>
            )}
            {!inDex && stagedIds.has(pokemon.id) && (
              <div className="absolute top-[3px] right-[6px] md:right-1.5 -translate-y-[0.5px] w-3 h-3 bg-primary rounded-full flex items-center justify-center z-10">
                <Plus className="w-1.5 h-1.5 text-primary-foreground" />
              </div>
            )}
            <div
              role="button"
              tabIndex={0}
              onClick={handleClick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
              className={cn(
                `relative flex flex-col items-center ${variant === 'analytics' ? 'pt-[0.5vw] pb-[1vw]' : 'py-[1vw]'} md:py-1 transition-all cursor-pointer w-full`,
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
                <div
                  className={variant === 'analytics'
                    ? "w-[11vw] md:w-8 md:h-8"
                    : "w-[11vw] h-[11vw] md:w-8 md:h-8"
                  }
                  style={{
                    backgroundImage: `url(${spriteOverrides?.[pokemon.id]
                      ?? (shinyIds?.has(pokemon.id)
                        ? pokemon.sprite.replace('/pokemon/', '/pokemon/shiny/')
                        : pokemon.sprite)})`,
                    backgroundSize: variant === 'analytics' && nativeSpriteSizePx
                      ? `${nativeSpriteSizePx}px ${nativeSpriteSizePx}px`
                      : 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    imageRendering: 'pixelated',
                    ...(variant === 'analytics' && nativeSpriteSizePx
                      ? { height: `${nativeSpriteSizePx}px` }
                      : {}),
                  }}
                  role="img"
                  aria-label={pokemon.name}
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
                {matchupInfo?.has(pokemon.id) && (() => {
                  const info = matchupInfo.get(pokemon.id)!;
                  const offD = doublings(info.offense, false);
                  const defD = doublings(info.defense, true);
                  const dColor = (d: number) => d > 0 ? 'text-emerald-600 dark:text-emerald-400' : d < 0 ? 'text-red-500 dark:text-red-400' : '';
                  return (
                    <div className="grid mt-[0.3vw] md:mt-0.5 pb-[1px] text-[min(1.5vw,6px)] md:text-[6px] font-semibold" style={{ fontVariantNumeric: 'tabular-nums', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', rowGap: '0px', columnGap: 'min(0.6vw, 2px)' }}>
                      <span className="justify-self-end leading-none translate-y-[0.5px]">{formatMult(info.offense)}×</span>
                      <Sword className="w-[2vw] h-[2vw] md:w-2.5 md:h-2.5 block" />
                      <span className="justify-self-start leading-none translate-y-[0.5px]">(<span className={dColor(offD)}>{formatDoublings(offD)}</span>)</span>
                      <span className="justify-self-end leading-none translate-y-[0.5px]">{formatMult(info.defense)}×</span>
                      <Shield className="w-[2vw] h-[2vw] md:w-2.5 md:h-2.5 block" />
                      <span className="justify-self-start leading-none translate-y-[0.5px]">(<span className={dColor(defD)}>{formatDoublings(defD)}</span>)</span>
                    </div>
                  );
                })()}
              </div>
            </div>
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
