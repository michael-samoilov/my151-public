import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EvoLineGrid } from './EvoLineCard';
import { useFilteredPokemonGrouped, getPokemonById } from '@/hooks/usePokemonData';
import { usePokedexStore } from '@/store/usePokedexStore';
import { ARCHETYPES } from '@/data/archetypes';
import { CATEGORIES } from '@/data/categories';
import { TYPE_NAMES } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { Search, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type FilterSheet = 'type' | 'generation' | 'evoStage' | 'classification' | 'places' | 'archetypes' | 'gameMechanics' | null;

const PLACES_ORDER = ['forest', 'meadow', 'cave-pokemon', 'swamp', 'beach', 'fishing-pokemon', 'dojo', 'haunted', 'ruins', 'ocean', 'desert', 'volcanic', 'tundra'];
const PLACES_IDS = new Set(PLACES_ORDER);
const GAME_MECHANICS_ORDER = ['evolution-item', 'trade-evo', 'branched-evo', 'cross-gen-evo', 'static-encounter', 'gift-pokemon', 'in-game-trade', 'reward-pokemon'];
const GAME_MECHANICS_IDS = new Set(GAME_MECHANICS_ORDER);

export function PokemonBrowser() {
  const searchQuery = usePokedexStore((s) => s.searchQuery);
  const setSearchQuery = usePokedexStore((s) => s.setSearchQuery);
  const activeCategory = usePokedexStore((s) => s.activeCategoryFilter);
  const setCategoryFilter = usePokedexStore((s) => s.setCategoryFilter);
  const activeArchetype = usePokedexStore((s) => s.activeArchetypeFilter);
  const setArchetypeFilter = usePokedexStore((s) => s.setArchetypeFilter);
  const typeFilter = usePokedexStore((s) => s.typeFilter);
  const setTypeFilter = usePokedexStore((s) => s.setTypeFilter);
  const typeFilterMode = usePokedexStore((s) => s.typeFilterMode);
  const setTypeFilterMode = usePokedexStore((s) => s.setTypeFilterMode);
  const toggleType = usePokedexStore((s) => s.toggleType);
  const generationFilter = usePokedexStore((s) => s.generationFilter);
  const setGenerationFilter = usePokedexStore((s) => s.setGenerationFilter);
  const toggleGeneration = usePokedexStore((s) => s.toggleGeneration);
  const evoLineSizeFilter = usePokedexStore((s) => s.evoLineSizeFilter);
  const setEvoLineSizeFilter = usePokedexStore((s) => s.setEvoLineSizeFilter);
  const sections = usePokedexStore((s) => s.sections);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const addToSection = usePokedexStore((s) => s.addToSection);
  const [openSheet, setOpenSheet] = useState<FilterSheet>(null);

  // Staged selection: pokemon selected but not yet committed
  const [stagedIds, setStagedIds] = useState<number[]>([]);
  const stagedSet = useMemo(() => new Set(stagedIds), [stagedIds]);
  const prevSectionRef = useRef(activeSection);

  // Reset staged when activeSection changes
  useEffect(() => {
    if (activeSection !== prevSectionRef.current) {
      setStagedIds([]);
      prevSectionRef.current = activeSection;
    }
  }, [activeSection]);

  const handleToggleStage = useCallback((memberIds: number[]) => {
    setStagedIds(prev => {
      const prevSet = new Set(prev);
      const allStaged = memberIds.every(id => prevSet.has(id));
      if (allStaged) {
        // Unstage
        const removeSet = new Set(memberIds);
        return prev.filter(id => !removeSet.has(id));
      } else {
        // Stage (add any not already staged)
        const toAdd = memberIds.filter(id => !prevSet.has(id));
        return [...prev, ...toAdd];
      }
    });
  }, []);

  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const setActiveSection = usePokedexStore((s) => s.setActiveSection);

  const assignedIds = useMemo(
    () => new Set(Object.values(sections).flat()),
    [sections]
  );

  const handleSubmitStaged = useCallback(() => {
    if (stagedIds.length === 0) return;
    const targetSection = activeSection ?? 'other';
    const newIds = stagedIds.filter(id => !assignedIds.has(id));
    if (newIds.length > 0) addToSection(targetSection, newIds);
    setStagedIds([]);
    setMobileBrowserOpen(false);
    setActiveSection(null);
  }, [stagedIds, activeSection, assignedIds, addToSection, setMobileBrowserOpen, setActiveSection]);

  const groups = useFilteredPokemonGrouped({
    search: searchQuery,
    category: activeCategory,
    archetype: activeArchetype,
    types: typeFilter,
    typeMode: typeFilterMode,
    generations: generationFilter,
    evoLineSize: evoLineSizeFilter,
  });

  const totalCount = groups.reduce((sum, g) => sum + g.members.length, 0);

  const activeCategoryDef = activeCategory
    ? CATEGORIES.find((c) => c.id === activeCategory)
    : null;
  const categoryName = activeCategoryDef?.name ?? null;
  const activeArchetypeDef = activeArchetype
    ? ARCHETYPES.find((a) => a.id === activeArchetype)
    : null;
  const archetypeName = activeArchetypeDef?.name ?? null;
  const shinyIds = useMemo(
    () => activeArchetypeDef?.shinyIds ? new Set(activeArchetypeDef.shinyIds) : undefined,
    [activeArchetypeDef]
  );
  const spriteOverrides = activeArchetypeDef?.spriteOverrides;

  // Subgroups: custom if archetype/category defines them, otherwise auto-generate by generation
  const effectiveSubgroups = useMemo((): { label: string; pokemonIds: number[]; shinyIds?: number[] }[] => {
    if (activeArchetypeDef?.subgroups) return activeArchetypeDef.subgroups;
    if (activeCategoryDef?.subgroups) return activeCategoryDef.subgroups;

    // For archetypes: group archetype pokemonIds by generation
    // For default/category views: group matched member IDs by generation
    // (using matchedIds ensures e.g. Baby Pokemon category groups by the baby's gen,
    //  not by the gen of evolved forms like Hitmonlee)
    const sourceIds = activeArchetypeDef
      ? activeArchetypeDef.pokemonIds
      : groups.flatMap(g => [...g.matchedIds]);

    const genMap = new Map<number, number[]>();
    for (const id of sourceIds) {
      const p = getPokemonById(id);
      if (!p) continue;
      if (!genMap.has(p.generation)) genMap.set(p.generation, []);
      genMap.get(p.generation)!.push(id);
    }

    return [...genMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gen, ids]) => ({ label: `Gen ${gen}`, pokemonIds: ids }));
  }, [activeArchetypeDef, groups]);

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

  const isSearching = searchQuery.trim().length > 0;
  const hasActivePropertyFilters = !!((typeFilter && typeFilter.length > 0) || (generationFilter && generationFilter.length > 0) || evoLineSizeFilter);
  const hasActiveBrowseFilters = !!(activeCategory || activeArchetype);
  const hasActiveFilters = hasActivePropertyFilters || hasActiveBrowseFilters;

  const clearPropertyFilters = () => {
    setTypeFilter(null);
    setTypeFilterMode('any');
    setGenerationFilter(null);
    setEvoLineSizeFilter(null);
  };
  const clearBrowseFilters = () => {
    setCategoryFilter(null);
    setArchetypeFilter(null);
  };

  // When searching, generate subgroups from actual results (ignoring filters)
  const searchSubgroups = useMemo((): { label: string; pokemonIds: number[] }[] => {
    if (!isSearching) return [];
    const genMap = new Map<number, number[]>();
    for (const g of groups) {
      for (const m of g.members) {
        if (!genMap.has(m.generation)) genMap.set(m.generation, []);
        genMap.get(m.generation)!.push(m.id);
      }
    }
    return [...genMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gen, ids]) => ({ label: `Gen ${gen}`, pokemonIds: [...new Set(ids)] }));
  }, [isSearching, groups]);
  const typeKey = typeFilter ? `${typeFilterMode}-${typeFilter.join(',')}` : 'none';
  const genKey = generationFilter ? generationFilter.join(',') : 'none';
  const evoSizeKey = evoLineSizeFilter ? evoLineSizeFilter.join(',') : 'none';

  return (
    <div className="flex flex-col h-full border-l relative bg-background">
      {/* Search bar + count */}
      <div className="p-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
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
          <span className="shrink-0 text-xs text-muted-foreground text-right whitespace-nowrap">
            {totalCount} found
          </span>
        </div>
      </div>

      {/* Filter chip rows */}
      <div className="px-3 pb-2 border-b relative z-[1] shadow-[0_1px_0_0_var(--color-background)] space-y-1.5">
        {/* Row 1: Property filters (Type, Gen, Stages) */}
        <div className={cn("flex gap-1.5 overflow-x-auto no-scrollbar transition-opacity items-center border-x border-border pl-2 py-1", isSearching && hasActiveFilters && "opacity-40", !hasActivePropertyFilters && "pr-2")}>
          {typeFilter && typeFilter.length > 0 ? (
            <>
              {typeFilter.length > 1 && (
                <button
                  onClick={() => setTypeFilterMode(typeFilterMode === 'any' ? 'all' : 'any')}
                  className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer transition-colors"
                >
                  {typeFilterMode === 'any' ? 'OR' : 'AND'}
                </button>
              )}
              {typeFilter.map(t => (
                <FilterChip
                  key={t}
                  label={t[0].toUpperCase() + t.slice(1)}
                  onDismiss={() => toggleType(t)}
                  onClick={() => setOpenSheet(openSheet === 'type' ? null : 'type')}
                  className="capitalize text-white"
                  style={{ backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS] }}
                />
              ))}
            </>
          ) : (
            <EntryChip label="Type" onClick={() => setOpenSheet(openSheet === 'type' ? null : 'type')} active={openSheet === 'type'} />
          )}

          {generationFilter && generationFilter.length > 0 ? (
            generationFilter.length <= 3 ? (
              generationFilter.map(g => (
                <FilterChip
                  key={g}
                  label={`Gen ${g}`}
                  onDismiss={() => toggleGeneration(g)}
                  onClick={() => setOpenSheet(openSheet === 'generation' ? null : 'generation')}
                  className="bg-foreground text-background"
                />
              ))
            ) : (
              <FilterChip
                label={`${generationFilter.length} Gens`}
                onDismiss={() => setGenerationFilter(null)}
                onClick={() => setOpenSheet(openSheet === 'generation' ? null : 'generation')}
                className="bg-foreground text-background"
              />
            )
          ) : (
            <EntryChip label="Gen" onClick={() => setOpenSheet(openSheet === 'generation' ? null : 'generation')} active={openSheet === 'generation'} />
          )}

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

          {hasActivePropertyFilters && (
            <button
              onClick={clearPropertyFilters}
              className="sticky right-0 shrink-0 self-stretch flex items-center text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer pr-2 pl-2 bg-background border-l border-border -my-1"
            >
              Clear
            </button>
          )}
        </div>

        {/* Row 2: Browse filters (Classification, Places, Archetypes, Game Mechanics) */}
        <div className={cn("flex gap-1.5 overflow-x-auto no-scrollbar transition-opacity items-center border-x border-border pl-2 py-1", isSearching && hasActiveFilters && "opacity-40", !hasActiveBrowseFilters && "pr-2")}>
          {activeCategory ? (
            <FilterChip
              label={categoryName!}
              onDismiss={() => setCategoryFilter(null)}
              onClick={() => setOpenSheet(openSheet === 'classification' ? null : 'classification')}
              className="text-white"
              style={{ backgroundColor: activeCategoryDef?.color }}
            />
          ) : (
            <EntryChip label="Classification" onClick={() => setOpenSheet(openSheet === 'classification' ? null : 'classification')} active={openSheet === 'classification'} />
          )}

          {activeArchetype && PLACES_IDS.has(activeArchetype) ? (
            <FilterChip
              label={archetypeName!}
              onDismiss={() => setArchetypeFilter(null)}
              onClick={() => setOpenSheet(openSheet === 'places' ? null : 'places')}
              className="text-white"
              style={{ backgroundColor: activeArchetypeDef?.color }}
            />
          ) : (
            <EntryChip label="Places" onClick={() => setOpenSheet(openSheet === 'places' ? null : 'places')} active={openSheet === 'places'} />
          )}

          {activeArchetype && !PLACES_IDS.has(activeArchetype) && !GAME_MECHANICS_IDS.has(activeArchetype) ? (
            <FilterChip
              label={archetypeName!}
              onDismiss={() => setArchetypeFilter(null)}
              onClick={() => setOpenSheet(openSheet === 'archetypes' ? null : 'archetypes')}
              className="text-white"
              style={{ backgroundColor: activeArchetypeDef?.color }}
            />
          ) : (
            <EntryChip label="Archetypes" onClick={() => setOpenSheet(openSheet === 'archetypes' ? null : 'archetypes')} active={openSheet === 'archetypes'} />
          )}

          {activeArchetype && GAME_MECHANICS_IDS.has(activeArchetype) ? (
            <FilterChip
              label={archetypeName!}
              onDismiss={() => setArchetypeFilter(null)}
              onClick={() => setOpenSheet(openSheet === 'gameMechanics' ? null : 'gameMechanics')}
              className="text-white"
              style={{ backgroundColor: activeArchetypeDef?.color }}
            />
          ) : (
            <EntryChip label="Mechanics" onClick={() => setOpenSheet(openSheet === 'gameMechanics' ? null : 'gameMechanics')} active={openSheet === 'gameMechanics'} />
          )}

          {hasActiveBrowseFilters && (
            <button
              onClick={clearBrowseFilters}
              className="sticky right-0 shrink-0 self-stretch flex items-center text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer pr-2 pl-2 bg-background border-l border-border -my-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results area */}
      <div
        key={`${activeCategory ?? 'x'}-${activeArchetype ?? 'none'}-${typeKey}-${genKey}-${searchQuery}-${evoSizeKey}`}
        className="flex-1 min-h-0 overflow-y-auto px-2 pb-2"
      >
          {/* Dual-column headers — sticky, left-aligned with 1st and 4th tile columns */}
          {!isSearching && activeCategoryDef?.dualColumns && (
            <div className="sticky top-0 z-30 bg-background grid grid-cols-2 gap-x-1 px-1 py-[3px] border-b">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pl-[3px] md:pl-[2px]">
                {activeCategoryDef.dualColumns.left.label}
              </div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pl-[3px] md:pl-[2px]">
                {activeCategoryDef.dualColumns.right.label}
              </div>
            </div>
          )}
          {(isSearching ? searchSubgroups : effectiveSubgroups).map((sub) => {
            const subIdSet = new Set(sub.pokemonIds);
            const subGroups = groups
              .filter(g => g.members.some(m => subIdSet.has(m.id)))
              .sort((a, b) => {
                if (!isSearching && activeArchetypeDef) {
                  // Archetype view: preserve curated pokemonIds order
                  const aIdx = sub.pokemonIds.findIndex(id => a.members.some(m => m.id === id));
                  const bIdx = sub.pokemonIds.findIndex(id => b.members.some(m => m.id === id));
                  return aIdx - bIdx;
                }
                // Default view: sort by lowest matching member's dex number
                const aMin = Math.min(...a.members.filter(m => subIdSet.has(m.id)).map(m => m.id));
                const bMin = Math.min(...b.members.filter(m => subIdSet.has(m.id)).map(m => m.id));
                return aMin - bMin;
              });
            if (subGroups.length === 0) return null;

            const dualCols = !isSearching ? activeCategoryDef?.dualColumns : undefined;

            if (dualCols) {
              const leftIdSet = new Set(dualCols.left.ids);
              const rightIdSet = new Set(dualCols.right.ids);
              const mapGroup = (group: typeof subGroups[0]) => {
                const subMatchedIds = new Set(
                  group.members.filter(m => subIdSet.has(m.id)).map(m => m.id)
                );
                return {
                  key: `${sub.label}-${group.chainId}`,
                  members: group.members,
                  matchedIds: subMatchedIds,
                };
              };
              const leftGroups = subGroups
                .filter(g => g.members.some(m => leftIdSet.has(m.id)))
                .map(mapGroup);
              const rightGroups = subGroups
                .filter(g => g.members.some(m => rightIdSet.has(m.id)))
                .map(mapGroup);

              return (
                <div key={sub.label}>
                  <div className="sticky top-[22px] z-20 bg-background text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-[3px] px-1 border-b">
                    {sub.label}
                  </div>
                  <div className="grid grid-cols-2 gap-x-1 items-start pt-1">
                    <EvoLineGrid
                      groups={leftGroups}
                      assignedIds={assignedIds}
                      stagedIds={stagedSet}
                      onToggleStage={handleToggleStage}
                      cols={3}
                    />
                    <EvoLineGrid
                      groups={rightGroups}
                      assignedIds={assignedIds}
                      stagedIds={stagedSet}
                      onToggleStage={handleToggleStage}
                      cols={3}
                    />
                  </div>
                </div>
              );
            }

            return (
              <div key={sub.label}>
                <div className="sticky top-0 z-20 bg-background text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-[3px] px-1 border-b">
                  {sub.label}
                </div>
                <div className="pt-1">
                  <EvoLineGrid
                    groups={subGroups.map((group) => {
                      const subMatchedIds = new Set(
                        group.members.filter(m => subIdSet.has(m.id)).map(m => m.id)
                      );
                      return {
                        key: `${sub.label}-${group.chainId}`,
                        members: group.members,
                        matchedIds: subMatchedIds,
                      };
                    })}
                    assignedIds={assignedIds}
                    stagedIds={stagedSet}
                    onToggleStage={handleToggleStage}
                    shinyIds={isSearching ? undefined : ('shinyIds' in sub ? new Set((sub as any).shinyIds) : shinyIds)}
                    spriteOverrides={isSearching ? undefined : spriteOverrides}
                  />
                </div>
              </div>
            );
          })}
          {groups.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <p>No Pokemon found.</p>
              <p className="text-sm mt-1">Try adjusting your filters.</p>
            </div>
          )}
          {/* Bottom padding for floating button clearance */}
          <div className="h-16 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" className="text-muted-foreground/20">
                <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <line x1="1" y1="12" x2="8.5" y2="12" stroke="currentColor" strokeWidth="1.5" />
                <line x1="15.5" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
            </div>
      </div>

      {/* Floating "Add X Pokemon" button */}
      {stagedIds.length > 0 && (() => {
        const newCount = stagedIds.filter(id => !assignedIds.has(id)).length;
        if (newCount === 0) return null;
        return (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40">
            <button
              onClick={handleSubmitStaged}
              className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full shadow-lg text-sm font-semibold cursor-pointer hover:bg-primary/90 transition-colors"
            >
              Add {newCount} Pokemon
            </button>
          </div>
        );
      })()}

      {/* Filter bottom sheet overlay */}
      {openSheet && (
        <SheetOverlay onClose={() => setOpenSheet(null)} openSheet={openSheet} footer={
          <div className="px-4 py-3 border-t">
            <Button className="w-full" onClick={() => setOpenSheet(null)}>
              Show {totalCount} results
            </Button>
          </div>
        }>
              {openSheet === 'type' && (
                <div className="space-y-2">
                  {typeFilter && typeFilter.length >= 2 && (
                    <div className="flex items-center gap-2 pb-1">
                      <span className="text-[11px] text-muted-foreground">Mode:</span>
                      <button
                        onClick={() => setTypeFilterMode('any')}
                        className={cn('px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors',
                          typeFilterMode === 'any' ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground'
                        )}
                      >
                        Any (OR)
                      </button>
                      <button
                        onClick={() => setTypeFilterMode('all')}
                        className={cn('px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors',
                          typeFilterMode === 'all' ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground'
                        )}
                      >
                        All (AND)
                      </button>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {typeFilterMode === 'all' ? 'dual-type search' : 'show any match'}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-1">
                    {TYPE_NAMES.map((type) => {
                      const isSelected = typeFilter?.includes(type) ?? false;
                      return (
                        <button
                          key={type}
                          onClick={() => toggleType(type)}
                          className="py-0.5 rounded-md text-[10px] font-semibold capitalize text-white cursor-pointer transition-all"
                          style={{
                            backgroundColor: TYPE_COLORS[type],
                            opacity: typeFilter && typeFilter.length > 0 && !isSelected ? 0.3 : 1,
                          }}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {openSheet === 'generation' && (
                <div className="grid grid-cols-3 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((gen) => (
                    <Button
                      key={gen}
                      variant={generationFilter?.includes(gen) ? 'default' : 'secondary'}
                      className="h-9 text-sm"
                      onClick={() => toggleGeneration(gen)}
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

              {openSheet === 'classification' && (
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => { setCategoryFilter(activeCategory === cat.id ? null : cat.id); setOpenSheet(null); }}
                      className={cn(
                        'px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border',
                        activeCategory === cat.id
                          ? 'text-white border-transparent'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent'
                      )}
                      style={activeCategory === cat.id ? { backgroundColor: cat.color } : undefined}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}

              {openSheet === 'places' && (
                <div className="flex flex-wrap gap-1.5">
                  {PLACES_ORDER.map(id => ARCHETYPES.find(a => a.id === id)!).map((archetype) => (
                    <button
                      key={archetype.id}
                      onClick={() => { setArchetypeFilter(activeArchetype === archetype.id ? null : archetype.id); setOpenSheet(null); }}
                      className={cn(
                        'px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border',
                        activeArchetype === archetype.id
                          ? 'text-white border-transparent'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent'
                      )}
                      style={activeArchetype === archetype.id ? { backgroundColor: archetype.color } : undefined}
                    >
                      {archetype.name}
                    </button>
                  ))}
                </div>
              )}

              {openSheet === 'archetypes' && (
                <div className="flex flex-wrap gap-1.5">
                  {ARCHETYPES.filter(a => !PLACES_IDS.has(a.id) && !GAME_MECHANICS_IDS.has(a.id)).map((archetype) => (
                    <button
                      key={archetype.id}
                      onClick={() => { setArchetypeFilter(activeArchetype === archetype.id ? null : archetype.id); setOpenSheet(null); }}
                      className={cn(
                        'px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border',
                        activeArchetype === archetype.id
                          ? 'text-white border-transparent'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent'
                      )}
                      style={activeArchetype === archetype.id ? { backgroundColor: archetype.color } : undefined}
                    >
                      {archetype.name}
                    </button>
                  ))}
                </div>
              )}

              {openSheet === 'gameMechanics' && (
                <div className="flex flex-wrap gap-1.5">
                  {GAME_MECHANICS_ORDER.map(id => ARCHETYPES.find(a => a.id === id)!).map((archetype) => (
                    <button
                      key={archetype.id}
                      onClick={() => { setArchetypeFilter(activeArchetype === archetype.id ? null : archetype.id); setOpenSheet(null); }}
                      className={cn(
                        'px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border',
                        activeArchetype === archetype.id
                          ? 'text-white border-transparent'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent'
                      )}
                      style={activeArchetype === archetype.id ? { backgroundColor: archetype.color } : undefined}
                    >
                      {archetype.name}
                    </button>
                  ))}
                </div>
              )}
        </SheetOverlay>
      )}
    </div>
  );
}

/** Sheet overlay — blocks scroll passthrough with non-passive touch listeners */
function SheetOverlay({ onClose, openSheet, children, footer }: {
  onClose: () => void;
  openSheet: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Disable pull-to-refresh on html element while sheet is open
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overscrollBehavior;
    html.style.overscrollBehavior = 'none';
    return () => { html.style.overscrollBehavior = prev; };
  }, []);

  // Block touchmove on non-scrollable areas (backdrop + header)
  useEffect(() => {
    const els = [backdropRef.current, headerRef.current].filter(Boolean) as HTMLElement[];
    const block = (e: TouchEvent) => e.preventDefault();
    els.forEach(el => el.addEventListener('touchmove', block, { passive: false }));
    return () => { els.forEach(el => el.removeEventListener('touchmove', block)); };
  }, []);

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col justify-end"
      onWheel={(e) => e.stopPropagation()}
    >
      <div ref={backdropRef} className="flex-1" onClick={onClose} />
      <div className="bg-background border-t rounded-t-xl shadow-2xl h-[50%] flex flex-col">
        {/* Sheet header */}
        <div ref={headerRef} className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">
            {openSheet === 'type' && 'Type'}
            {openSheet === 'generation' && 'Generation'}
            {openSheet === 'evoStage' && 'Evo Stages'}
            {openSheet === 'classification' && 'Classification'}
            {openSheet === 'places' && 'Places'}
            {openSheet === 'archetypes' && 'Archetypes'}
            {openSheet === 'gameMechanics' && 'Game Mechanics'}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Sheet body — natural scroll with overscroll bounce */}
        <div
          className="flex-1 min-h-0 overflow-y-auto p-3"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
}

/** Entry-point chip — opens a filter sheet */
function EntryChip({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer border transition-colors',
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
        'shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium',
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
