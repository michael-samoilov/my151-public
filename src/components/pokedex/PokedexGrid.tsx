import { useCallback, useMemo, useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { SECTION_DEFS, computeEmptySlots } from '@/data/slot-template';
import { getEvolutionLine, getPokemonById } from '@/hooks/usePokemonData';
import { TYPE_COLORS } from '@/data/type-colors';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, X } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ---------- helpers ----------

/** Group a flat pokemonIds array into evo-line groups (preserving order) */
function groupIntoEvoLines(pokemonIds: number[]): number[][] {
  const groups: number[][] = [];
  const used = new Set<number>();
  for (const id of pokemonIds) {
    if (used.has(id)) continue;
    const line = getEvolutionLine(id);
    const lineIds = line.map((p) => p.id).filter((pid) => pokemonIds.includes(pid));
    for (const pid of lineIds) used.add(pid);
    if (lineIds.length > 0) groups.push(lineIds);
  }
  return groups;
}

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
      <img
        src={pokemon.sprite} alt={pokemon.name}
        className="w-[8vw] h-[8vw] md:w-10 md:h-10"
        style={{ imageRendering: 'pixelated' }}
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

// ---------- sortable tile ----------

function SortableTile({
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
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isDraggedLine ? 0.25 : 1,
  };

  if (!pokemon) return null;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Vertical insert indicator */}
      {showInsertBefore && (
        <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-full z-20 -translate-x-[calc(50%+0.5vw)] md:-translate-x-[calc(50%+2px)]" />
      )}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        {...attributes}
        {...listeners}
        onContextMenu={(e) => e.preventDefault()}
        className="relative bg-card border rounded-lg flex flex-col items-center justify-center p-[0.5vw] md:p-1 group aspect-square touch-none cursor-grab active:cursor-grabbing select-none"
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
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
        <img
          src={pokemon.sprite} alt={pokemon.name}
          draggable={false}
          className="w-[8vw] h-[8vw] md:w-10 md:h-10 pointer-events-none"
          style={{ imageRendering: 'pixelated' }}
          loading="lazy"
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
  const starterCount = (sections['starters'] ?? []).length;

  // Track which evo line is being dragged
  const [dragLineIds, setDragLineIds] = useState<number[] | null>(null);
  const [dragFromSection, setDragFromSection] = useState<string | null>(null);
  const [overTileId, setOverTileId] = useState<string | null>(null);

  // Build sortable IDs for each section
  const sectionTileIds = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const def of SECTION_DEFS) {
      result[def.id] = (sections[def.id] ?? []).map((id) => tileId(def.id, id));
    }
    return result;
  }, [sections]);

  // Sensors
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { sectionId, pokemonId } = parseTileId(event.active.id as string);
      const sectionIds = sections[sectionId] ?? [];
      const lineIds = findEvoLineGroup(pokemonId, sectionIds);
      setDragLineIds(lineIds);
      setDragFromSection(sectionId);
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
        const target = parseTileId(over.id as string);

        // Compute insert position: before the target tile's evo line
        const targetSectionIds = sections[target.sectionId] ?? [];
        const targetLineIds = findEvoLineGroup(target.pokemonId, targetSectionIds);
        const dragSet = new Set(dragLineIds);

        // If dropping on self, no-op
        if (dragSet.has(target.pokemonId)) {
          setDragLineIds(null);
          setDragFromSection(null);
          setOverTileId(null);
          return;
        }

        // Find the index of the first member of the target evo line
        // (excluding the dragged line if same section)
        let insertIdx: number;
        if (dragFromSection === target.sectionId) {
          // Same section: compute index in the array after removing dragged IDs
          const withoutDragged = targetSectionIds.filter((id) => !dragSet.has(id));
          const targetFirstIdx = withoutDragged.indexOf(targetLineIds[0]);
          insertIdx = targetFirstIdx >= 0 ? targetFirstIdx : withoutDragged.length;
        } else {
          const targetFirstIdx = targetSectionIds.indexOf(targetLineIds[0]);
          insertIdx = targetFirstIdx >= 0 ? targetFirstIdx : targetSectionIds.length;
        }

        moveEvoLine(dragFromSection, dragLineIds, target.sectionId, insertIdx);
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

  // Compute which tile should show the insert indicator
  const insertBeforeTileId = useMemo(() => {
    if (!overTileId || !dragLineIds) return null;
    const target = parseTileId(overTileId);
    const dragSet = new Set(dragLineIds);
    if (dragSet.has(target.pokemonId)) return null;

    // Find the first tile of the target's evo line
    const targetSectionIds = sections[target.sectionId] ?? [];
    const targetLineIds = findEvoLineGroup(target.pokemonId, targetSectionIds);
    if (targetLineIds.length === 0) return null;
    return tileId(target.sectionId, targetLineIds[0]);
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
                const ids = sectionTileIds[def.id] ?? [];

                return (
                  <section key={def.id}>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <h3 className="text-sm font-semibold">{def.name}</h3>
                      <span className="text-xs text-muted-foreground">({pokemonIds.length})</span>
                      <span className="text-xs text-muted-foreground italic">{def.description}</span>
                    </div>

                    <SortableContext items={ids} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-6 gap-[1vw] md:gap-1">
                        {pokemonIds.map((pid) => {
                          const tid = tileId(def.id, pid);
                          return (
                            <SortableTile
                              key={tid}
                              id={tid}
                              pokemonId={pid}
                              sectionId={def.id}
                              isDraggedLine={dragSet.has(pid)}
                              showInsertBefore={insertBeforeTileId === tid}
                            />
                          );
                        })}

                        {totalPlaced < 151 && (
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

                        {Array.from({ length: Math.max(0, emptyCount - (totalPlaced < 151 ? 1 : 0)) }).map((_, i) => (
                          <div
                            key={`empty-${i}`}
                            className="aspect-square rounded-lg border border-dashed border-muted-foreground/15 bg-muted/20"
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </section>
                );
              })}

              <DragOverlay dropAnimation={null}>
                {dragLineIds && (
                  <div className="flex gap-[1vw] md:gap-1">
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
