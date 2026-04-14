import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { BUILD_GROUPS, type BuildGroup } from '@/data/slot-template';
import { getEvolutionChainIds, getEvolutionLine, getPokemonById } from '@/hooks/usePokemonData';
import { effectiveCursorCollision, dragInputIsTouch, dragPointerRef, OVERLAY_LIFT_PX } from '@/lib/dragCollision';
import { TypeBadge } from '@/components/shared/TypeBadge';
import type { TypeName } from '@/types/pokemon';
import { displayName } from '@/lib/utils';
import { usePixelPerfectSprite } from '@/lib/usePixelPerfectSprite';
import { Trash2, Plus, X, Settings } from 'lucide-react';

import { PageFooter } from '@/components/shared/PageFooter';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';

// ---------- helpers ----------

/**
 * Members of `pokemonId`'s full evolution chain (all branches — Wurmple →
 * Silcoon, Cascoon, Beautifly, Dustox) that are currently placed in this
 * section, in section order. Used to treat branched chains as atomic
 * bundles for drag-to-rearrange.
 */
function findEvoLineGroup(pokemonId: number, sectionIds: number[]): number[] {
  const chainSet = new Set(getEvolutionChainIds(pokemonId));
  return sectionIds.filter((id) => chainSet.has(id));
}

function tileId(sectionId: string, pokemonId: number) {
  return `${sectionId}::${pokemonId}`;
}

function parseTileId(id: string): { sectionId: string; pokemonId: number } {
  const [sectionId, pidStr] = id.split('::');
  return { sectionId, pokemonId: Number(pidStr) };
}

// ---------- gen badge ----------

import { GenBadge } from '@/components/shared/GenBadge';

// ---------- static pokemon tile (for overlay) ----------

function PokemonTileStatic({ id }: { id: number }) {
  const pokemon = getPokemonById(id);
  const spritePx = usePixelPerfectSprite(8, 48, 7, 96);
  if (!pokemon) return null;
  return (
    <div className="relative bg-card border rounded-lg flex flex-col items-center justify-center p-[0.5vw] md:p-1 aspect-square shadow-lg">
      <GenBadge
        gen={pokemon.generation}
        className="absolute top-[0.5vw] left-[0.5vw] md:top-0.5 md:left-0.5 w-[3vw] h-[3vw] md:w-[min(1.5vw,18px)] md:h-[min(1.5vw,18px)]"
      />
      <div
        style={{
          width: spritePx,
          height: spritePx,
          backgroundImage: `url(${pokemon.sprite})`,
          backgroundSize: `${spritePx}px ${spritePx}px`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          imageRendering: 'pixelated',
        }}
        role="img"
        aria-label={displayName(pokemon.name)}
      />
      <span className="text-[clamp(7px,1.8vw,14px)] md:text-[clamp(10px,1.2vw,14px)] font-medium capitalize truncate w-full text-center leading-tight">
        {displayName(pokemon.name)}
      </span>
      <div className="flex flex-col items-center gap-[0.3vw] md:gap-[min(0.3vw,2px)] mt-[0.3vw] md:mt-[min(0.3vw,2px)] w-full">
        {pokemon.types.map((t) => (
          <TypeBadge key={t} type={t as TypeName} className="w-[min(65%,75px)]" />
        ))}
        {pokemon.types.length === 1 && (
          <div className="w-[min(65%,75px)]" style={{ aspectRatio: '200/40' }} aria-hidden />
        )}
      </div>
    </div>
  );
}

// ---------- draggable + droppable tile ----------

function DraggableTile({
  id,
  pokemonId,
  sectionId,
  isDraggedLine,
  showInsertBefore,
  showInsertAfter,
}: {
  id: string;
  pokemonId: number;
  sectionId: string;
  isDraggedLine: boolean;
  showInsertBefore: boolean;
  showInsertAfter: boolean;
}) {
  const removeBranch = usePokedexStore((s) => s.removeBranch);
  const pokemon = getPokemonById(pokemonId);
  const spritePx = usePixelPerfectSprite(8, 48, 7, 96);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id });

  const { setNodeRef: setDropRef } = useDroppable({ id });

  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef]
  );

  if (!pokemon) return null;

  return (
    <div
      ref={setNodeRef}
      data-tile-id={id}
      className="relative"
      style={{ opacity: isDragging || isDraggedLine ? 0.25 : 1 }}
    >
      {showInsertBefore && (
        <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-full z-20 -translate-x-[calc(50%+0.5vw)] md:-translate-x-[calc(50%+2px)]" />
      )}
      {showInsertAfter && (
        <div className="absolute right-0 top-1 bottom-1 w-[3px] bg-primary rounded-full z-20 translate-x-[calc(50%+0.5vw)] md:translate-x-[calc(50%+2px)]" />
      )}
      <div
        {...attributes}
        {...listeners}
        className="relative bg-card border rounded-lg flex flex-col items-center justify-center p-[0.5vw] md:p-1 group aspect-square cursor-grab active:cursor-grabbing select-none"
      >
        <GenBadge
          gen={pokemon.generation}
          className="absolute top-[0.5vw] left-[0.5vw] md:top-0.5 md:left-0.5 w-[3vw] h-[3vw] md:w-[min(1.5vw,18px)] md:h-[min(1.5vw,18px)] z-10"
        />
        <button
          onClick={() => removeBranch(sectionId, pokemonId)}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-[0.5vw] right-[0.5vw] md:top-0.5 md:right-0.5 w-[3vw] h-[3vw] md:w-[min(1.5vw,18px)] md:h-[min(1.5vw,18px)] rounded-full bg-destructive text-white flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"
        >
          <X className="w-[1.5vw] h-[1.5vw] md:w-[min(0.9vw,11px)] md:h-[min(0.9vw,11px)]" />
        </button>
        <div
          style={{
            width: spritePx,
            height: spritePx,
            backgroundImage: `url(${pokemon.sprite})`,
            backgroundSize: `${spritePx}px ${spritePx}px`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            imageRendering: 'pixelated',
          }}
          role="img"
          aria-label={displayName(pokemon.name)}
        />
        <span className="text-[clamp(7px,1.8vw,14px)] md:text-[clamp(10px,1.2vw,14px)] font-medium capitalize truncate w-full text-center leading-tight">
          {displayName(pokemon.name)}
        </span>
        <div className="flex flex-col items-center gap-[0.3vw] md:gap-[min(0.3vw,2px)] mt-[0.3vw] md:mt-[min(0.3vw,2px)] w-full">
          {pokemon.types.map((t) => (
            <TypeBadge key={t} type={t as TypeName} className="w-[min(65%,75px)]" />
          ))}
          {pokemon.types.length === 1 && (
            <div className="w-[min(65%,75px)]" style={{ aspectRatio: '200/40' }} aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- end-of-section drop zone ----------

const END_SENTINEL = 'end::';
function endSentinelId(sectionId: string) { return `${END_SENTINEL}${sectionId}`; }
function isEndSentinel(id: string) { return id.startsWith(END_SENTINEL); }
function parseEndSentinel(id: string) { return id.slice(END_SENTINEL.length); }

function EndDropZone({ sectionId, showIndicator }: { sectionId: string; showIndicator: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: endSentinelId(sectionId) });
  return (
    <div
      ref={setNodeRef}
      className={`relative aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-colors ${
        isOver ? 'border-primary/50 bg-primary/5' : 'border-transparent'
      }`}
    >
      {showIndicator && (
        <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-full z-20 -translate-x-[calc(50%+0.5vw)] md:-translate-x-[calc(50%+2px)]" />
      )}
    </div>
  );
}

// ---------- starter type buttons ----------

const STARTER_TYPES = [['grass', '#78C850'], ['fire', '#F08030'], ['water', '#6890F0']] as const;

function StarterContent({
  pokemonIds,
  dragLineIds,
  dragSet,
  insertIndicator,
  onTypeClick,
  onAddClick,
}: {
  pokemonIds: number[];
  dragLineIds: number[] | null;
  dragSet: Set<number>;
  insertIndicator: { tileId: string | null; endSection: string | null; side: 'left' | 'right' };
  onTypeClick: (type: string) => void;
  onAddClick: () => void;
}) {
  // Check if every pokemon matches a starter type (grass/fire/water)
  const allMatchStarterType = pokemonIds.length === 0 || pokemonIds.every(pid => {
    const p = getPokemonById(pid);
    return p && STARTER_TYPES.some(([t]) => p.types.includes(t as never));
  });

  const chains = new Set(pokemonIds.map(id => {
    const line = getEvolutionLine(id);
    return line?.[0] ?? id;
  }));

  // Use colored placeholders only when < 3 chains AND all pokemon fit grass/fire/water
  const useTypePlaceholders = !dragLineIds && chains.size < 3 && allMatchStarterType;

  if (useTypePlaceholders) {
    const pidsByType = new Map<string, number[]>();
    for (const pid of pokemonIds) {
      const p = getPokemonById(pid);
      if (!p) continue;
      const matched = STARTER_TYPES.find(([t]) => p.types.includes(t as never));
      if (matched) {
        if (!pidsByType.has(matched[0])) pidsByType.set(matched[0], []);
        pidsByType.get(matched[0])!.push(pid);
      }
    }

    const elements: React.ReactNode[] = [];
    for (const [type, color] of STARTER_TYPES) {
      const typePids = pidsByType.get(type);
      if (typePids) {
        for (const pid of typePids) {
          const tid = tileId('starter', pid);
          elements.push(
            <DraggableTile
              key={tid}
              id={tid}
              pokemonId={pid}
              sectionId="starter"
              isDraggedLine={dragSet.has(pid)}
              showInsertBefore={insertIndicator.tileId === tid && insertIndicator.side === 'left'}
              showInsertAfter={insertIndicator.tileId === tid && insertIndicator.side === 'right'}
            />
          );
        }
      } else {
        for (let i = 0; i < 3; i++) {
          elements.push(
            <button
              key={`${type}-${i}`}
              onClick={() => onTypeClick(type)}
              className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer hover:opacity-80"
              style={{ borderColor: `${color}40`, color: `${color}90`, backgroundColor: `${color}10` }}
            >
              <Plus className="w-[4vw] h-[4vw] md:w-[min(2vw,24px)] md:h-[min(2vw,24px)]" />
            </button>
          );
        }
      }
    }
    return <>{elements}</>;
  }

  // Standard rendering: show tiles + trailing "+"
  return (
    <>
      {pokemonIds.map((pid) => {
        const tid = tileId('starter', pid);
        return (
          <DraggableTile
            key={tid}
            id={tid}
            pokemonId={pid}
            sectionId="starter"
            isDraggedLine={dragSet.has(pid)}
            showInsertBefore={insertIndicator.tileId === tid && insertIndicator.side === 'left'}
            showInsertAfter={insertIndicator.tileId === tid && insertIndicator.side === 'right'}
          />
        );
      })}
      {dragLineIds && pokemonIds.length > 0 && (
        <EndDropZone sectionId="starter" showIndicator={insertIndicator.endSection === 'starter'} />
      )}
      {!dragLineIds && (
        <button
          onClick={onAddClick}
          className="aspect-square md:aspect-auto rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary"
        >
          <Plus className="w-[4vw] h-[4vw] md:w-[min(2vw,24px)] md:h-[min(2vw,24px)]" />
        </button>
      )}
    </>
  );
}

// ---------- group box ----------

function GroupBox({
  group,
  pokemonIds,
  dragLineIds,
  dragSet,
  insertIndicator,
  onAddClick,
}: {
  group: BuildGroup;
  pokemonIds: number[];
  dragLineIds: number[] | null;
  dragSet: Set<number>;
  insertIndicator: { tileId: string | null; endSection: string | null; side: 'left' | 'right' };
  onAddClick: (groupId: string) => void;
}) {
  const isEmpty = pokemonIds.length === 0;
  const isStarter = group.id === 'starter';
  // Starters always use the expanded grid path (for green/red/blue placeholders)
  const showEmptyState = isEmpty && !isStarter;
  const hasPokemon = pokemonIds.length > 0;

  // Animate height changes (e.g. when removing a pokemon causes a row to collapse)
  const boxRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    const newHeight = el.scrollHeight;
    const oldHeight = prevHeightRef.current;

    if (oldHeight !== null && oldHeight !== newHeight) {
      el.style.height = `${oldHeight}px`;
      el.style.overflow = 'hidden';
      el.style.transition = 'none';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = 'height 150ms ease-in-out';
          el.style.height = `${newHeight}px`;
        });
      });
    }

    prevHeightRef.current = newHeight;
  });

  const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
    if (e.propertyName === 'height' && boxRef.current) {
      boxRef.current.style.height = '';
      boxRef.current.style.overflow = '';
      boxRef.current.style.transition = '';
      // Update stored height to current auto height
      prevHeightRef.current = boxRef.current.scrollHeight;
    }
  }, []);

  return (
    <div
      ref={boxRef}
      onTransitionEnd={handleTransitionEnd}
      className="rounded-lg"
      style={{
        backgroundColor: `${group.color}${hasPokemon ? '10' : '10'}`,
        border: `1px solid ${group.color}${hasPokemon ? '25' : '20'}`,
      }}
    >
      {/* Label */}
      <div
        className="text-[clamp(9px,1.4vw,14px)] md:text-sm font-semibold uppercase tracking-wide px-1.5"
        style={{
          color: `color-mix(in srgb, ${group.color} 65%, black)`,
          opacity: showEmptyState ? 0.75 : 1,
          paddingTop: showEmptyState ? '0px' : '4px',
          paddingBottom: showEmptyState ? '0px' : '2px',
        }}
      >
        {group.name}{pokemonIds.length > 0 && ` (${pokemonIds.length})`}
      </div>

      {showEmptyState ? (
        /* Empty: single "+" at tile size */
        <div className="grid grid-cols-6 gap-[1vw] md:gap-1 p-1 pt-0">
          <button
            onClick={() => onAddClick(group.id)}
            className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer hover:opacity-80"
            style={{
              borderColor: `${group.color}40`,
              color: `${group.color}90`,
            }}
          >
            <Plus className="w-[4vw] h-[4vw] md:w-[min(2vw,24px)] md:h-[min(2vw,24px)]" />
          </button>
        </div>
      ) : (
        /* Filled: grid of tiles */
        <div className="grid grid-cols-6 gap-[1vw] md:gap-1 p-1 pt-0">
          {isStarter ? (
            <StarterContent
              pokemonIds={pokemonIds}
              dragLineIds={dragLineIds}
              dragSet={dragSet}
              insertIndicator={insertIndicator}
              onTypeClick={(type) => {
                const store = usePokedexStore.getState();
                store.setSearchQuery('');
                store.setGenerationFilter(null);
                store.setEvoLineSizeFilter(null);
                store.setArchetypeFilter(null);
                store.setActiveSection('starter');
                store.setCategoryFilter('starter');
                store.setTypeFilter([type]);
                store.setMobileBrowserOpen(true);
              }}
              onAddClick={() => onAddClick('starter')}
            />
          ) : (
            <>
              {pokemonIds.map((pid) => {
                const tid = tileId(group.id, pid);
                return (
                  <DraggableTile
                    key={tid}
                    id={tid}
                    pokemonId={pid}
                    sectionId={group.id}
                    isDraggedLine={dragSet.has(pid)}
                    showInsertBefore={insertIndicator.tileId === tid && insertIndicator.side === 'left'}
                    showInsertAfter={insertIndicator.tileId === tid && insertIndicator.side === 'right'}
                  />
                );
              })}
              {dragLineIds && pokemonIds.length > 0 && (
                <EndDropZone
                  sectionId={group.id}
                  showIndicator={insertIndicator.endSection === group.id}
                />
              )}
              {!dragLineIds && (
                <button
                  onClick={() => onAddClick(group.id)}
                  className="aspect-square md:aspect-auto rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary"
                >
                  <Plus className="w-[4vw] h-[4vw] md:w-[min(2vw,24px)] md:h-[min(2vw,24px)]" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- settings menu ----------

function SettingsMenu({ onClear }: { onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reset confirm state after timeout
  useEffect(() => {
    if (confirming) {
      timeoutRef.current = setTimeout(() => setConfirming(false), 3000);
      return () => clearTimeout(timeoutRef.current);
    }
  }, [confirming]);

  const handleClearClick = () => {
    if (confirming) {
      onClear();
      setOpen(false);
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => { setOpen(!open); setConfirming(false); }}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        <Settings className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-popover border rounded-lg shadow-lg z-30 min-w-[160px] py-1">
          <button
            onClick={handleClearClick}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
              confirming
                ? 'text-destructive bg-destructive/10 font-medium'
                : 'text-destructive/80 hover:bg-muted'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {confirming ? 'Are you sure?' : 'Clear All'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- main grid ----------

export function PokedexGrid() {
  const sections = usePokedexStore((s) => s.sections);
  const setActiveSection = usePokedexStore((s) => s.setActiveSection);
  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const setArchetypeFilter = usePokedexStore((s) => s.setArchetypeFilter);
  const setSearchQuery = usePokedexStore((s) => s.setSearchQuery);
  const setTypeFilter = usePokedexStore((s) => s.setTypeFilter);
  const setGenerationFilter = usePokedexStore((s) => s.setGenerationFilter);
  const setEvoLineSizeFilter = usePokedexStore((s) => s.setEvoLineSizeFilter);
  const setCategoryFilter = usePokedexStore((s) => s.setCategoryFilter);
  const clearAll = usePokedexStore((s) => s.clearAll);
  const moveEvoLine = usePokedexStore((s) => s.moveEvoLine);

  const totalPlaced = Object.values(sections).reduce((s, a) => s + a.length, 0);

  // Drag state
  const [dragLineIds, setDragLineIds] = useState<number[] | null>(null);
  const [dragFromSection, setDragFromSection] = useState<string | null>(null);
  const [overTileId, setOverTileId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'left' | 'right'>('left');

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } });
  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { sectionId, pokemonId } = parseTileId(event.active.id as string);
      const sectionIds = sections[sectionId] ?? [];
      const lineIds = findEvoLineGroup(pokemonId, sectionIds);
      setDragLineIds(lineIds);
      setDragFromSection(sectionId);
      dragInputIsTouch.current = event.activatorEvent instanceof TouchEvent;
    },
    [sections]
  );

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    // Update overTileId atomically with dropSide. Splitting across
    // onDragOver (setOverTileId) and onDragMove (setDropSide) renders once
    // with the NEW overTileId but STALE dropSide — causing the indicator
    // to flash at the wrong edge of the new bundle before correcting.
    setOverTileId(event.over ? (event.over.id as string) : null);

    if (!event.over) return;

    const overId = event.over.id as string;
    if (isEndSentinel(overId)) return;

    const target = parseTileId(overId);

    // Skip if hovering over the dragged evo line itself
    if (dragLineIds && dragLineIds.includes(target.pokemonId)) return;

    // dropSide is recomputed every move from the authoritative pointer X
    // (stashed by the collision detector) vs the bundle's horizontal
    // extent. Bundle extent comes from the actual DOM rects of every
    // bundle member tile — so a 3-, 4-, or N-chain splits cleanly at its
    // real visual midpoint regardless of tile width, gaps, or chain
    // length.
    const ptr = dragPointerRef.current;
    if (!ptr) return;
    const px = ptr.x;

    const sectionIds = sections[target.sectionId] ?? [];
    const bundle = findEvoLineGroup(target.pokemonId, sectionIds);

    // Look up each bundle member's live DOM rect. Filter to members on
    // the target's visual row — a chain that wraps to a second row uses
    // only the row segment the pointer is currently interacting with.
    const targetEl = document.querySelector<HTMLElement>(
      `[data-tile-id="${tileId(target.sectionId, target.pokemonId)}"]`,
    );
    const targetDomRect = targetEl?.getBoundingClientRect() ?? event.over.rect;
    const targetRowY = targetDomRect.top + targetDomRect.height / 2;
    const rowTolerance = targetDomRect.height / 2;

    let bundleLeft = targetDomRect.left;
    let bundleRight = targetDomRect.right;
    for (const pid of bundle) {
      if (pid === target.pokemonId) continue;
      const el = document.querySelector<HTMLElement>(
        `[data-tile-id="${tileId(target.sectionId, pid)}"]`,
      );
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const memberCenterY = r.top + r.height / 2;
      if (Math.abs(memberCenterY - targetRowY) > rowTolerance) continue;
      if (r.left < bundleLeft) bundleLeft = r.left;
      if (r.right > bundleRight) bundleRight = r.right;
    }

    const bundleCenterX = (bundleLeft + bundleRight) / 2;
    setDropSide(px < bundleCenterX ? 'left' : 'right');
  }, [sections, dragLineIds]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { over } = event;

      if (over && dragLineIds && dragFromSection) {
        const overId = over.id as string;
        const dragSetLocal = new Set(dragLineIds);

        if (isEndSentinel(overId)) {
          const targetSection = parseEndSentinel(overId);
          const targetSectionIds = sections[targetSection] ?? [];
          const insertIdx = dragFromSection === targetSection
            ? targetSectionIds.filter((id) => !dragSetLocal.has(id)).length
            : targetSectionIds.length;
          moveEvoLine(dragFromSection, dragLineIds, targetSection, insertIdx);
        } else {
          const target = parseTileId(overId);
          const targetSectionIds = sections[target.sectionId] ?? [];
          const targetLineIds = findEvoLineGroup(target.pokemonId, targetSectionIds);

          if (dragSetLocal.has(target.pokemonId)) {
            setDragLineIds(null);
            setDragFromSection(null);
            setOverTileId(null);
            setDropSide('left');
            dragInputIsTouch.current = false;
            dragPointerRef.current = null;
            return;
          }

          let insertIdx: number;
          if (dragFromSection === target.sectionId) {
            const withoutDragged = targetSectionIds.filter((id) => !dragSetLocal.has(id));
            const targetFirstIdx = withoutDragged.indexOf(targetLineIds[0]);
            if (dropSide === 'right') {
              // Insert after the target evo line
              const lastInLine = targetLineIds[targetLineIds.length - 1];
              const lastIdx = withoutDragged.indexOf(lastInLine);
              insertIdx = lastIdx >= 0 ? lastIdx + 1 : withoutDragged.length;
            } else {
              insertIdx = targetFirstIdx >= 0 ? targetFirstIdx : withoutDragged.length;
            }
          } else {
            const targetFirstIdx = targetSectionIds.indexOf(targetLineIds[0]);
            if (dropSide === 'right') {
              const lastInLine = targetLineIds[targetLineIds.length - 1];
              const lastIdx = targetSectionIds.indexOf(lastInLine);
              insertIdx = lastIdx >= 0 ? lastIdx + 1 : targetSectionIds.length;
            } else {
              insertIdx = targetFirstIdx >= 0 ? targetFirstIdx : targetSectionIds.length;
            }
          }

          moveEvoLine(dragFromSection, dragLineIds, target.sectionId, insertIdx);
        }
      }

      setDragLineIds(null);
      setDragFromSection(null);
      setOverTileId(null);
      setDropSide('left');
      dragInputIsTouch.current = false;
      dragPointerRef.current = null;
    },
    [dragLineIds, dragFromSection, sections, moveEvoLine, dropSide]
  );

  const handleDragCancel = useCallback(() => {
    setDragLineIds(null);
    setDragFromSection(null);
    setOverTileId(null);
    setDropSide('left');
    dragInputIsTouch.current = false;
    dragPointerRef.current = null;
  }, []);

  const insertIndicator = useMemo<{ tileId: string | null; endSection: string | null; side: 'left' | 'right' }>(() => {
    if (!overTileId || !dragLineIds) return { tileId: null, endSection: null, side: 'left' };

    if (isEndSentinel(overTileId)) {
      return { tileId: null, endSection: parseEndSentinel(overTileId), side: 'left' };
    }

    const target = parseTileId(overTileId);
    const dragSetLocal = new Set(dragLineIds);
    if (dragSetLocal.has(target.pokemonId)) return { tileId: null, endSection: null, side: 'left' };

    const targetSectionIds = sections[target.sectionId] ?? [];
    const targetLineIds = findEvoLineGroup(target.pokemonId, targetSectionIds);
    if (targetLineIds.length === 0) return { tileId: null, endSection: null, side: 'left' };

    if (dropSide === 'right') {
      // Show indicator on right edge of last tile in the target evo line
      const lastId = targetLineIds[targetLineIds.length - 1];
      return { tileId: tileId(target.sectionId, lastId), endSection: null, side: 'right' };
    }
    return { tileId: tileId(target.sectionId, targetLineIds[0]), endSection: null, side: 'left' };
  }, [overTileId, dragLineIds, sections, dropSide]);

  const handleAddClick = useCallback((groupId: string) => {
    const group = BUILD_GROUPS.find(g => g.id === groupId);
    setSearchQuery('');
    setTypeFilter(null);
    setGenerationFilter(null);
    setEvoLineSizeFilter(null);
    setActiveSection(groupId);
    if (group?.filterType === 'category') {
      setCategoryFilter(group.filterId);
      setArchetypeFilter(null);
    } else if (group?.filterType === 'archetype') {
      setArchetypeFilter(group.filterId);
      setCategoryFilter(null);
    } else {
      setCategoryFilter(null);
      setArchetypeFilter(null);
    }
    setMobileBrowserOpen(true);
  }, [setSearchQuery, setTypeFilter, setGenerationFilter, setEvoLineSizeFilter, setActiveSection, setCategoryFilter, setArchetypeFilter, setMobileBrowserOpen]);

  const dragSet = useMemo(() => new Set(dragLineIds ?? []), [dragLineIds]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b h-11">
        <h2 className="text-2xl font-extrabold tracking-tight leading-none">
          <span className="text-primary">{totalPlaced}</span>
          <span className="text-foreground">/151</span>
        </h2>
        <SettingsMenu onClear={clearAll} />
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain md:overscroll-auto"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
          <div className="p-3 pb-0">
            <DndContext
              sensors={sensors}
              collisionDetection={effectiveCursorCollision}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="space-y-1.5">
                {BUILD_GROUPS.map((group) => (
                  <GroupBox
                    key={group.id}
                    group={group}
                    pokemonIds={sections[group.id] ?? []}
                    dragLineIds={dragLineIds}
                    dragSet={dragSet}
                    insertIndicator={insertIndicator}
                    onAddClick={handleAddClick}
                  />
                ))}
              </div>

              <DragOverlay dropAnimation={null}>
                {dragLineIds && (
                  <div
                    className="flex gap-[1vw] md:gap-1"
                    style={{ transform: `translateY(-${OVERLAY_LIFT_PX}px)` }}
                  >
                    {dragLineIds.map((id) => (
                      <div key={id} className="w-[calc((100vw-24px-5vw)/6)] md:w-[calc((100%-20px)/6)] max-w-[90px]">
                        <PokemonTileStatic id={id} />
                      </div>
                    ))}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </div>
          <PageFooter />
      </div>
    </div>
  );
}
