import type { PokemonLabel } from '@/i18n/names';
import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useRowWindow } from './useRowWindow';
import { homeGen, packRows } from './packRows';
import type { Pokemon, TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import { ChevronRight, Sword } from 'lucide-react';
import { GenBadge } from '@/components/shared/GenBadge';
import { ShapeIcon } from '@/components/shared/ShapeIcon';
import {
  PokemonTileContent,
  TILE_ACTION_BUTTON_CLASS,
  TILE_GEN_BADGE_CLASS,
  TILE_ROOT_PADDING_CLASS,
  useTileGridMaxWidth,
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

/** Red circle with a centered X — SVG so centering is pixel-exact */
export function RedXIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <circle cx="8" cy="8" r="7.5" fill="#ef4444" />
      <line x1="5" y1="5" x2="11" y2="11" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="11" y1="5" x2="5" y2="11" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Blue circle with a centered + — SVG so centering is pixel-exact */
function BluePlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <circle cx="8" cy="8" r="7.5" fill="var(--color-primary)" />
      <line x1="4.5" y1="8" x2="11.5" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="8" y1="4.5" x2="8" y2="11.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Square icon split diagonally for dual-type display.
 *  Top-left triangle = first type; bottom-right triangle = second type.
 *  Single-type falls back to a plain icon. */
function TypeSplitIcon({ types, className }: { types: string[]; className?: string }) {
  if (types.length <= 1) {
    return <img src={typeIconPath(types[0] as TypeName)} alt="" className={className} />;
  }
  return (
    <span className={cn('relative inline-block overflow-hidden shrink-0', className)}>
      <img
        src={typeIconPath(types[0] as TypeName)}
        alt=""
        className="absolute inset-0 w-full h-full"
        style={{ clipPath: 'polygon(0% 0%, 100% 0%, 0% 100%)' }}
      />
      <img
        src={typeIconPath(types[1] as TypeName)}
        alt=""
        className="absolute inset-0 w-full h-full"
        style={{ clipPath: 'polygon(100% 0%, 100% 100%, 0% 100%)' }}
      />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none">
        <line x1="1" y1="0" x2="0" y2="1" stroke="white" strokeWidth="0.1" />
      </svg>
    </span>
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
  tileOverlay?: (pokemon: Pokemon, spritePx: number) => React.ReactNode;
  tileAttributes?: Record<string, string>;
  tileTestId?: string;
  displayName?: string;
  displayLabel?: PokemonLabel;
  onSelect?: (pokemon: Pokemon) => void;
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
  /** When true, muted members get a corner badge of their own body shape
   *  (shape drilldown context). */
  showShapeBadges?: boolean;
  /** Per-Pokemon offense/defense multipliers for matchup drill-downs */
  matchupInfo?: Map<number, { offense: number; defense: number; bestDefenseType: TypeName }>;
  /** The type being matched — required when matchupInfo is present */
  matchupType?: TypeName;
  /** Render only the rows near the viewport. Opt-in: the browser's result
   *  grid needs it, the much smaller drilldown grids do not. */
  windowed?: boolean;
  /** Each member is its own tile and its own pick. See `standaloneTiles` on
   *  the browser store: a slot that takes one Pokémon cannot be filled by a
   *  tile that picks a whole line. Positions are untouched — a line still
   *  occupies its own columns and never straddles a row. */
  standaloneTiles?: boolean;
  /** Drop the "already placed" pokeball. When the pane is showing only what
   *  is already on the card, marking every tile as placed says nothing. */
  hideAssignedMark?: boolean;
}

const GRID_CLASSES: Record<number, string> = {
  3: 'grid grid-cols-3 gap-x-0 gap-y-1',
  6: 'grid grid-cols-6 gap-x-0 gap-y-1',
};

/** Renders evo line cards in an N-column grid, inserting spacers so no line wraps mid-row */
export function EvoLineGrid({ groups, assignedIds, stagedIds, onToggleStage, removalStagedIds, onToggleRemoval, shinyIds, spriteOverrides, cols = DEFAULT_COLS, variant = 'browser', showGenBadges = true, showShapeBadges = false, matchupInfo, matchupType, windowed = false, standaloneTiles = false, hideAssignedMark = false }: EvoLineGridProps) {
  // Canonical Pokemon-tile sprite size — shared with the build page so
  // Charizard (etc.) renders identically in the selection pane and in a
  // section tile at the same viewport width. See `PokemonTile.tsx`.
  const spritePx = useTileSpritePx();
  const gridMaxW = useTileGridMaxWidth(cols, 0, 0);
  const gridRef = useRef<HTMLDivElement>(null);

  // Pack the lines into rows. A line never straddles a row, and a line wider
  // than a row is cut to fit: see `packRows`. That invariant is what lets
  // the grid be windowed by row.
  const rows = useMemo(() => packRows(groups, cols), [groups, cols]);

  const { start, end, topPad, bottomPad } = useRowWindow(gridRef, rows, windowed, `${cols}:${spritePx}`);

  const cells = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (let r = start; r < end; r++) {
      const row = rows[r];
      if (!row) continue;
      for (const group of row.groups) {
        result.push(
          <EvoLineCard
            key={group.key}
            members={group.members}
            matchedIds={group.matchedIds}
            mutedIds={group.mutedIds}
            anchorGen={group.anchorGen}
            tileOverlay={group.tileOverlay}
            tileAttributes={group.tileAttributes}
            tileTestId={group.tileTestId}
            displayName={group.displayName}
            displayLabel={group.displayLabel}
            onSelect={group.onSelect}
            assignedIds={assignedIds}
            stagedIds={stagedIds}
            onToggleStage={onToggleStage}
            removalStagedIds={removalStagedIds}
            onToggleRemoval={onToggleRemoval}
            shinyIds={shinyIds}
            spriteOverrides={spriteOverrides}
            variant={variant}
            showGenBadges={showGenBadges}
            showShapeBadges={showShapeBadges}
            matchupInfo={matchupInfo}
            matchupType={matchupType}
            standaloneTiles={standaloneTiles}
            hideAssignedMark={hideAssignedMark}
            spritePx={spritePx}
          />
        );
      }
      for (let sp = 0; sp < row.trailingSpacers; sp++) {
        result.push(<div key={`spacer-${r}-${sp}`} />);
      }
    }
    return result;
  }, [rows, start, end, assignedIds, stagedIds, onToggleStage, removalStagedIds, onToggleRemoval, shinyIds, spriteOverrides, variant, showGenBadges, showShapeBadges, matchupInfo, matchupType, spritePx, standaloneTiles, hideAssignedMark]);

  // The fillers stand in for the rows outside the window so the scrollbar
  // still describes the whole list. They span every column, so each occupies
  // a grid row of its own.
  const filler = (key: string, height: number) => (
    <div key={key} aria-hidden="true" style={{ gridColumn: '1 / -1', height }} />
  );

  return (
    <div
      ref={gridRef}
      className={GRID_CLASSES[cols] ?? `grid gap-x-0 gap-y-1`}
      style={{ ...(GRID_CLASSES[cols] ? {} : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }), maxWidth: gridMaxW, marginInline: gridMaxW ? 'auto' : undefined }}
    >
      {topPad > 0 && filler('pad-top', topPad)}
      {cells}
      {bottomPad > 0 && filler('pad-bottom', bottomPad)}
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
  tileOverlay?: (pokemon: Pokemon, spritePx: number) => React.ReactNode;
  tileAttributes?: Record<string, string>;
  tileTestId?: string;
  displayName?: string;
  displayLabel?: PokemonLabel;
  onSelect?: (pokemon: Pokemon) => void;
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
  showShapeBadges?: boolean;
  matchupInfo?: Map<number, { offense: number; defense: number; bestDefenseType: TypeName }>;
  matchupType?: TypeName;
  /** Pixel-perfect sprite size in CSS px */
  spritePx: number;
  /** Each member is its own tile and its own pick. */
  standaloneTiles?: boolean;
  /** Drop the "already placed" pokeball. */
  hideAssignedMark?: boolean;
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

function EvoLineCard({ members, matchedIds, mutedIds, anchorGen, tileOverlay, tileAttributes, tileTestId, displayName, displayLabel, onSelect, assignedIds, stagedIds, onToggleStage, removalStagedIds, onToggleRemoval, shinyIds, spriteOverrides, variant = 'browser', showGenBadges = true, showShapeBadges = false, matchupInfo, matchupType, spritePx, standaloneTiles = false, hideAssignedMark = false }: EvoLineCardProps) {
  const allInDex = members.every((p) => assignedIds.has(p.id));
  const anyInDex = members.some((p) => assignedIds.has(p.id));
  // Shared press state so clicking any member shrinks the *whole* evo line
  // rectangle, plus `pressedIdx` to shrink the *tapped sprite* specifically.
  // We DON'T use CSS :active for this: a mobile tap is so short (pointerdown→up
  // in <30ms) that the press state flips back before the scale transition can
  // paint, so it looked instant on touch but animated on desktop's slower
  // click-hold. A JS-enforced minimum hold makes the shrink→grow animation play
  // fully on every platform regardless of how briefly the user actually pressed.
  const [pressed, setPressed] = useState(false);
  const [pressedIdx, setPressedIdx] = useState<number | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartedAt = useRef(0);
  // Hold the pressed state at least this long so a flash tap still animates.
  const MIN_PRESS_MS = 120;

  const startPress = (idx: number) => {
    if (releaseTimer.current) { clearTimeout(releaseTimer.current); releaseTimer.current = null; }
    pressStartedAt.current = performance.now();
    setPressed(true);
    setPressedIdx(idx);
  };
  const endPress = () => {
    const held = performance.now() - pressStartedAt.current;
    const wait = Math.max(0, MIN_PRESS_MS - held);
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => {
      setPressed(false);
      setPressedIdx(null);
      releaseTimer.current = null;
    }, wait);
  };
  const lineMarkedForRemoval = removalStagedIds
    ? members.some((p) => removalStagedIds.has(p.id))
    : false;

  /** What a tap acts on: one member when tiles stand alone, else the line. */
  const actedOn = (i: number) => (standaloneTiles ? [members[i].id] : members.map((p) => p.id));

  const handleClick = (i: number) => {
    if (onSelect) { onSelect(members[i]); return; }
    // Analytics variant: any placed member → toggle removal (partial lines ok)
    // Browser variant: all placed → toggle removal, else toggle staging
    const placed = standaloneTiles
      ? assignedIds.has(members[i].id)
      : variant === 'analytics' ? anyInDex : allInDex;
    if (placed) {
      onToggleRemoval?.(actedOn(i));
    } else if (variant !== 'analytics') {
      onToggleStage(actedOn(i));
    }
  };

  const primaryType = members[0].types[0];
  const bgColor = TYPE_COLORS[primaryType as keyof typeof TYPE_COLORS] ?? '#888';

  // Line's "home" gen. If the caller supplies anchorGen (regional drilldown,
  // where one line may be placed in multiple gen sections, or a piece of a
  // line the packer cut), use that — it encodes which gen this particular
  // placement belongs to. Otherwise infer it from the members: see `homeGen`.
  const lineGen = anchorGen ?? homeGen(members, matchedIds);

  return (
    <>
      {members.map((pokemon, i) => {
        const inDex = assignedIds.has(pokemon.id);
        const markedForRemoval = standaloneTiles
          ? (removalStagedIds?.has(pokemon.id) ?? false)
          : lineMarkedForRemoval;
        const matched = matchedIds.has(pokemon.id);
        const isFirst = i === 0;
        const isLast = i === members.length - 1;
        const showGenBadge = showGenBadges && pokemon.generation !== lineGen;
        // Shape drilldown: badge the muted (off-segment) chain-mates with their
        // own body shape so it's clear why they're de-emphasized.
        const showShapeBadge = showShapeBadges && (mutedIds?.has(pokemon.id) ?? false);

        return (
          // --tile-sprite exposes the per-tile sprite size as a CSS var so every
          // descendant can size itself as a fraction of the sprite, keeping
          // name/icon/badge/gap ratios locked across viewports. The shared
          // `PokemonTileContent` handles the sprite + name + type-badge block
          // at canonical ratios — see `src/components/shared/PokemonTile.tsx`.
          <div
            key={pokemon.id}
            data-row-cell=""
            {...tileAttributes}
            className="relative px-[3px] overflow-visible"
            style={{ ['--tile-sprite' as string]: `${spritePx}px` }}
          >
            {/* Background + border spanning the whole evo line. Rendered once,
                anchored in the first cell and stretched across all N columns
                (gap-x is 0), so on press it scales as a single object about its
                own centre — no per-cell segments means no seams.

                Every card sits on z-0 and every tile on z-1 (below), so the
                card chrome forms one layer under all sprites. Without the
                split, paint order is DOM order: a sprite that overflows its
                column into the next line's card is painted before that card,
                and the card's 1px border cuts across it. The fill is ~6%
                alpha, so only the border shows the seam. Real case: a desktop
                pane narrower than the grid's max width (≈1024–1200px window),
                where the 96px sprite is wider than its ~85px column. */}
            {(standaloneTiles || isFirst) && (
              <div
                // Smooth scale animation both ways — shrink on press, grow back
                // on release. Standalone tiles get one rectangle each; a line
                // gets one stretched across its columns, anchored in the first
                // cell (gap-x is 0, so there are no seams).
                className="absolute inset-y-0 z-0 rounded-md border border-border transition-[scale] duration-100 ease-out"
                style={{
                  backgroundColor: `${bgColor}10`,
                  left: '3px',
                  width: standaloneTiles ? 'calc(100% - 6px)' : `calc(${members.length} * 100% - 6px)`,
                  scale: (standaloneTiles ? pressedIdx === i : pressed) ? '0.98' : '1',
                }}
              />
            )}
            <div
              role="button"
              tabIndex={0}
              data-testid={tileTestId ?? "verify-evo-card"}
              onClick={() => handleClick(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startPress(i); handleClick(i); } }}
              onKeyUp={endPress}
              onPointerDown={() => startPress(i)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onPointerCancel={endPress}
              className={cn(
                // Scale driven by JS press state (not CSS :active) so the
                // animation plays fully even on a flash mobile tap. The tapped
                // sprite shrinks; the whole rectangle (above) shrinks too.
                // z-1 keeps every tile above every card's border — see the
                // background note above.
                'relative z-[1] flex flex-col items-center cursor-pointer w-full transition-[scale] duration-100 ease-out',
                TILE_ROOT_PADDING_CLASS,
              )}
              style={{ scale: pressedIdx === i ? '0.96' : '1' }}
            >
              <div className="relative flex flex-col items-center w-full">
                {tileOverlay?.(pokemon, spritePx)}
                {/* Gen badge + icons — always full opacity, outside the grey wrapper */}
                {showGenBadge && (
                  <GenBadge gen={pokemon.generation} className={TILE_GEN_BADGE_CLASS} />
                )}
                {showShapeBadge && (
                  <div className="absolute top-[calc(var(--tile-sprite)*0.03)] left-[calc(var(--tile-sprite)*0.03)] w-[calc(var(--tile-sprite)*0.4)] h-[calc(var(--tile-sprite)*0.4)] z-10 flex items-center justify-center rounded-full bg-background/90 border border-border p-[calc(var(--tile-sprite)*0.015)]">
                    <ShapeIcon shape={pokemon.shape} className="w-full h-full" />
                  </div>
                )}
                {inDex && variant === 'analytics' && markedForRemoval && (
                  <div className={TILE_ACTION_BUTTON_CLASS} style={{ transform: 'translateZ(0)' }}>
                    <RedXIcon className="w-full h-full" />
                  </div>
                )}
                {inDex && variant === 'browser' && !hideAssignedMark && (
                  markedForRemoval ? (
                    <div className={TILE_ACTION_BUTTON_CLASS} style={{ transform: 'translateZ(0)' }}>
                      <RedXIcon className="w-full h-full" />
                    </div>
                  ) : (
                    <div className={TILE_ACTION_BUTTON_CLASS} style={{ transform: 'translateZ(0)' }}>
                      <PokeballIcon className="w-full h-full" />
                    </div>
                  )
                )}
                {!inDex && stagedIds.has(pokemon.id) && (
                  <div className={TILE_ACTION_BUTTON_CLASS} style={{ transform: 'translateZ(0)' }}>
                    <BluePlusIcon className="w-full h-full" />
                  </div>
                )}
                {/* Content — greyed out for gen mismatch, matchup tier mismatch (analytics), filter mismatch (browser),
                     or explicitly muted (e.g. filtered starters/legendaries shown for context). */}
                <PokemonTileContent
                  pokemon={pokemon}
                  displayName={displayName}
                  displayLabel={displayLabel}
                  imgLoading={variant === 'analytics' ? 'eager' : 'lazy'}
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
                  afterTypes={matchupInfo?.has(pokemon.id) && matchupType ? (() => {
                    const info = matchupInfo.get(pokemon.id)!;
                    const offD = doublings(info.offense, false);
                    // isDefense:true so opponent hitting hard = negative = red (drilldown-type perspective)
                    const defD = doublings(info.defense, true);
                    const dColor = (d: number) => d > 0 ? 'text-emerald-600 dark:text-emerald-400' : d < 0 ? 'text-red-500 dark:text-red-400' : '';
                    const iconCls = 'w-[calc(var(--tile-sprite)*0.18)] h-[calc(var(--tile-sprite)*0.18)]';
                    const iconSz = 'calc(var(--tile-sprite)*0.18)';
                    const gap = 'calc(var(--tile-sprite)*0.04)';
                    return (
                      <div
                        className="grid items-center mt-[calc(var(--tile-sprite)*0.027)] text-[calc(var(--tile-sprite)*0.18)] font-semibold leading-none"
                        style={{
                          gridTemplateColumns: `auto ${iconSz} ${iconSz} ${iconSz} auto`,
                          columnGap: gap,
                          rowGap: 'calc(var(--tile-sprite)*0.02)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {/* Row 1: drilldown type attacks pokemon */}
                        <span className={dColor(offD)}>{formatDoublings(offD)}</span>
                        <img src={typeIconPath(matchupType)} alt="" className={iconCls} />
                        <Sword className={iconCls} />
                        <TypeSplitIcon types={pokemon.types} className={iconCls} />
                        <span>{formatMult(info.offense)}×</span>
                        {/* Row 2: pokemon's best type attacks drilldown type */}
                        <span className={dColor(defD)}>{formatDoublings(defD)}</span>
                        <img src={typeIconPath(info.bestDefenseType)} alt="" className={iconCls} />
                        <Sword className={iconCls} />
                        <img src={typeIconPath(matchupType)} alt="" className={iconCls} />
                        <span>{formatMult(info.defense)}×</span>
                      </div>
                    );
                  })() : undefined}
                />
              </div>
            </div>
            {/* Chevron between evo line members. Standalone tiles have no
                such relation to show: each tile is its own pick, so an arrow
                from one to the next would claim an evolution the tap does
                not follow. */}
            {!isLast && !standaloneTiles && (
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
