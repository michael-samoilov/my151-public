import { HeaderActionButton } from '@/components/ui/HeaderActionButton';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePokedexStore } from '@/store/usePokedexStore';
import { BUILD_GROUPS, type BuildGroup } from '@/data/slot-template';
import { pokemonLabel, sectionName, t, useNamesVersion } from '@/i18n';
import { computeRemovalCascade, getEvolutionChainIds, getEvolutionLine, getPokemonById } from '@/hooks/usePokemonData';
import { createEffectiveCursorCollision, createSnapCenterToPointer, dragInputIsTouch, dragPointerRef } from '@/lib/dragCollision';
import { cn } from '@/lib/utils';
import { useDragSensors } from '@/lib/dragSensors';
import { sectionColor } from '@/lib/sectionColors';
import { useToolbarSlot } from '@/components/layout/toolbarSlot';
import {
  PokemonTileContent,
  TILE_ACTION_BUTTON_CLASS,
  TILE_GEN_BADGE_CLASS,
  TILE_ROOT_PADDING_CLASS,
  useTileGridMaxWidth,
  useTileSpritePx,
} from '@/components/shared/PokemonTile';
import { Trash2, Plus, Settings } from 'lucide-react';
import { RedXIcon } from '@/components/browser/EvoLineCard';

import { PageFooter } from '@/components/shared/PageFooter';
import { IntroCard } from '@/components/pokedex/IntroCard';
import { EffectiveCursorMarker } from '@/components/shared/EffectiveCursorMarker';
import { DragMeasureKicker } from '@/components/shared/DragMeasureKicker';
import {
  DndContext,
  DragOverlay,
  useDroppable,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';

/**
 * Re-measure droppable rects on every frame. See ViewPage.tsx for the
 * full rationale — in short, iOS Safari collapses its URL bar on the
 * first touch after a page load, shifting layout; dnd-kit's default
 * WhileDragging strategy caches rects at drag-start, so the snap
 * indicator ends up stuck on pre-shift tile positions while the faint
 * viewport-fixed cursor tracks the real finger. Always-measuring
 * keeps both in sync.
 */
const DND_MEASURING = {
  droppable: { strategy: MeasuringStrategy.Always },
} as const;

// Page-specific drag geometry. The build page uses ~60-80px tiles on
// mobile, so the held overlay lifts 90px above the pointer and the
// hit-test target lifts 180px — enough clearance for the sprite and
// the target tile above it. See src/lib/dragCollision.ts for the
// visual stack explanation.
const OVERLAY_LIFT_PX = 63;
const TOUCH_HIT_LIFT_PX = 180;
const effectiveCursorCollision = createEffectiveCursorCollision(TOUCH_HIT_LIFT_PX);
const snapCenterToPointer = createSnapCenterToPointer(OVERLAY_LIFT_PX);

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

/**
 * Returns the set of IDs that would be removed if the user clicked the
 * delete button on `pokemonId`. Delegates to the shared cascade helper so
 * the hover preview matches `removeBranch` exactly (including the
 * cross-gen individual-removal carve-out).
 */
function computeRemoveSet(pokemonId: number, sectionIds: number[]): Set<number> {
  return computeRemovalCascade(pokemonId, sectionIds);
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
import { DRAG_SOURCE_OPACITY, HeldItems } from '@/components/shared/dragHold';

// ---------- static pokemon tile (for overlay) ----------

function PokemonTileStatic({ id }: { id: number }) {
  const pokemon = getPokemonById(id);
  // Sprite sizing + internal ratios come from the shared tile primitives
  // so the build page, selection pane, and drag overlay all render the
  // same Pokemon at the same size at a given viewport width.
  const spritePx = useTileSpritePx();
  if (!pokemon) return null;
  return (
    <div
      className={cn(
        'relative bg-card border rounded-lg flex flex-col items-center shadow-lg',
        TILE_ROOT_PADDING_CLASS,
      )}
      style={{ ['--tile-sprite' as string]: `${spritePx}px` }}
    >
      <GenBadge gen={pokemon.generation} className={TILE_GEN_BADGE_CLASS} />
      <PokemonTileContent pokemon={pokemon} />
    </div>
  );
}

// ---------- draggable + droppable tile ----------

// Memoized so a render of the page around it (the header, a tab's pre-mount,
// the toolbar slot arriving) does not re-render all 151 tiles. Its props are
// primitives, and it subscribes to the names and locale it reads itself.
const DraggableTile = memo(function DraggableTile({
  id,
  pokemonId,
  sectionId,
  isDraggedLine,
  showInsertBefore,
  showInsertAfter,
  showX = false,
}: {
  id: string;
  pokemonId: number;
  sectionId: string;
  isDraggedLine: boolean;
  showInsertBefore: boolean;
  showInsertAfter: boolean;
  showX?: boolean;
}) {
  const removeBranch = usePokedexStore((s) => s.removeBranch);
  const pokemon = getPokemonById(pokemonId);
  const spritePx = useTileSpritePx();
  // The X's accessible name carries the Pokémon's name, which lands with the
  // name catalog after first paint.
  useNamesVersion();

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
      style={{
        opacity: isDragging || isDraggedLine ? DRAG_SOURCE_OPACITY : 1,
        ['--tile-sprite' as string]: `${spritePx}px`,
      }}
    >
      {showInsertBefore && (
        <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-full z-20 -translate-x-[calc(50%+2px)]" />
      )}
      {showInsertAfter && (
        <div className="absolute right-0 top-1 bottom-1 w-[3px] bg-primary rounded-full z-20 translate-x-[calc(50%+2px)]" />
      )}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'relative bg-card border rounded-lg flex flex-col items-center cursor-grab active:cursor-grabbing select-none',
          TILE_ROOT_PADDING_CLASS,
        )}
      >
        <GenBadge gen={pokemon.generation} className={TILE_GEN_BADGE_CLASS} />
        <button type="button"
          onClick={() => removeBranch(sectionId, pokemonId)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={t('builder.remove', { name: pokemonLabel(pokemon.id, pokemon.name).full })}
          className={cn(
            TILE_ACTION_BUTTON_CLASS,
            // For a finger, the target is wider than the glyph; see index.css.
            'tile-remove-target cursor-pointer md:opacity-0 md:focus-visible:opacity-100 transition-opacity',
            showX && 'md:!opacity-100',
          )}
          style={{ transform: 'translateZ(0)' }}
        >
          <RedXIcon className="w-full h-full" />
        </button>
        <PokemonTileContent pokemon={pokemon} />
      </div>
    </div>
  );
});

// ---------- end-of-section drop zone ----------

const END_SENTINEL = 'end::';
function endSentinelId(sectionId: string) { return `${END_SENTINEL}${sectionId}`; }
function isEndSentinel(id: string) { return id.startsWith(END_SENTINEL); }
function parseEndSentinel(id: string) { return id.slice(END_SENTINEL.length); }

function EndDropZone({ sectionId, showIndicator, aspect }: { sectionId: string; showIndicator: boolean; aspect: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: endSentinelId(sectionId) });
  return (
    <div
      ref={setNodeRef}
      className={`relative ${aspect} rounded-lg border-2 border-dashed flex items-center justify-center transition-colors ${
        isOver ? 'border-primary/50 bg-primary/5' : 'border-transparent'
      }`}
    >
      {showIndicator && (
        <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-full z-20 -translate-x-[calc(50%+2px)]" />
      )}
    </div>
  );
}

// ---------- add-tile sizing ----------

// The grid is six columns wide, always. A dashed cell (a "+", a starter type
// placeholder, the end-of-section drop zone) that shares its row with a
// Pokémon tile stretches to that row's height, as tall as the tile, on every
// width. A row that holds no tile has no height to stretch to, so its dashed
// cells stay square instead of collapsing to a short strip: a trailing "+"
// that starts a fresh row on a section of exactly n*6 Pokémon, a block of type
// placeholders under a full row, or an empty section's lone "+".
const PLUS_COLS = 6;
/** The aspect class for a dashed cell, given whether a tile shares its row. */
function dashedCellAspect(rowHasTile: boolean): string {
  return rowHasTile ? '' : 'aspect-square';
}
/** The aspect class for a trailing dashed cell, given the count of tiles before it. */
function trailingPlusAspect(precedingCount: number): string {
  return dashedCellAspect(precedingCount % PLUS_COLS !== 0);
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
  showXIds = new Set(),
}: {
  pokemonIds: number[];
  dragLineIds: number[] | null;
  dragSet: Set<number>;
  insertIndicator: { tileId: string | null; endSection: string | null; side: 'left' | 'right' };
  onTypeClick: (type: string) => void;
  onAddClick: () => void;
  showXIds?: Set<number>;
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

    // One flat list of slots in grid order, so a placeholder can tell whether a
    // Pokémon tile shares its six-column row: if so it stretches to that tile's
    // height, otherwise it stays a square rather than a short strip.
    type Slot =
      | { kind: 'tile'; pid: number }
      | { kind: 'ph'; type: string; color: string; i: number };
    const slots: Slot[] = [];
    for (const [type, color] of STARTER_TYPES) {
      const typePids = pidsByType.get(type);
      if (typePids) {
        for (const pid of typePids) slots.push({ kind: 'tile', pid });
      } else {
        for (let i = 0; i < 3; i++) slots.push({ kind: 'ph', type, color, i });
      }
    }
    const rowHasTile: boolean[] = [];
    slots.forEach((s, idx) => {
      if (s.kind === 'tile') rowHasTile[Math.floor(idx / PLUS_COLS)] = true;
    });

    return (
      <>
        {slots.map((s, idx) => {
          if (s.kind === 'tile') {
            const tid = tileId('starter', s.pid);
            return (
              <DraggableTile
                key={tid}
                id={tid}
                pokemonId={s.pid}
                sectionId="starter"
                isDraggedLine={dragSet.has(s.pid)}
                showInsertBefore={insertIndicator.tileId === tid && insertIndicator.side === 'left'}
                showInsertAfter={insertIndicator.tileId === tid && insertIndicator.side === 'right'}
                showX={showXIds.has(s.pid)}
              />
            );
          }
          const aspect = dashedCellAspect(rowHasTile[Math.floor(idx / PLUS_COLS)] ?? false);
          return (
            <button type="button"
              key={`${s.type}-${s.i}`}
              onClick={() => onTypeClick(s.type)}
              className={`${aspect} rounded-lg border-2 border-dashed flex items-center justify-center transition-[color,background-color,border-color,opacity,scale] duration-150 ease-out active:scale-[0.97] cursor-pointer hover:opacity-80`}
              style={{ borderColor: `${s.color}40`, color: `${s.color}90`, backgroundColor: `${s.color}10` }}
            >
              <Plus className="w-[27%] h-[27%]" />
            </button>
          );
        })}
      </>
    );
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
            showX={showXIds.has(pid)}
          />
        );
      })}
      {dragLineIds && pokemonIds.length > 0 && (
        <EndDropZone
          sectionId="starter"
          showIndicator={insertIndicator.endSection === 'starter'}
          aspect={trailingPlusAspect(pokemonIds.length)}
        />
      )}
      {!dragLineIds && (
        <button type="button"
          onClick={onAddClick}
          aria-label="Add a Pokémon to Starters"
          className={`${trailingPlusAspect(pokemonIds.length)} rounded-lg border-2 border-dashed flex items-center justify-center transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.97] cursor-pointer border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary`}
        >
          <Plus className="w-[27%] h-[27%]" />
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
  // Accessible fill/stroke pair (see src/lib/sectionColors.ts): the light FILL
  // tints the section background, the dark STROKE draws the border, label, and
  // empty-state "+", so text/outline stay legible on the fill for every section.
  const { fill: sectionFill, stroke: sectionStroke } = sectionColor(group.id);

  // Hover state for evo-line X highlight.
  // Uses onMouseOver on the grid container (bubbles from any descendant) to detect
  // the current tile via closest('[data-tile-id]'), so X buttons disappear as soon
  // as the pointer enters a gap/padding area — no debounce needed.
  const [hoveredPokemonId, setHoveredPokemonId] = useState<number | null>(null);
  const showXIds = useMemo(
    () => hoveredPokemonId !== null ? computeRemoveSet(hoveredPokemonId, pokemonIds) : new Set<number>(),
    [hoveredPokemonId, pokemonIds],
  );
  const handleGridMouseOver = useCallback((e: React.MouseEvent) => {
    const tileEl = (e.target as HTMLElement).closest('[data-tile-id]');
    if (tileEl) {
      const { pokemonId } = parseTileId(tileEl.getAttribute('data-tile-id')!);
      setHoveredPokemonId(pokemonId);
    } else {
      setHoveredPokemonId(null);
    }
  }, []);

  // Animate height changes (e.g. when removing a pokemon causes a row to collapse)
  const boxRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    // When the builder tab is hidden (display:none on an ancestor) scrollHeight
    // reports 0. Bail in that case: don't animate and don't overwrite the
    // baseline. Animating to 0 on hide would lock the element at height:0
    // (transitionend never fires under display:none), so returning to the tab
    // would show every section as a 1px line. Animating from 0 on show would
    // cascade every section back to full height on every tab switch.
    const newHeight = el.scrollHeight;
    if (newHeight === 0) return;

    const oldHeight = prevHeightRef.current;

    if (oldHeight !== null && oldHeight !== 0 && oldHeight !== newHeight) {
      el.style.height = `${oldHeight}px`;
      el.style.overflow = 'hidden';
      el.style.transition = 'none';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = 'height 150ms ease-in-out';
          el.style.height = `${newHeight}px`;
        });
      });
    } else if (el.style.height) {
      // No animation needed, but stale inline styles are present from an
      // earlier animation that was interrupted (e.g. by the tab being hidden
      // before transitionend fired). Clear them so natural layout resumes.
      el.style.height = '';
      el.style.overflow = '';
      el.style.transition = '';
    }

    prevHeightRef.current = newHeight;
    // Scoped to the only React-driven cause of a height change. Without a
    // dependency list this ran after every commit, so each of the ~29 group
    // boxes did a scrollHeight read (and sometimes a style write) on every
    // builder interaction — forced-reflow thrash inside the layout phase.
    // The ResizeObserver below keeps prevHeightRef honest for layout shifts
    // that React does not drive.
  }, [pokemonIds]);

  // Keep prevHeightRef current with the element's actual rendered height,
  // independent of React re-renders. Without this, the useLayoutEffect above
  // only updates the ref on re-render — so any layout shift that happens
  // while PokedexGrid is quiet (sprite/font loads, viewport resize) goes
  // unnoticed, and the next drag-start re-render misreads the accumulated
  // delta as a fresh change and triggers a 150ms height collapse animation.
  // ResizeObserver fires on every real layout change, keeping the baseline
  // in sync. scrollHeight (not offsetHeight) so mid-animation fires don't
  // capture the transitioning intermediate value.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Ignore hidden-state measurements (scrollHeight = 0) so the baseline
      // stays at the last real height across tab switches.
      const h = el.scrollHeight;
      if (h > 0) prevHeightRef.current = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      data-section-id={group.id}
      onTransitionEnd={handleTransitionEnd}
      className="rounded-lg"
      style={{
        backgroundColor: `${sectionFill}${hasPokemon ? '10' : '10'}`,
        border: `1px solid ${sectionStroke}30`,
      }}
    >
      {/* Label */}
      <div
        className="text-xs font-semibold uppercase tracking-wide px-1.5"
        style={{
          color: sectionStroke,
          opacity: showEmptyState ? 0.75 : 1,
          paddingTop: showEmptyState ? '0px' : '4px',
          paddingBottom: showEmptyState ? '0px' : '2px',
        }}
      >
        {sectionName(group.id)}{pokemonIds.length > 0 && ` (${pokemonIds.length})`}
      </div>

      {showEmptyState ? (
        /* Empty: single "+" at tile size. During drag swap to an
           EndDropZone so the section itself is a drop target — without
           it, there's no droppable here at all and the cursor can't
           snap to an empty section (not even to the left of the "+"). */
        <div className="grid grid-cols-6 gap-1 p-1 pt-0">
          {dragLineIds ? (
            <EndDropZone
              sectionId={group.id}
              showIndicator={insertIndicator.endSection === group.id}
              aspect="aspect-square"
            />
          ) : (
            <button type="button"
              onClick={() => onAddClick(group.id)}
              aria-label={t('builder.addToSection', { section: sectionName(group.id) })}
              // Stable handle for e2e: the accessible name is translated, and
              // the pseudo-locales rewrite it beyond matching.
              data-add-slot
              className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-[color,background-color,border-color,opacity,scale] duration-150 ease-out active:scale-[0.97] cursor-pointer hover:opacity-80"
              style={{
                borderColor: `${sectionStroke}55`,
                color: `${sectionStroke}b0`,
              }}
            >
              <Plus className="w-[27%] h-[27%]" />
            </button>
          )}
        </div>
      ) : (
        /* Filled: grid of tiles */
        <div
          className="grid grid-cols-6 gap-1 p-1 pt-0"
          onMouseOver={handleGridMouseOver}
          onMouseLeave={() => setHoveredPokemonId(null)}
        >
          {isStarter ? (
            <StarterContent
              pokemonIds={pokemonIds}
              dragLineIds={dragLineIds}
              dragSet={dragSet}
              insertIndicator={insertIndicator}
              onTypeClick={(type) => {
                const store = usePokedexStore.getState();
                store.resetBrowserFilters();
                store.setActiveSection('starter');
                store.setCategoryFilter('starter');
                store.setTypeFilter([type]);
                store.setMobileBrowserOpen(true);
              }}
              onAddClick={() => onAddClick('starter')}
              showXIds={showXIds}
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
                    showX={showXIds.has(pid)}
                  />
                );
              })}
              {dragLineIds && pokemonIds.length > 0 && (
                <EndDropZone
                  sectionId={group.id}
                  showIndicator={insertIndicator.endSection === group.id}
                  aspect={trailingPlusAspect(pokemonIds.length)}
                />
              )}
              {!dragLineIds && (
                <button type="button"
                  onClick={() => onAddClick(group.id)}
                  aria-label={t('builder.addToSection', { section: sectionName(group.id) })}
                  data-add-slot
                  className={`${trailingPlusAspect(pokemonIds.length)} rounded-lg border-2 border-dashed flex items-center justify-center transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.97] cursor-pointer border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary`}
                >
                  <Plus className="w-[27%] h-[27%]" />
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
      <HeaderActionButton type="button"
        onClick={() => { setOpen(!open); setConfirming(false); }}
        aria-label="Settings"
        className="text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <Settings className="w-4 h-4" />
      </HeaderActionButton>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-popover border rounded-lg shadow-lg z-30 min-w-[160px] py-1">
          <button type="button"
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
  const resetBrowserFilters = usePokedexStore((s) => s.resetBrowserFilters);
  const setCategoryFilter = usePokedexStore((s) => s.setCategoryFilter);
  const clearAll = usePokedexStore((s) => s.clearAll);
  const toolbarSlot = useToolbarSlot('builder');
  const moveEvoLine = usePokedexStore((s) => s.moveEvoLine);

  const totalPlaced = Object.values(sections).reduce((s, a) => s + a.length, 0);
  const containerMaxW = useTileGridMaxWidth(6, 4, 32);

  // Scroll container ref — used for auto-scroll when desktop browser adds pokemon
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const sectionId = (e as CustomEvent<string>).detail;
      const container = scrollContainerRef.current;
      if (!container || !sectionId) return;
      // Wait a frame for the DOM to update with the newly added pokemon
      requestAnimationFrame(() => {
        const el = container.querySelector(`[data-section-id="${sectionId}"]`);
        if (!el) return;
        // Check if the element is already visible in the scroll container
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom) return;
        // Scroll smoothly to the section
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    };
    window.addEventListener('scroll-to-section', handler);
    return () => window.removeEventListener('scroll-to-section', handler);
  }, []);

  // Drag state
  const [dragLineIds, setDragLineIds] = useState<number[] | null>(null);
  // The grabbed tile's own width, in client pixels. The held copy used to
  // size itself with a percentage of the grid's column maths, which resolves
  // against the drag overlay's box instead — every held tile came out half
  // width and the line overlapped itself.
  const [dragTileWidth, setDragTileWidth] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [dragFromSection, setDragFromSection] = useState<string | null>(null);
  const [overTileId, setOverTileId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'left' | 'right'>('left');

  const sensors = useDragSensors();

  const resetDrag = useCallback(() => {
    setDragLineIds(null);
    setDragTileWidth(null);
    setDragFromSection(null);
    setOverTileId(null);
    setDropSide('left');
    dragInputIsTouch.current = false;
    dragPointerRef.current = null;
    setCursorPos(null);
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { sectionId, pokemonId } = parseTileId(event.active.id as string);
      const sectionIds = sections[sectionId] ?? [];
      const lineIds = findEvoLineGroup(pokemonId, sectionIds);
      setDragLineIds(lineIds);
      const node = document.querySelector(`[data-tile-id="${CSS.escape(String(event.active.id))}"]`);
      setDragTileWidth(node?.getBoundingClientRect().width ?? null);
      setDragFromSection(sectionId);
      dragInputIsTouch.current = event.activatorEvent instanceof TouchEvent;
    },
    [sections]
  );

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    // Update the faint effective-cursor marker. The hit-test point on
    // touch is lifted above the thumb by TOUCH_HIT_LIFT_PX; on desktop
    // it's the raw mouse.
    const rawPtr = dragPointerRef.current;
    if (rawPtr) {
      setCursorPos({
        x: rawPtr.x,
        y: rawPtr.y - (dragInputIsTouch.current ? TOUCH_HIT_LIFT_PX : 0),
      });
    }

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
            resetDrag();
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

      resetDrag();
    },
    [dragLineIds, dragFromSection, sections, moveEvoLine, dropSide, resetDrag]
  );

  const handleDragCancel = useCallback(() => resetDrag(), [resetDrag]);

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
    resetBrowserFilters();
    setActiveSection(groupId);
    if (group?.filterType === 'category') {
      setCategoryFilter(group.filterId);
    } else if (group?.filterType === 'archetype') {
      setArchetypeFilter(group.filterId);
    }
    setMobileBrowserOpen(true);
  }, [resetBrowserFilters, setActiveSection, setCategoryFilter, setArchetypeFilter, setMobileBrowserOpen]);

  const dragSet = useMemo(() => new Set(dragLineIds ?? []), [dragLineIds]);

  return (
    <div className="flex flex-col h-full">
      {/* This page's controls live in the shared tool bar, not a row of its
          own — the count and nav are the header's job now. */}
      {toolbarSlot && createPortal(<SettingsMenu onClear={clearAll} />, toolbarSlot)}

      <div
        ref={scrollContainerRef}
        data-build-scroll
        // The scroll container itself is capped and centred, not the content
        // inside it, so its scrollbar rides the content's right edge instead of
        // sitting far out in the empty margin. `scrollbar-gutter: stable` keeps
        // the rail's width reserved so it does not flicker as content grows.
        className="flex-1 min-h-0 w-full overflow-y-auto overscroll-contain md:overscroll-auto"
        style={{ maxWidth: containerMaxW, marginInline: containerMaxW ? 'auto' : undefined, scrollbarGutter: 'stable', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
          <div className="p-3 pb-0">
            <IntroCard
              totalPlaced={totalPlaced}
              onChooseStarters={() => handleAddClick('starter')}
            />
            <DndContext
              sensors={sensors}
              collisionDetection={effectiveCursorCollision}
              modifiers={[snapCenterToPointer]}
              measuring={DND_MEASURING}
              autoScroll={{ layoutShiftCompensation: false }}
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
                  <HeldItems>
                    <div className="flex gap-1">
                      {dragLineIds.map((id) => (
                        <div key={id} style={{ width: dragTileWidth ?? undefined }}>
                          <PokemonTileStatic id={id} />
                        </div>
                      ))}
                    </div>
                  </HeldItems>
                )}
              </DragOverlay>
              {cursorPos && dragLineIds && (
                <EffectiveCursorMarker x={cursorPos.x} y={cursorPos.y} />
              )}
              <DragMeasureKicker />
            </DndContext>
          </div>
          <PageFooter faq="dex" />
      </div>
    </div>
  );
}
