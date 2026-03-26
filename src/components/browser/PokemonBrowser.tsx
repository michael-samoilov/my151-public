import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArchetypeFilter } from './ArchetypeFilter';
import { EvoLineCard } from './EvoLineCard';
import { useFilteredPokemonGrouped } from '@/hooks/usePokemonData';
import { usePokedexStore } from '@/store/usePokedexStore';
import { SECTION_DEFS } from '@/data/slot-template';
import { ARCHETYPES } from '@/data/archetypes';
import { TYPE_NAMES } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';

export function PokemonBrowser() {
  const searchQuery = usePokedexStore((s) => s.searchQuery);
  const setSearchQuery = usePokedexStore((s) => s.setSearchQuery);
  const activeArchetype = usePokedexStore((s) => s.activeArchetypeFilter);
  const setArchetypeFilter = usePokedexStore((s) => s.setArchetypeFilter);
  const typeFilter = usePokedexStore((s) => s.typeFilter);
  const setTypeFilter = usePokedexStore((s) => s.setTypeFilter);
  const generationFilter = usePokedexStore((s) => s.generationFilter);
  const setGenerationFilter = usePokedexStore((s) => s.setGenerationFilter);
  const sections = usePokedexStore((s) => s.sections);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

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
  });

  const totalCount = groups.reduce((sum, g) => sum + g.members.length, 0);
  const hasActiveFilters = !!(activeArchetype || typeFilter || generationFilter);
  const sectionName = activeSection
    ? SECTION_DEFS.find((s) => s.id === activeSection)?.name ?? 'Section'
    : null;

  const archetypeName = activeArchetype
    ? ARCHETYPES.find((a) => a.id === activeArchetype)?.name ?? activeArchetype
    : null;

  const clearAllFilters = () => {
    setArchetypeFilter(null);
    setTypeFilter(null);
    setGenerationFilter(null);
    setSearchQuery('');
  };

  return (
    <div className="flex flex-col h-full border-l">
      {/* Header */}
      <div className="p-3 pb-2 border-b space-y-2">
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

        {/* Active filter tags — always visible when filters are active */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {archetypeName && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium">
                {archetypeName}
                <button onClick={() => setArchetypeFilter(null)} className="hover:text-primary/70 cursor-pointer">
                  <X size={10} />
                </button>
              </span>
            )}
            {typeFilter && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold capitalize text-white"
                style={{ backgroundColor: TYPE_COLORS[typeFilter as keyof typeof TYPE_COLORS] }}
              >
                {typeFilter}
                <button onClick={() => setTypeFilter(null)} className="hover:opacity-70 cursor-pointer">
                  <X size={10} />
                </button>
              </span>
            )}
            {generationFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-foreground text-background rounded text-[10px] font-medium">
                Gen {generationFilter}
                <button onClick={() => setGenerationFilter(null)} className="hover:opacity-70 cursor-pointer">
                  <X size={10} />
                </button>
              </span>
            )}
            <button
              onClick={clearAllFilters}
              className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer ml-1"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Collapsible filters */}
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full cursor-pointer"
        >
          {filtersExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span>Filters</span>
        </button>

        {filtersExpanded && (
          <div className="space-y-2 pb-1">
            <div className="flex flex-wrap gap-1">
              {TYPE_NAMES.map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold capitalize transition-opacity cursor-pointer"
                  style={{
                    backgroundColor: TYPE_COLORS[type],
                    color: '#fff',
                    opacity: typeFilter && typeFilter !== type ? 0.3 : 1,
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((gen) => (
                <Button
                  key={gen}
                  variant={generationFilter === gen ? 'default' : 'secondary'}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setGenerationFilter(generationFilter === gen ? null : gen)}
                >
                  Gen {gen}
                </Button>
              ))}
            </div>

            <ArchetypeFilter active={activeArchetype} onSelect={setArchetypeFilter} />
          </div>
        )}
      </div>

      {/* Evo line cards */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-2 flex flex-wrap gap-1.5 content-start">
            {groups.map((group) => (
              <EvoLineCard
                key={group.chainId}
                members={group.members}
                matchedIds={group.matchedIds}
                assignedIds={assignedIds}
              />
            ))}
            {groups.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <p>No Pokemon found.</p>
                <p className="text-sm mt-1">Try adjusting your filters.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
