import { useCallback, useMemo, useRef, useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { SECTION_DEFS, computeEmptySlots } from '@/data/slot-template';
import { getEvolutionLine, getPokemonById } from '@/hooks/usePokemonData';
import { TYPE_COLORS } from '@/data/type-colors';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, X } from 'lucide-react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';

// ---------- helpers ----------

/** Find which evo line group a pokemonId belongs to */
function findEvoLineGroup(pokemonId: number, sectionIds: number[]): number[] {
  const line = getEvolutionLine(pokemonId);
  const lineIdSet = new Set(line.map((p) => p.id));
  return sectionIds.filter((id) => lineIdSet.has(id));
}

/** Encode tile ID: sectionId::pokemonId */
function tileId(sectionId: string, pokemonId: number) {
  return `${sectionId}::${pokemonId}`;
}

function parseTileId(id: string): { sectionId: string; pokemonId: number } {
  const [sectionId, pidStr] = id.split('::');
  return { sectionId, pokemonId: Number(pidStr) };
}

// ---------- gen badge ----------

const GEN_GRADIENTS: Record<number, string> = {
  1: 'linear-gradient(135deg, #DC0A2D 50%, #3B4CCA 50%)',
  2: 'linear-gradient(135deg, #DAA520 33%, #C0C0C0 33%, #C0C0C0 66%, #7FC8E8 66%)',
  3: 'linear-gradient(135deg, #A00000 33%, #0055BF 33%, #0055BF 66%, #00A86B 66%)',
  4: 'linear-gradient(135deg, #AACCEE 50%, #FFAACC 50%)',
  5: 'linear-gradient(135deg, #1a1a1a 50%, #f0f0f0 50%)',
  6: 'linear-gradient(135deg, #025DA6 50%, #EA1A3E 50%)',
  7: 'linear-gradient(135deg, #F5A623 50%, #5C4D9A 50%)',
  8: 'linear-gradient(135deg, #00A1E9 50%, #E3003A 50%)',
  9: 'linear-gradient(135deg, #E3350D 50%, #7B2D8E 50%)',
};

function GenBadge({ gen, className }: { gen: number; className?: string }) {
  const size = 14;
  return (
    <div className={className} style={{ background: GEN_GRADIENTS[gen] ?? '#888' }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
        <text
          x="50%" y="52%" dominantBaseline="central" textAnchor="middle"
          fill="white" fontSize="8" fontWeight="800"
          fontFamily="system-ui, sans-serif"
          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 1.5 }}
        >
          {gen}
        </text>
      </svg>
    </div>
  );
}

// ---------- static pokemon tile (for overlay) ----------

function PokemonTileStatic({ id }: { id: number }) {
  const pokemon = getPokemonById(id);
  if (!pokemon) return null;
  return (
    <div className="relative bg-card border rounded-lg flex flex-col items-center justify-center p-[0.5vw] md:p-1 aspect-square shadow-lg">
      <GenBadge
        gen={pokemon.generation}
        className="absolute top-[0.5vw] left-[0.5vw] md:top-0.5 md:left-0.5 w-[3vw] h-[3vw] md:w-3.5 md:h-3.5 rounded-full overflow-hidden"
      />
      <div
        className="w-[8vw] h-[8vw] md:w-10 md:h-10"
        style={{
          backgroundImage: `url(${pokemon.sprite})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          imageRendering: 'pixelated',
        }}
        role="img"
        aria-label={pokemon.name}
      />
      <span className="text-[min(1.8vw,7px)] md:text-[7px] font-medium capitalize truncate w-full text-center leading-tight">
        {pokemon.name}
      </span>
      <div className="flex gap-[0.3vw] md:gap-0.5 mt-[0.3vw] md:mt-0.5">
        {pokemon.types.map((t) => (
          <span
            key={t}
            className="px-[0.8vw] md:px-1 py-[0.1vw] md:py-px rounded text-[min(1.4vw,5px)] md:text-[5px] font-semibold capitalize text-white leading-tight"
            style={{ backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS] }}
          >
            {t}
          </span>
        ))}
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
}: {
  id: string;
  pokemonId: number;
  sectionId: string;
  isDraggedLine: boolean;
  showInsertBefore: boolean;
}) {
  const removeEvoLine = usePokedexStore((s) => s.removeEvoLine);
  const pokemon = getPokemonById(pokemonId);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id });

  const { setNodeRef: setDropRef } = useDroppable({ id });

  // Merge both refs onto the outer div
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
      className="relative"
      style={{ opacity: isDragging || isDraggedLine ? 0.25 : 1 }}
    >
      {/* Vertical insert indicator */}
      {showInsertBefore && (
        <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-full z-20 -translate-x-[calc(50%+0.5vw)] md:-translate-x-[calc(50%+2px)]" />
      )}
      <div
        {...attributes}
        {...listeners}
        onContextMenu={(e) => e.preventDefault()}
        className="relative bg-card border rounded-lg flex flex-col items-center justify-center p-[0.5vw] md:p-1 group aspect-square touch-none cursor-grab active:cursor-grabbing select-none"
        style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
      >
        <GenBadge
          gen={pokemon.generation}
          className="absolute top-[0.5vw] left-[0.5vw] md:top-0.5 md:left-0.5 w-[3vw] h-[3vw] md:w-3.5 md:h-3.5 rounded-full overflow-hidden"
        />
        <button
          onClick={() => removeEvoLine(sectionId, pokemonId)}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-[0.5vw] right-[0.5vw] md:top-0.5 md:right-0.5 w-[3vw] h-[3vw] md:w-3.5 md:h-3.5 rounded-full bg-destructive/60 md:bg-destructive/80 text-white flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"
        >
          <X className="w-[1.5vw] h-[1.5vw] md:w-2 md:h-2" />
        </button>
        <div
          className="w-[8vw] h-[8vw] md:w-10 md:h-10"
          style={{
            backgroundImage: `url(${pokemon.sprite})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            imageRendering: 'pixelated',
          }}
          role="img"
          aria-label={pokemon.name}
        />
        <span className="text-[min(1.8vw,7px)] md:text-[7px] font-medium capitalize truncate w-full text-center leading-tight">
          {pokemon.name}
        </span>
        <div className="flex gap-[0.3vw] md:gap-0.5 mt-[0.3vw] md:mt-0.5">
          {pokemon.types.map((t) => (
            <span
              key={t}
              className="px-[0.8vw] md:px-1 py-[0.1vw] md:py-px rounded text-[min(1.4vw,5px)] md:text-[5px] font-semibold capitalize text-white leading-tight"
              style={{ backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS] }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- end-of-section drop zone ----------

/** Sentinel ID prefix for "drop at end of section" */
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

// ---------- main grid ----------

export function PokedexGrid() {
  const sections = usePokedexStore((s) => s.sections);
  const activeSection = usePokedexStore((s) => s.activeSection);
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
  const emptySlots = computeEmptySlots(sections);

  // Track which evo line is being dragged
  const [dragLineIds, setDragLineIds] = useState<number[] | null>(null);
  const [dragFromSection, setDragFromSection] = useState<string | null>(null);
  const [overTileId, setOverTileId] = useState<string | null>(null);
  const isTouchDrag = useRef(false);

  // Sensors
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { sectionId, pokemonId } = parseTileId(event.active.id as string);
      const sectionIds = sections[sectionId] ?? [];
      const lineIds = findEvoLineGroup(pokemonId, sectionIds);
      setDragLineIds(lineIds);
      setDragFromSection(sectionId);
      isTouchDrag.current = event.activatorEvent instanceof TouchEvent;
    },
    [sections]
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverTileId(event.over ? (event.over.id as string) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { over } = event;

      if (over && dragLineIds && dragFromSection) {
        const overId = over.id as string;
        const dragSet = new Set(dragLineIds);

        // End-of-section sentinel: append to end
        if (isEndSentinel(overId)) {
          const targetSection = parseEndSentinel(overId);
          const targetSectionIds = sections[targetSection] ?? [];
          const insertIdx = dragFromSection === targetSection
            ? targetSectionIds.filter((id) => !dragSet.has(id)).length
            : targetSectionIds.length;
          moveEvoLine(dragFromSection, dragLineIds, targetSection, insertIdx);
        } else {
          const target = parseTileId(overId);
          const targetSectionIds = sections[target.sectionId] ?? [];
          const targetLineIds = findEvoLineGroup(target.pokemonId, targetSectionIds);

          // If dropping on self, no-op
          if (dragSet.has(target.pokemonId)) {
            setDragLineIds(null);
            setDragFromSection(null);
            setOverTileId(null);
            return;
          }

          // Find the index of the first member of the target evo line
          let insertIdx: number;
          if (dragFromSection === target.sectionId) {
            const withoutDragged = targetSectionIds.filter((id) => !dragSet.has(id));
            const targetFirstIdx = withoutDragged.indexOf(targetLineIds[0]);
            insertIdx = targetFirstIdx >= 0 ? targetFirstIdx : withoutDragged.length;
          } else {
            const targetFirstIdx = targetSectionIds.indexOf(targetLineIds[0]);
            insertIdx = targetFirstIdx >= 0 ? targetFirstIdx : targetSectionIds.length;
          }

          moveEvoLine(dragFromSection, dragLineIds, target.sectionId, insertIdx);
        }
      }

      setDragLineIds(null);
      setDragFromSection(null);
      setOverTileId(null);
    },
    [dragLineIds, dragFromSection, sections, moveEvoLine]
  );

  const handleDragCancel = useCallback(() => {
    setDragLineIds(null);
    setDragFromSection(null);
    setOverTileId(null);
  }, []);

  // Compute which tile should show the insert indicator (always snaps to evo line boundary)
  const insertIndicator = useMemo<{ tileId: string | null; endSection: string | null }>(() => {
    if (!overTileId || !dragLineIds) return { tileId: null, endSection: null };

    // End sentinel: show indicator at end of section
    if (isEndSentinel(overTileId)) {
      return { tileId: null, endSection: parseEndSentinel(overTileId) };
    }

    const target = parseTileId(overTileId);
    const dragSet = new Set(dragLineIds);
    if (dragSet.has(target.pokemonId)) return { tileId: null, endSection: null };

    // Find the first tile of the target's evo line
    const targetSectionIds = sections[target.sectionId] ?? [];
    const targetLineIds = findEvoLineGroup(target.pokemonId, targetSectionIds);
    if (targetLineIds.length === 0) return { tileId: null, endSection: null };
    return { tileId: tileId(target.sectionId, targetLineIds[0]), endSection: null };
  }, [overTileId, dragLineIds, sections]);

  const handleAddClick = (sectionId: string) => {
    setSearchQuery('');
    setTypeFilter(null);
    setGenerationFilter(null);
    setEvoLineSizeFilter(null);
    setActiveSection(sectionId);
    setArchetypeFilter(null);
    if (sectionId === 'starters') {
      setCategoryFilter('starter');
    } else {
      setCategoryFilter(null);
    }
    setMobileBrowserOpen(true);
  };

  const dragSet = useMemo(() => new Set(dragLineIds ?? []), [dragLineIds]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="text-lg font-bold">Your Pokedex</h2>
          <p className="text-sm text-muted-foreground">{totalPlaced}/151 filled</p>
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={clearAll}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Clear
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-3 space-y-5">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              {SECTION_DEFS.map((def) => {
                const pokemonIds = sections[def.id] ?? [];
                const emptyCount = emptySlots[def.id] ?? 0;
                const isActive = activeSection === def.id;

                return (
                  <section key={def.id}>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <h3 className="text-sm font-semibold">{def.name}</h3>
                      <span className="text-xs text-muted-foreground">({pokemonIds.length})</span>
                      <span className="text-xs text-muted-foreground italic">{def.description}</span>
                    </div>

                    <div className="grid grid-cols-6 gap-[1vw] md:gap-1">
                      {/* Starters: interleave tiles & type buttons in grass→fire→water order */}
                      {def.id === 'starters' && !dragLineIds && (() => {
                        const chains = new Set(pokemonIds.map(id => {
                          const line = getEvolutionLine(id);
                          return line?.[0] ?? id;
                        }));
                        if (chains.size >= 3) return null; // fall through to standard rendering
                        const typeOrder = [['grass', '#78C850'], ['fire', '#F08030'], ['water', '#6890F0']] as const;
                        const pidsByType = new Map<string, number[]>();
                        for (const pid of pokemonIds) {
                          const p = getPokemonById(pid);
                          if (!p) continue;
                          const matchedType = typeOrder.find(([t]) => p.types.includes(t as never));
                          if (matchedType) {
                            if (!pidsByType.has(matchedType[0])) pidsByType.set(matchedType[0], []);
                            pidsByType.get(matchedType[0])!.push(pid);
                          }
                        }
                        const elements: React.ReactNode[] = [];
                        for (const [type, color] of typeOrder) {
                          const typePids = pidsByType.get(type);
                          if (typePids) {
                            for (const pid of typePids) {
                              const tid = tileId(def.id, pid);
                              elements.push(
                                <DraggableTile
                                  key={tid}
                                  id={tid}
                                  pokemonId={pid}
                                  sectionId={def.id}
                                  isDraggedLine={dragSet.has(pid)}
                                  showInsertBefore={insertIndicator.tileId === tid}
                                />
                              );
                            }
                          } else if (totalPlaced < 151) {
                            for (let i = 0; i < 3; i++) {
                              elements.push(
                                <button
                                  key={`${type}-${i}`}
                                  onClick={() => {
                                    setSearchQuery('');
                                    setGenerationFilter(null);
                                    setEvoLineSizeFilter(null);
                                    setArchetypeFilter(null);
                                    setActiveSection('starters');
                                    setCategoryFilter('starter');
                                    setTypeFilter([type]);
                                    setMobileBrowserOpen(true);
                                  }}
                                  className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer hover:opacity-80"
                                  style={{ borderColor: color, color, backgroundColor: `${color}18` }}
                                >
                                  <Plus className="w-[4vw] h-[4vw] md:w-5 md:h-5" />
                                </button>
                              );
                            }
                          }
                        }
                        return elements;
                      })()}

                      {/* Standard tile rendering (for non-starters, or starters with 3+ lines) */}
                      {(def.id !== 'starters' || dragLineIds || (() => {
                        const chains = new Set(pokemonIds.map(id => {
                          const line = getEvolutionLine(id);
                          return line?.[0] ?? id;
                        }));
                        return chains.size >= 3;
                      })()) && pokemonIds.map((pid) => {
                        const tid = tileId(def.id, pid);
                        return (
                          <DraggableTile
                            key={tid}
                            id={tid}
                            pokemonId={pid}
                            sectionId={def.id}
                            isDraggedLine={dragSet.has(pid)}
                            showInsertBefore={insertIndicator.tileId === tid}
                          />
                        );
                      })}

                      {/* Drop zone for appending to end of section (visible during drag) */}
                      {dragLineIds && pokemonIds.length > 0 && (
                        <EndDropZone
                          sectionId={def.id}
                          showIndicator={insertIndicator.endSection === def.id}
                        />
                      )}

                      {/* Add button (hidden during drag) */}
                      {!dragLineIds && totalPlaced < 151 && (
                        <button
                          onClick={() => handleAddClick(def.id)}
                          className={`aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer ${
                            isActive
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary'
                          }`}
                        >
                          <Plus className="w-[4vw] h-[4vw] md:w-5 md:h-5" />
                        </button>
                      )}

                      {Array.from({ length: Math.max(0, emptyCount - 1) }).map((_, i) => (
                        <div
                          key={`empty-${i}`}
                          className="aspect-square rounded-lg border border-dashed border-muted-foreground/15 bg-muted/20"
                        />
                      ))}
                    </div>
                  </section>
                );
              })}

              <DragOverlay dropAnimation={null}>
                {dragLineIds && (
                  <div
                    className="flex gap-[1vw] md:gap-1"
                    style={isTouchDrag.current ? { transform: 'translateY(-80px)' } : undefined}
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
        </ScrollArea>
      </div>
    </div>
  );
}
