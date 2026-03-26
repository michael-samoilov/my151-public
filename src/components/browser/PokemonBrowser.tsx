import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EvoLineCard } from './EvoLineCard';
import { useFilteredPokemonGrouped } from '@/hooks/usePokemonData';
import { usePokedexStore } from '@/store/usePokedexStore';
import { SECTION_DEFS } from '@/data/slot-template';
import { ARCHETYPES } from '@/data/archetypes';
import { TYPE_NAMES } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { Search, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type FilterSheet = 'type' | 'generation' | 'evoStage' | 'category' | null;

export function PokemonBrowser() {
  const searchQuery = usePokedexStore((s) => s.searchQuery);
  const setSearchQuery = usePokedexStore((s) => s.setSearchQuery);
  const activeArchetype = usePokedexStore((s) => s.activeArchetypeFilter);
  const setArchetypeFilter = usePokedexStore((s) => s.setArchetypeFilter);
  const typeFilter = usePokedexStore((s) => s.typeFilter);
  const setTypeFilter = usePokedexStore((s) => s.setTypeFilter);
  const generationFilter = usePokedexStore((s) => s.generationFilter);
  const setGenerationFilter = usePokedexStore((s) => s.setGenerationFilter);
  const evoLineSizeFilter = usePokedexStore((s) => s.evoLineSizeFilter);
  const setEvoLineSizeFilter = usePokedexStore((s) => s.setEvoLineSizeFilter);
  const sections = usePokedexStore((s) => s.sections);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const [openSheet, setOpenSheet] = useState<FilterSheet>(null);

  const assignedIds = useMemo(
    () => new Set(Object.values(sections).flat()),
    [sections]
  );

  const groups = useFilteredPokemonGrouped({
    search: searchQuery,
    archetype: activeArchetype,
    type: typeFilter,
    generation: generationFilter,
    excludeIds: assignedIds,
    evoLineSize: evoLineSizeFilter,
  });

  const totalCount = groups.reduce((sum, g) => sum + g.members.length, 0);
  const sectionName = activeSection
    ? SECTION_DEFS.find((s) => s.id === activeSection)?.name ?? 'Section'
    : null;

  const activeArchetypeDef = activeArchetype
    ? ARCHETYPES.find((a) => a.id === activeArchetype)
    : null;
  const archetypeName = activeArchetypeDef?.name ?? null;

  const clearAllFilters = () => {
    setArchetypeFilter(null);
    setTypeFilter(null);
    setGenerationFilter(null);
    setEvoLineSizeFilter(null);
    setSearchQuery('');
  };

  const toggleEvoSize = (size: number) => {
    if (!evoLineSizeFilter) {
      setEvoLineSizeFilter([size]);
    } else if (evoLineSizeFilter.includes(size)) {
      const next = evoLineSizeFilter.filter(s => s !== size);
      setEvoLineSizeFilter(next.length > 0 ? next : null);
    } else {
      setEvoLineSizeFilter([...evoLineSizeFilter, size]);
    }
  };

  const hasActiveFilters = !!(activeArchetype || typeFilter || generationFilter || evoLineSizeFilter);
  const evoSizeKey = evoLineSizeFilter ? evoLineSizeFilter.join(',') : 'none';

  return (
    <div className="flex flex-col h-full border-l relative">
      {/* Compact header */}
      <div className="p-3 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Browse Pokemon</h2>
            {sectionName && (
              <p className="text-xs text-primary font-medium">
                Adding to: {sectionName}
              </p>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {totalCount} found
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or number..."
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Horizontal scrollable chip bar — always visible */}
      <div className="px-3 pb-2 border-b">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {/* Type chip */}
          {typeFilter ? (
            <FilterChip
              label={typeFilter}
              onDismiss={() => setTypeFilter(null)}
              onClick={() => setOpenSheet(openSheet === 'type' ? null : 'type')}
              className="capitalize text-white"
              style={{ backgroundColor: TYPE_COLORS[typeFilter as keyof typeof TYPE_COLORS] }}
            />
          ) : (
            <EntryChip label="Type" onClick={() => setOpenSheet(openSheet === 'type' ? null : 'type')} active={openSheet === 'type'} />
          )}

          {/* Generation chip */}
          {generationFilter ? (
            <FilterChip
              label={`Gen ${generationFilter}`}
              onDismiss={() => setGenerationFilter(null)}
              onClick={() => setOpenSheet(openSheet === 'generation' ? null : 'generation')}
              className="bg-foreground text-background"
            />
          ) : (
            <EntryChip label="Gen" onClick={() => setOpenSheet(openSheet === 'generation' ? null : 'generation')} active={openSheet === 'generation'} />
          )}

          {/* Evo stage chip */}
          {evoLineSizeFilter ? (
            <FilterChip
              label={`${evoLineSizeFilter.map(s => s === 3 ? '3+' : String(s)).join(',')} stage`}
              onDismiss={() => setEvoLineSizeFilter(null)}
              onClick={() => setOpenSheet(openSheet === 'evoStage' ? null : 'evoStage')}
              className="bg-foreground text-background"
            />
          ) : (
            <EntryChip label="Stages" onClick={() => setOpenSheet(openSheet === 'evoStage' ? null : 'evoStage')} active={openSheet === 'evoStage'} />
          )}

          {/* Category chip */}
          {archetypeName ? (
            <FilterChip
              label={archetypeName}
              onDismiss={() => setArchetypeFilter(null)}
              onClick={() => setOpenSheet(openSheet === 'category' ? null : 'category')}
              className="bg-primary/10 text-primary"
            />
          ) : (
            <EntryChip label="Category" onClick={() => setOpenSheet(openSheet === 'category' ? null : 'category')} active={openSheet === 'category'} />
          )}

          {/* Clear all */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer px-1 self-center"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results area */}
      <div
        key={`${activeArchetype ?? 'none'}-${typeFilter ?? 'none'}-${generationFilter ?? 'none'}-${searchQuery}-${evoSizeKey}`}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <div className="p-2 flex flex-wrap gap-1.5 content-start">
          {activeArchetypeDef?.subgroups ? (
            activeArchetypeDef.subgroups.map((sub) => {
              const subIdSet = new Set(sub.pokemonIds);
              const subGroups = groups.filter(g => g.members.some(m => subIdSet.has(m.id)));
              if (subGroups.length === 0) return null;
              return (
                <div key={sub.label} className="w-full">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-2 mb-1 px-1">
                    {sub.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {subGroups.map((group) => (
                      <EvoLineCard
                        key={group.chainId}
                        members={group.members}
                        matchedIds={group.matchedIds}
                        assignedIds={assignedIds}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            groups.map((group) => (
              <EvoLineCard
                key={group.chainId}
                members={group.members}
                matchedIds={group.matchedIds}
                assignedIds={assignedIds}
              />
            ))
          )}
          {groups.length === 0 && (
            <div className="py-12 text-center text-muted-foreground w-full">
              <p>No Pokemon found.</p>
              <p className="text-sm mt-1">Try adjusting your filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* Filter bottom sheet overlay */}
      {openSheet && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end">
          <div className="flex-1" onClick={() => setOpenSheet(null)} />
          <div className="bg-background border-t rounded-t-xl shadow-2xl max-h-[50%] flex flex-col">
            {/* Sheet header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="text-sm font-semibold">
                {openSheet === 'type' && 'Type'}
                {openSheet === 'generation' && 'Generation'}
                {openSheet === 'evoStage' && 'Evo Stages'}
                {openSheet === 'category' && 'Category'}
              </span>
              <button onClick={() => setOpenSheet(null)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {/* Sheet body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {openSheet === 'type' && (
                <div className="grid grid-cols-3 gap-1.5">
                  {TYPE_NAMES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                      className="py-1.5 rounded-md text-[11px] font-semibold capitalize text-white cursor-pointer transition-all"
                      style={{
                        backgroundColor: TYPE_COLORS[type],
                        opacity: typeFilter && typeFilter !== type ? 0.3 : 1,
                        outline: typeFilter === type ? '2px solid white' : 'none',
                        outlineOffset: '-2px',
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}

              {openSheet === 'generation' && (
                <div className="grid grid-cols-3 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((gen) => (
                    <Button
                      key={gen}
                      variant={generationFilter === gen ? 'default' : 'secondary'}
                      className="h-9 text-sm"
                      onClick={() => setGenerationFilter(generationFilter === gen ? null : gen)}
                    >
                      Gen {gen}
                    </Button>
                  ))}
                </div>
              )}

              {openSheet === 'evoStage' && (
                <div className="flex gap-2">
                  {[1, 2, 3].map((size) => (
                    <Button
                      key={size}
                      variant={evoLineSizeFilter?.includes(size) ? 'default' : 'secondary'}
                      className="flex-1 h-10 text-sm"
                      onClick={() => toggleEvoSize(size)}
                    >
                      {size === 1 && '1 Stage'}
                      {size === 2 && '2 Stage'}
                      {size === 3 && '3+ Stage'}
                    </Button>
                  ))}
                </div>
              )}

              {openSheet === 'category' && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => { setArchetypeFilter(null); setOpenSheet(null); }}
                    className={cn(
                      'px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer',
                      activeArchetype === null
                        ? 'bg-foreground text-background'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    )}
                  >
                    All
                  </button>
                  {ARCHETYPES.map((archetype) => (
                    <button
                      key={archetype.id}
                      onClick={() => { setArchetypeFilter(activeArchetype === archetype.id ? null : archetype.id); setOpenSheet(null); }}
                      className={cn(
                        'px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border',
                        activeArchetype === archetype.id
                          ? 'text-white border-transparent'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent'
                      )}
                      style={
                        activeArchetype === archetype.id
                          ? { backgroundColor: archetype.color }
                          : undefined
                      }
                    >
                      {archetype.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sheet footer — live results count */}
            <div className="px-4 py-3 border-t">
              <Button
                className="w-full"
                onClick={() => setOpenSheet(null)}
              >
                Show {totalCount} results
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Entry-point chip — opens a filter sheet */
function EntryChip({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors',
        active
          ? 'border-primary text-primary bg-primary/5'
          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
      )}
    >
      {label}
      <ChevronDown size={12} className={cn('transition-transform', active && 'rotate-180')} />
    </button>
  );
}

/** Active filter chip — shows value with dismiss */
function FilterChip({
  label, onDismiss, onClick, className, style,
}: {
  label: string; onDismiss: () => void; onClick: () => void; className?: string; style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
        className
      )}
      style={style}
    >
      <button onClick={onClick} className="cursor-pointer">{label}</button>
      <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} className="hover:opacity-70 cursor-pointer">
        <X size={10} />
      </button>
    </span>
  );
}
