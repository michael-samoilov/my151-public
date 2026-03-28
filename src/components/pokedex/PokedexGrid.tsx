import { useCallback, useMemo, useRef, useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { BUILD_GROUPS, type BuildGroup } from '@/data/slot-template';
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

function findEvoLineGroup(pokemonId: number, sectionIds: number[]): number[] {
  const line = getEvolutionLine(pokemonId);
  const lineIdSet = new Set(line.map((p) => p.id));
  return sectionIds.filter((id) => lineIdSet.has(id));
}

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
  totalPlaced,
  dragLineIds,
  dragSet,
  insertIndicator,
  onTypeClick,
  onAddClick,
}: {
  pokemonIds: number[];
  totalPlaced: number;
  dragLineIds: number[] | null;
  dragSet: Set<number>;
  insertIndicator: { tileId: string | null; endSection: string | null };
  onTypeClick: (type: string) => void;
  onAddClick: () => void;
}) {
  const chains = new Set(pokemonIds.map(id => {
    const line = getEvolutionLine(id);
    return line?.[0] ?? id;
  }));

  // 3+ lines: standard rendering with trailing "+"
  if (chains.size >= 3 || dragLineIds) {
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
              showInsertBefore={insertIndicator.tileId === tid}
            />
          );
        })}
        {dragLineIds && pokemonIds.length > 0 && (
          <EndDropZone sectionId="starter" showIndicator={insertIndicator.endSection === 'starter'} />
        )}
        {!dragLineIds && totalPlaced < 151 && chains.size >= 3 && (
          <button
            onClick={onAddClick}
            className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary"
          >
            <Plus className="w-[4vw] h-[4vw] md:w-5 md:h-5" />
          </button>
        )}
      </>
    );
  }

  // < 3 lines: green/red/blue placeholders
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
            showInsertBefore={insertIndicator.tileId === tid}
          />
        );
      }
    } else if (totalPlaced < 151) {
      for (let i = 0; i < 3; i++) {
        elements.push(
          <button
            key={`${type}-${i}`}
            onClick={() => onTypeClick(type)}
            className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer hover:opacity-80"
            style={{ borderColor: color, color, backgroundColor: `${color}18` }}
          >
            <Plus className="w-[4vw] h-[4vw] md:w-5 md:h-5" />
          </button>
        );
      }
    }
  }
  return <>{elements}</>;
}

// ---------- group box ----------

function GroupBox({
  group,
  pokemonIds,
  totalPlaced,
  dragLineIds,
  dragSet,
  insertIndicator,
  onAddClick,
}: {
  group: BuildGroup;
  pokemonIds: number[];
  totalPlaced: number;
  dragLineIds: number[] | null;
  dragSet: Set<number>;
  insertIndicator: { tileId: string | null; endSection: string | null };
  onAddClick: (groupId: string) => void;
}) {
  const isEmpty = pokemonIds.length === 0;
  const isStarter = group.id === 'starter';
  // Starters always use the expanded grid path (for green/red/blue placeholders)
  const showEmptyState = isEmpty && !isStarter;

  return (
    <div
      className="rounded-lg"
      style={{
        backgroundColor: `${group.color}${showEmptyState ? '08' : '10'}`,
        border: `1px solid ${group.color}${showEmptyState ? '18' : '25'}`,
      }}
    >
      {/* Label */}
      <div
        className="text-[9px] font-semibold uppercase tracking-wide px-1.5"
        style={{
          color: `${group.color}`,
          opacity: showEmptyState ? 0.6 : 0.85,
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
            <Plus className="w-[4vw] h-[4vw] md:w-5 md:h-5" />
          </button>
        </div>
      ) : (
        /* Filled: grid of tiles */
        <div className="grid grid-cols-6 gap-[1vw] md:gap-1 p-1 pt-0">
          {isStarter ? (
            <StarterContent
              pokemonIds={pokemonIds}
              totalPlaced={totalPlaced}
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
                    showInsertBefore={insertIndicator.tileId === tid}
                  />
                );
              })}
              {dragLineIds && pokemonIds.length > 0 && (
                <EndDropZone
                  sectionId={group.id}
                  showIndicator={insertIndicator.endSection === group.id}
                />
              )}
              {!dragLineIds && totalPlaced < 151 && (
                <button
                  onClick={() => onAddClick(group.id)}
                  className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary"
                >
                  <Plus className="w-[4vw] h-[4vw] md:w-5 md:h-5" />
                </button>
              )}
            </>
          )}
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
  const isTouchDrag = useRef(false);

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
            return;
          }

          let insertIdx: number;
          if (dragFromSection === target.sectionId) {
            const withoutDragged = targetSectionIds.filter((id) => !dragSetLocal.has(id));
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

  const insertIndicator = useMemo<{ tileId: string | null; endSection: string | null }>(() => {
    if (!overTileId || !dragLineIds) return { tileId: null, endSection: null };

    if (isEndSentinel(overTileId)) {
      return { tileId: null, endSection: parseEndSentinel(overTileId) };
    }

    const target = parseTileId(overTileId);
    const dragSetLocal = new Set(dragLineIds);
    if (dragSetLocal.has(target.pokemonId)) return { tileId: null, endSection: null };

    const targetSectionIds = sections[target.sectionId] ?? [];
    const targetLineIds = findEvoLineGroup(target.pokemonId, targetSectionIds);
    if (targetLineIds.length === 0) return { tileId: null, endSection: null };
    return { tileId: tileId(target.sectionId, targetLineIds[0]), endSection: null };
  }, [overTileId, dragLineIds, sections]);

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
          <div className="p-3 space-y-1.5">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              {BUILD_GROUPS.map((group) => (
                <GroupBox
                  key={group.id}
                  group={group}
                  pokemonIds={sections[group.id] ?? []}
                  totalPlaced={totalPlaced}
                  dragLineIds={dragLineIds}
                  dragSet={dragSet}
                  insertIndicator={insertIndicator}
                  onAddClick={handleAddClick}
                />
              ))}

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
