import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { Plus, ChevronRight, X, Sword, Shield } from 'lucide-react';
import { GenBadge } from '@/components/shared/GenBadge';
import {
  PokemonTileContent,
  TILE_ACTION_BUTTON_CLASS,
  TILE_GEN_BADGE_CLASS,
  TILE_ROOT_PADDING_CLASS,
  useTileSpritePx,
} from '@/components/shared/PokemonTile';

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
  /** Members shown at reduced opacity as de-emphasized context (e.g. filtered
   *  starters/legendaries when the "No Starters/Legendaries" toggle is on). */
  mutedIds?: Set<number>;
  /** Explicit "home gen" for this placement — overrides the gen inferred from
   *  matched/members. Used by the regional drilldown when the same line is
   *  placed in multiple gen sections (once per matching member's gen): each
   *  placement declares its bucket as the home gen so members from other gens
   *  get cross-gen badges / muting regardless of which one is placed. */
  anchorGen?: number;
}

interface EvoLineGridProps {
  groups: EvoLineGroup[];
  assignedIds: Set<number>;
  stagedIds: Set<number>;
  onToggleStage: (memberIds: number[]) => void;
  /** IDs staged for removal (pending user confirmation). */
  removalStagedIds?: Set<number>;
  /** Toggle an evo line's removal staging. */
  onToggleRemoval?: (memberIds: number[]) => void;
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
export function EvoLineGrid({ groups, assignedIds, stagedIds, onToggleStage, removalStagedIds, onToggleRemoval, shinyIds, spriteOverrides, cols = DEFAULT_COLS, variant = 'browser', showGenBadges = true, matchupInfo }: EvoLineGridProps) {
  // Canonical Pokemon-tile sprite size — shared with the build page so
  // Charizard (etc.) renders identically in the selection pane and in a
  // section tile at the same viewport width. See `PokemonTile.tsx`.
  const spritePx = useTileSpritePx();

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
          mutedIds={group.mutedIds}
          anchorGen={group.anchorGen}
          assignedIds={assignedIds}
          stagedIds={stagedIds}
          onToggleStage={onToggleStage}
          removalStagedIds={removalStagedIds}
          onToggleRemoval={onToggleRemoval}
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
  /** Members rendered at reduced opacity regardless of variant/matchup state.
   *  Overrides matchedIds-based highlighting — used to de-emphasize filtered-out
   *  starters/legendaries that are shown for context only. */
  mutedIds?: Set<number>;
  /** Explicit home gen for this placement. Overrides the inferred line gen. */
  anchorGen?: number;
  assignedIds: Set<number>;
  stagedIds: Set<number>;
  onToggleStage: (memberIds: number[]) => void;
  /** IDs staged for removal (pending user confirmation). */
  removalStagedIds?: Set<number>;
  /** Toggle an evo line's removal staging. */
  onToggleRemoval?: (memberIds: number[]) => void;
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

export function EvoLineCard({ members, matchedIds, mutedIds, anchorGen, assignedIds, stagedIds, onToggleStage, removalStagedIds, onToggleRemoval, shinyIds, spriteOverrides, variant = 'browser', showGenBadges = true, matchupInfo, spritePx }: EvoLineCardProps) {
  const allInDex = members.every((p) => assignedIds.has(p.id));
  const markedForRemoval = removalStagedIds
    ? members.some((p) => removalStagedIds.has(p.id))
    : false;

  const toggleRemoval = () => {
    if (onToggleRemoval) {
      onToggleRemoval(members.map((p) => p.id));
    }
  };

  const handleClick = () => {
    if (allInDex && variant === 'browser') {
      // Stage/unstage for removal instead of immediately removing
      toggleRemoval();
    } else if (!allInDex) {
      onToggleStage(members.map((p) => p.id));
    }
  };

  const handleRemoveButton = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Stage/unstage for removal instead of immediately removing
    toggleRemoval();
  };

  const primaryType = members[0].types[0];
  const bgColor = TYPE_COLORS[primaryType as keyof typeof TYPE_COLORS] ?? '#888';

  // Line's "home" gen. If the caller supplies anchorGen (regional drilldown,
  // where one line may be placed in multiple gen sections), use that — it
  // encodes which gen this particular placement belongs to. Otherwise infer
  // from matched members (earliest-introduced = home), falling back to all
  // members. Retro babies (e.g. Chingling Gen 4 → Chimecho Gen 3) land in the
  // original's gen so the original isn't wrongly flagged cross-gen.
  const matchedMembers = members.filter(m => matchedIds.has(m.id));
  const referenceMembers = matchedMembers.length > 0 ? matchedMembers : members;
  const lineGen = anchorGen ?? Math.min(...referenceMembers.map(m => m.generation));

  return (
    <>
      {members.map((pokemon, i) => {
        const inDex = assignedIds.has(pokemon.id);
        const matched = matchedIds.has(pokemon.id);
        const isFirst = i === 0;
        const isLast = i === members.length - 1;
        const showGenBadge = showGenBadges && pokemon.generation !== lineGen;

        return (
          // --tile-sprite exposes the per-tile sprite size as a CSS var so every
          // descendant can size itself as a fraction of the sprite, keeping
          // name/icon/badge/gap ratios locked across viewports. The shared
          // `PokemonTileContent` handles the sprite + name + type-badge block
          // at canonical ratios — see `src/components/shared/PokemonTile.tsx`.
          <div
            key={pokemon.id}
            className="relative px-[3px] overflow-visible"
            style={{ ['--tile-sprite' as string]: `${spritePx}px` }}
          >
            {/* Background + border spanning the evo line */}
            <div
              className={cn(
                'absolute inset-y-0 border-t border-b',
                isFirst ? 'left-[3px] rounded-l-md border-l' : 'left-0',
                isLast ? 'right-[3px] rounded-r-md border-r' : 'right-0',
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
                'relative flex flex-col items-center transition-all cursor-pointer w-full',
                TILE_ROOT_PADDING_CLASS,
              )}
            >
              <div className="relative flex flex-col items-center w-full">
                {/* Gen badge + icons — always full opacity, outside the grey wrapper */}
                {showGenBadge && (
                  <GenBadge gen={pokemon.generation} className={TILE_GEN_BADGE_CLASS} />
                )}
                {inDex && variant === 'analytics' && (
                  <button
                    onClick={handleRemoveButton}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={cn(TILE_ACTION_BUTTON_CLASS, 'rounded-full bg-destructive text-white flex items-center justify-center')}
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <X className="w-1/2 h-1/2" />
                  </button>
                )}
                {inDex && variant === 'browser' && (
                  markedForRemoval ? (
                    <div
                      className={cn(TILE_ACTION_BUTTON_CLASS, 'rounded-full bg-destructive text-white flex items-center justify-center')}
                      style={{ transform: 'translateZ(0)' }}
                    >
                      <X className="w-1/2 h-1/2" />
                    </div>
                  ) : (
                    <div
                      className={TILE_ACTION_BUTTON_CLASS}
                      style={{ transform: 'translateZ(0)' }}
                    >
                      <PokeballIcon className="w-full h-full" />
                    </div>
                  )
                )}
                {!inDex && stagedIds.has(pokemon.id) && (
                  <div
                    className={cn(TILE_ACTION_BUTTON_CLASS, 'bg-primary rounded-full flex items-center justify-center')}
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <Plus className="w-1/2 h-1/2 text-primary-foreground" />
                  </div>
                )}
                {/* Content — greyed out for gen mismatch, matchup tier mismatch (analytics), filter mismatch (browser),
                     or explicitly muted (e.g. filtered starters/legendaries shown for context). */}
                <PokemonTileContent
                  pokemon={pokemon}
                  spritePx={spritePx}
                  spriteUrl={spriteOverrides?.[pokemon.id]
                    ?? (shinyIds?.has(pokemon.id)
                      ? pokemon.sprite.replace('/pokemon/', '/pokemon/shiny/')
                      : pokemon.sprite)}
                  contentClassName={cn(
                    markedForRemoval
                      ? 'opacity-30'
                      : mutedIds?.has(pokemon.id)
                        ? 'opacity-35'
                        : variant === 'analytics'
                          ? ((showGenBadge || (matchupInfo && !matched)) && 'opacity-35')
                          : (!matched && 'opacity-35'),
                  )}
                  afterTypes={matchupInfo?.has(pokemon.id) ? (() => {
                    const info = matchupInfo.get(pokemon.id)!;
                    const offD = doublings(info.offense, false);
                    const defD = doublings(info.defense, true);
                    const dColor = (d: number) => d > 0 ? 'text-emerald-600 dark:text-emerald-400' : d < 0 ? 'text-red-500 dark:text-red-400' : '';
                    return (
                      <div className="grid mt-[calc(var(--tile-sprite)*0.027)] text-[calc(var(--tile-sprite)*0.14)] font-semibold" style={{ fontVariantNumeric: 'tabular-nums', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', rowGap: '0px', columnGap: 'calc(var(--tile-sprite)*0.055)' }}>
                        <span className="justify-self-end leading-none">{formatMult(info.offense)}×</span>
                        <Sword className="w-[calc(var(--tile-sprite)*0.14)] h-[calc(var(--tile-sprite)*0.14)] block" />
                        <span className="justify-self-start leading-none">(<span className={dColor(offD)}>{formatDoublings(offD)}</span>)</span>
                        <span className="justify-self-end leading-none">{formatMult(info.defense)}×</span>
                        <Shield className="w-[calc(var(--tile-sprite)*0.14)] h-[calc(var(--tile-sprite)*0.14)] block" />
                        <span className="justify-self-start leading-none">(<span className={dColor(defD)}>{formatDoublings(defD)}</span>)</span>
                      </div>
                    );
                  })() : undefined}
                />
              </div>
            </div>
            {/* Chevron between evo line members */}
            {!isLast && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10">
                <ChevronRight className="w-[calc(var(--tile-sprite)*0.18)] h-[calc(var(--tile-sprite)*0.18)] text-muted-foreground/60" />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
