import { usePokedexStore } from '@/store/usePokedexStore';
import { SECTION_DEFS, computeEmptySlots } from '@/data/slot-template';
import { getPokemonById, getEvolutionLine } from '@/hooks/usePokemonData';
import { SpriteImage } from '@/components/shared/SpriteImage';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, X } from 'lucide-react';

export function PokedexGrid() {
  const sections = usePokedexStore((s) => s.sections);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const setActiveSection = usePokedexStore((s) => s.setActiveSection);
  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const removeEvoLine = usePokedexStore((s) => s.removeEvoLine);
  const clearAll = usePokedexStore((s) => s.clearAll);

  const totalPlaced = Object.values(sections).reduce((s, a) => s + a.length, 0);
  const emptySlots = computeEmptySlots(sections);

  const handleAddClick = (sectionId: string) => {
    setActiveSection(sectionId);
    setMobileBrowserOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="text-lg font-bold">Your Pokedex</h2>
          <p className="text-sm text-muted-foreground">
            {totalPlaced}/151 filled
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Clear
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-6">
            {SECTION_DEFS.map((def) => {
              const pokemonIds = sections[def.id] ?? [];
              const emptyCount = emptySlots[def.id] ?? 0;
              const isActive = activeSection === def.id;

              // Group pokemon into evo lines for visual grouping
              const evoGroups = groupIntoEvoLines(pokemonIds);

              return (
                <section key={def.id}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {def.name}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      ({pokemonIds.length})
                    </span>
                    <span className="text-xs text-muted-foreground italic">
                      {def.description}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 items-center">
                    {/* Placed Pokemon grouped by evo line */}
                    {evoGroups.map((group) => (
                      <div
                        key={group[0]}
                        className="flex items-center gap-0.5 bg-card border rounded-lg px-1 py-0.5 group relative"
                      >
                        {group.map((id) => {
                          const pokemon = getPokemonById(id);
                          if (!pokemon) return null;
                          return (
                            <div key={id} className="flex flex-col items-center w-14">
                              <SpriteImage src={pokemon.sprite} alt={pokemon.name} size={40} />
                              <span className="text-[9px] font-medium capitalize truncate w-full text-center leading-tight">
                                {pokemon.name}
                              </span>
                              <div className="flex gap-0.5">
                                {pokemon.types.map((t) => (
                                  <TypeBadge key={t} type={t} size="sm" />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        <button
                          onClick={() => removeEvoLine(def.id, group[0])}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}

                    {/* Add button */}
                    {totalPlaced < 151 && (
                      <button
                        onClick={() => handleAddClick(def.id)}
                        className={`w-12 h-12 rounded-lg border-2 border-dashed flex items-center justify-center transition-all cursor-pointer ${
                          isActive
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary'
                        }`}
                      >
                        <Plus size={20} />
                      </button>
                    )}

                    {/* Empty slots */}
                    {Array.from({ length: emptyCount - (totalPlaced < 151 ? 1 : 0) }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="w-12 h-12 rounded-lg border border-dashed border-muted-foreground/15 bg-muted/20"
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

/**
 * Group a flat list of pokemon IDs into evo-line clusters.
 * Consecutive IDs that share an evolution chain are grouped together.
 */
function groupIntoEvoLines(pokemonIds: number[]): number[][] {
  if (pokemonIds.length === 0) return [];

  const groups: number[][] = [];
  const visited = new Set<number>();

  for (const id of pokemonIds) {
    if (visited.has(id)) continue;

    // Get this pokemon's evo line
    const line = getEvolutionLine(id);
    const lineIds = line.map((p) => p.id);

    // Find which of these are in our list
    const group = lineIds.filter((lid) => pokemonIds.includes(lid) && !visited.has(lid));
    for (const gid of group) visited.add(gid);

    if (group.length > 0) {
      groups.push(group);
    }
  }

  return groups;
}
