import { useMemo } from 'react';
import { cn, displayName } from '@/lib/utils';
import { usePixelPerfectSprite } from '@/lib/usePixelPerfectSprite';
import type { Pokemon } from '@/types/pokemon';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TYPE_COLORS } from '@/data/type-colors';
import { Plus, ChevronRight, X, Sword, Shield } from 'lucide-react';
import { GenBadge } from '@/components/shared/GenBadge';
import { TypeBadge } from '@/components/shared/TypeBadge';
import type { TypeName } from '@/types/pokemon';

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
  // Pixel-perfect sprite size: mobile 11vw, desktop clamp(40px, 7vw, 96px)
  const spritePx = usePixelPerfectSprite(11, 40, 7, 96);

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
          spritePx={spritePx}
        />
      );
      col = (col + size) % cols;
    }

    return result;
  }, [groups, assignedIds, stagedIds, onToggleStage, shinyIds, spriteOverrides, cols, matchupInfo, spritePx]);

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
  /** Pixel-perfect sprite size in CSS px */
  spritePx: number;
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

export function EvoLineCard({ members, matchedIds, assignedIds, stagedIds, onToggleStage, shinyIds, spriteOverrides, variant = 'browser', showGenBadges = true, matchupInfo, spritePx }: EvoLineCardProps) {
  const removeEvoLine = usePokedexStore((s) => s.removeEvoLine);
  const sections = usePokedexStore((s) => s.sections);
  const allInDex = members.every((p) => assignedIds.has(p.id));

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

  // Generation of the matched member — the one that earned this subgroup entry.
  // Using the matched member's gen (not members[0]) ensures the badge marks
  // the *other* members as cross-gen, not the highlighted one itself.
  // e.g. in a Gen 2 subgroup Sudowoodo is matched (Gen 2), so Bonsly (Gen 4) gets the badge.
  const lineGen = members.find(m => matchedIds.has(m.id))?.generation ?? members[0].generation;

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
            <div
              role="button"
              tabIndex={0}
              onClick={handleClick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
              className={cn(
                'relative flex flex-col items-center pt-[0.5vw] pb-[1vw] md:py-1.5 transition-all cursor-pointer w-full',
              )}
            >
              <div className="relative flex flex-col items-center w-full">
                {/* Gen badge + icons — always full opacity, outside the grey wrapper */}
                {showGenBadge && (
                  <GenBadge
                    gen={pokemon.generation}
                    className="absolute top-0 left-[6px] md:left-1 w-[2.5vw] h-[2.5vw] md:w-[min(1.5vw,18px)] md:h-[min(1.5vw,18px)] z-10"
                  />
                )}
                {inDex && variant === 'analytics' && (
                  <button
                    onClick={handleRemoveButton}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute top-[2px] right-[6px] md:top-[3px] md:right-[4px] w-3 h-3 md:w-4 md:h-4 rounded-full bg-destructive text-white flex items-center justify-center z-[15]"
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <X className="w-1/2 h-1/2" />
                  </button>
                )}
                {inDex && variant === 'browser' && (
                  <div
                    className="absolute top-[2px] right-[6px] md:top-[3px] md:right-[4px] w-3 h-3 md:w-4 md:h-4 z-[15]"
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <PokeballIcon className="w-full h-full" />
                  </div>
                )}
                {!inDex && stagedIds.has(pokemon.id) && (
                  <div
                    className="absolute top-[2px] right-[6px] md:top-[3px] md:right-[4px] w-3 h-3 md:w-4 md:h-4 bg-primary rounded-full flex items-center justify-center z-[15]"
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <Plus className="w-1/2 h-1/2 text-primary-foreground" />
                  </div>
                )}
                {/* Content — greyed out for gen mismatch, matchup tier mismatch (analytics), or filter mismatch (browser) */}
                <div className={cn(
                  'flex flex-col items-center w-full',
                  variant === 'analytics' ? ((showGenBadge || (matchupInfo && !matched)) && 'opacity-35') : (!matched && 'opacity-35'),
                )}>
                  <div
                    style={{
                      width: spritePx,
                      height: spritePx,
                      backgroundImage: `url(${spriteOverrides?.[pokemon.id]
                        ?? (shinyIds?.has(pokemon.id)
                          ? pokemon.sprite.replace('/pokemon/', '/pokemon/shiny/')
                          : pokemon.sprite)})`,
                      backgroundSize: `${spritePx}px ${spritePx}px`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      imageRendering: 'pixelated',
                    }}
                    role="img"
                    aria-label={pokemon.name}
                  />
                  <span className="text-[clamp(7px,2vw,14px)] md:text-[clamp(10px,1.2vw,14px)] font-medium capitalize truncate text-center leading-tight w-full px-[0.5vw] md:px-0.5">
                    {displayName(pokemon.name)}
                  </span>
                  <div className="flex flex-col items-center gap-[0.3vw] md:gap-[min(0.3vw,2px)] mt-[0.5vw] md:mt-[min(0.3vw,2px)] w-full">
                    {pokemon.types.map((t) => (
                      <TypeBadge key={t} type={t as TypeName} className="w-[min(65%,75px)]" />
                    ))}
                    {pokemon.types.length === 1 && (
                      <div className="w-[min(65%,75px)]" style={{ aspectRatio: '200/40' }} aria-hidden />
                    )}
                  </div>
                  {matchupInfo?.has(pokemon.id) && (() => {
                    const info = matchupInfo.get(pokemon.id)!;
                    const offD = doublings(info.offense, false);
                    const defD = doublings(info.defense, true);
                    const dColor = (d: number) => d > 0 ? 'text-emerald-600 dark:text-emerald-400' : d < 0 ? 'text-red-500 dark:text-red-400' : '';
                    return (
                      <div className="grid mt-[0.3vw] md:mt-0.5 text-[clamp(6px,1.5vw,12px)] md:text-[clamp(8px,1vw,10px)] font-semibold" style={{ fontVariantNumeric: 'tabular-nums', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', rowGap: '0px', columnGap: 'min(0.6vw, 3px)' }}>
                        <span className="justify-self-end leading-none">{formatMult(info.offense)}×</span>
                        <Sword className="w-[clamp(6px,1.5vw,12px)] h-[clamp(6px,1.5vw,12px)] md:w-[clamp(8px,1vw,10px)] md:h-[clamp(8px,1vw,10px)] block" />
                        <span className="justify-self-start leading-none">(<span className={dColor(offD)}>{formatDoublings(offD)}</span>)</span>
                        <span className="justify-self-end leading-none">{formatMult(info.defense)}×</span>
                        <Shield className="w-[clamp(6px,1.5vw,12px)] h-[clamp(6px,1.5vw,12px)] md:w-[clamp(8px,1vw,10px)] md:h-[clamp(8px,1vw,10px)] block" />
                        <span className="justify-self-start leading-none">(<span className={dColor(defD)}>{formatDoublings(defD)}</span>)</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            {/* Chevron between evo line members */}
            {!isLast && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10">
                <ChevronRight className="w-[2vw] h-[2vw] md:w-[min(1.2vw,14px)] md:h-[min(1.2vw,14px)] text-muted-foreground/60" />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
