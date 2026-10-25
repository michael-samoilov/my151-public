import { PokemonNameTooltip } from '@/components/shared/PokemonNameTooltip';
import { pokemonLabel, useNamesVersion } from '@/i18n';
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
import { shinySpriteUrl } from '@/lib/spriteUrl';
import { NoShinyMark } from '@/components/shiny/ShinyMarks';
import { NO_SHINY } from '@/components/shiny/shinyMarks';
import {
  PokemonTileContent,
  TILE_ACTION_BUTTON_CLASS,
  TILE_GEN_BADGE_CLASS,
  TILE_ROOT_PADDING_CLASS,
  useTileGridMaxWidth,
  useTileSpritePx,
} from '@/components/shared/PokemonTile';

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

export function RedXIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <circle cx="8" cy="8" r="7.5" fill="#ef4444" />
      <line x1="5" y1="5" x2="11" y2="11" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="11" y1="5" x2="5" y2="11" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BluePlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <circle cx="8" cy="8" r="7.5" fill="var(--color-primary)" />
      <line x1="4.5" y1="8" x2="11.5" y2="8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="8" y1="4.5" x2="8" y2="11.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

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

type EvoLineVariant = 'browser' | 'analytics';

const DEFAULT_COLS = 6;

interface EvoLineGroup {
  key: string | number;
  members: Pokemon[];
  matchedIds: Set<number>;
  mutedIds?: Set<number>;
  anchorGen?: number;
  tileOverlay?: (pokemon: Pokemon, spritePx: number) => React.ReactNode;
  tileAttributes?: Record<string, string>;
  tileTestId?: string;
  displayLabel?: PokemonLabel;
  onSelect?: (pokemon: Pokemon) => void;
}

interface EvoLineGridProps {
  groups: EvoLineGroup[];
  assignedIds: Set<number>;
  stagedIds: Set<number>;
  onToggleStage: (memberIds: number[]) => void;
  removalStagedIds?: Set<number>;
  onToggleRemoval?: (memberIds: number[]) => void;
  shinyIds?: Set<number>;
  spriteOverrides?: Record<number, string>;
  /** Show every tile shiny, or faded under the no-shiny mark when it has no shiny. */
  shinyView?: boolean;
  cols?: number;
  variant?: EvoLineVariant;
  showGenBadges?: boolean;
  showShapeBadges?: boolean;
  matchupInfo?: Map<number, { offense: number; defense: number; bestDefenseType: TypeName }>;
  matchupType?: TypeName;
  windowed?: boolean;
  standaloneTiles?: boolean;
  hideAssignedMark?: boolean;
}

const GRID_CLASSES: Record<number, string> = {
  3: 'grid grid-cols-3 gap-x-0 gap-y-1',
  6: 'grid grid-cols-6 gap-x-0 gap-y-1',
};

export function EvoLineGrid({ groups, assignedIds, stagedIds, onToggleStage, removalStagedIds, onToggleRemoval, shinyIds, spriteOverrides, shinyView = false, cols = DEFAULT_COLS, variant = 'browser', showGenBadges = true, showShapeBadges = false, matchupInfo, matchupType, windowed = false, standaloneTiles = false, hideAssignedMark = false }: EvoLineGridProps) {
  const spritePx = useTileSpritePx();
  const gridMaxW = useTileGridMaxWidth(cols, 0, 0);
  const gridRef = useRef<HTMLDivElement>(null);

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
            displayLabel={group.displayLabel}
            onSelect={group.onSelect}
            assignedIds={assignedIds}
            stagedIds={stagedIds}
            onToggleStage={onToggleStage}
            removalStagedIds={removalStagedIds}
            onToggleRemoval={onToggleRemoval}
            shinyIds={shinyIds}
            spriteOverrides={spriteOverrides}
            shinyView={shinyView}
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
  }, [rows, start, end, assignedIds, stagedIds, onToggleStage, removalStagedIds, onToggleRemoval, shinyIds, spriteOverrides, shinyView, variant, showGenBadges, showShapeBadges, matchupInfo, matchupType, spritePx, standaloneTiles, hideAssignedMark]);

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

interface EvoLineCardProps {
  members: Pokemon[];
  matchedIds: Set<number>;
  mutedIds?: Set<number>;
  anchorGen?: number;
  tileOverlay?: (pokemon: Pokemon, spritePx: number) => React.ReactNode;
  tileAttributes?: Record<string, string>;
  tileTestId?: string;
  displayLabel?: PokemonLabel;
  onSelect?: (pokemon: Pokemon) => void;
  assignedIds: Set<number>;
  stagedIds: Set<number>;
  onToggleStage: (memberIds: number[]) => void;
  removalStagedIds?: Set<number>;
  onToggleRemoval?: (memberIds: number[]) => void;
  shinyIds?: Set<number>;
  spriteOverrides?: Record<number, string>;
  shinyView?: boolean;
  variant?: EvoLineVariant;
  showGenBadges?: boolean;
  showShapeBadges?: boolean;
  matchupInfo?: Map<number, { offense: number; defense: number; bestDefenseType: TypeName }>;
  matchupType?: TypeName;
  spritePx: number;
  standaloneTiles?: boolean;
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

function doublings(value: number, isDefense: boolean): number {
  const clamped = Math.max(value, 0.125);
  const d = Math.round(Math.log2(clamped));
  return isDefense ? -d : d;
}

function formatDoublings(n: number): string {
  return n >= 0 ? `+${n}` : `\u2212${Math.abs(n)}`;
}

function EvoLineCard({ members, matchedIds, mutedIds, anchorGen, tileOverlay, tileAttributes, tileTestId, displayLabel, onSelect, assignedIds, stagedIds, onToggleStage, removalStagedIds, onToggleRemoval, shinyIds, spriteOverrides, shinyView = false, variant = 'browser', showGenBadges = true, showShapeBadges = false, matchupInfo, matchupType, spritePx, standaloneTiles = false, hideAssignedMark = false }: EvoLineCardProps) {
  useNamesVersion();
  const allInDex = members.every((p) => assignedIds.has(p.id));
  const anyInDex = members.some((p) => assignedIds.has(p.id));
  const [pressed, setPressed] = useState(false);
  const [pressedIdx, setPressedIdx] = useState<number | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartedAt = useRef(0);
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

  const actedOn = (i: number) => (standaloneTiles ? [members[i].id] : members.map((p) => p.id));

  const handleClick = (i: number) => {
    if (onSelect) { onSelect(members[i]); return; }
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

  const lineGen = anchorGen ?? homeGen(members, matchedIds);

  return (
    <>
      {members.map((pokemon, i) => {
        const label = displayLabel ?? pokemonLabel(pokemon.id, pokemon.name);
        const inDex = assignedIds.has(pokemon.id);
        const markedForRemoval = standaloneTiles
          ? (removalStagedIds?.has(pokemon.id) ?? false)
          : lineMarkedForRemoval;
        const matched = matchedIds.has(pokemon.id);
        const isFirst = i === 0;
        const isLast = i === members.length - 1;
        const showGenBadge = showGenBadges && pokemon.generation !== lineGen;
        const showShapeBadge = showShapeBadges && (mutedIds?.has(pokemon.id) ?? false);
        const shinySprite = shinyView ? shinySpriteUrl(pokemon.sprite) : null;
        const noShiny = shinyView && !shinySprite;

        return (
          <div
            key={pokemon.id}
            data-row-cell=""
            {...tileAttributes}
            className="relative px-[3px] overflow-visible"
            style={{ ['--tile-sprite' as string]: `${spritePx}px` }}
          >
            {(standaloneTiles || isFirst) && (
              <div
                className="absolute inset-y-0 z-0 rounded-md border border-border transition-[scale] duration-100 ease-out"
                style={{
                  backgroundColor: `${bgColor}10`,
                  left: '3px',
                  width: standaloneTiles ? 'calc(100% - 6px)' : `calc(${members.length} * 100% - 6px)`,
                  scale: (standaloneTiles ? pressedIdx === i : pressed) ? '0.98' : '1',
                }}
              />
            )}
            <PokemonNameTooltip label={label} enabled={Boolean(label.mark)}>
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
                'relative z-[1] flex flex-col items-center cursor-pointer w-full transition-[scale] duration-100 ease-out',
                TILE_ROOT_PADDING_CLASS,
              )}
              style={{ scale: pressedIdx === i ? '0.96' : '1' }}
            >
              <div className="relative flex flex-col items-center w-full">
                {tileOverlay?.(pokemon, spritePx)}
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
                <PokemonTileContent
                  pokemon={pokemon}
                  displayLabel={label}
                  imgLoading={variant === 'analytics' ? 'eager' : 'lazy'}
                  spriteUrl={spriteOverrides?.[pokemon.id]
                    ?? shinySprite
                    ?? (shinyIds?.has(pokemon.id)
                      ? pokemon.sprite.replace('/pokemon/', '/pokemon/shiny/')
                      : pokemon.sprite)}
                  spriteStyle={noShiny ? NO_SHINY.sprite : undefined}
                  spriteOverlay={noShiny ? <NoShinyMark size="calc(var(--tile-sprite) * 0.28)" top="calc(var(--tile-sprite) * 0.05)"
                    left={showGenBadge ? 'calc(var(--tile-sprite) * 0.37)' : 'calc(var(--tile-sprite) * 0.05)'} /> : undefined}
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
                        <span className={dColor(offD)}>{formatDoublings(offD)}</span>
                        <img src={typeIconPath(matchupType)} alt="" className={iconCls} />
                        <Sword className={iconCls} />
                        <TypeSplitIcon types={pokemon.types} className={iconCls} />
                        <span>{formatMult(info.offense)}×</span>
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
            </PokemonNameTooltip>
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
