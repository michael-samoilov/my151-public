import { usePokedexStore } from '@/store/usePokedexStore';
import { SECTION_DEFS, computeEmptySlots } from '@/data/slot-template';
import { getPokemonById } from '@/hooks/usePokemonData';
import { TYPE_COLORS } from '@/data/type-colors';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, X } from 'lucide-react';

// Duo/tri-tone game colors per generation
const GEN_GRADIENTS: Record<number, string> = {
  1: 'linear-gradient(135deg, #DC0A2D 50%, #3B4CCA 50%)',             // Red / Blue
  2: 'linear-gradient(135deg, #DAA520 33%, #C0C0C0 33%, #C0C0C0 66%, #7FC8E8 66%)', // Gold / Silver / Crystal
  3: 'linear-gradient(135deg, #A00000 33%, #0055BF 33%, #0055BF 66%, #00A86B 66%)', // Ruby / Sapphire / Emerald
  4: 'linear-gradient(135deg, #AACCEE 50%, #FFAACC 50%)',             // Diamond / Pearl
  5: 'linear-gradient(135deg, #1a1a1a 50%, #f0f0f0 50%)',             // Black / White
  6: 'linear-gradient(135deg, #025DA6 50%, #EA1A3E 50%)',             // X (blue) / Y (red)
  7: 'linear-gradient(135deg, #F5A623 50%, #5C4D9A 50%)',             // Sun (orange) / Moon (purple)
  8: 'linear-gradient(135deg, #00A1E9 50%, #E3003A 50%)',             // Sword (cyan) / Shield (red)
  9: 'linear-gradient(135deg, #E3350D 50%, #7B2D8E 50%)',             // Scarlet / Violet
};

// Small SVG-based gen icons — just the number, clean and centered
function GenBadge({ gen, className }: { gen: number; className?: string }) {
  const size = 14; // viewBox size, actual size set by CSS
  return (
    <div
      className={className}
      style={{ background: GEN_GRADIENTS[gen] ?? '#888' }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
        <text
          x="50%"
          y="52%"
          dominantBaseline="central"
          textAnchor="middle"
          fill="white"
          fontSize="8"
          fontWeight="800"
          fontFamily="system-ui, sans-serif"
          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 1.5 }}
        >
          {gen}
        </text>
      </svg>
    </div>
  );
}

export function PokedexGrid() {
  const sections = usePokedexStore((s) => s.sections);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const setActiveSection = usePokedexStore((s) => s.setActiveSection);
  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const setArchetypeFilter = usePokedexStore((s) => s.setArchetypeFilter);
  const removeEvoLine = usePokedexStore((s) => s.removeEvoLine);
  const clearAll = usePokedexStore((s) => s.clearAll);

  const totalPlaced = Object.values(sections).reduce((s, a) => s + a.length, 0);
  const emptySlots = computeEmptySlots(sections);
  const starterCount = (sections['starters'] ?? []).length;

  const handleAddClick = (sectionId: string) => {
    setActiveSection(sectionId);
    if (sectionId === 'starters') {
      if (starterCount < 3) setArchetypeFilter('grass-starter');
      else if (starterCount < 6) setArchetypeFilter('fire-starter');
      else if (starterCount < 9) setArchetypeFilter('water-starter');
      else setArchetypeFilter(null);
    } else {
      setArchetypeFilter(null);
    }
    setMobileBrowserOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="text-lg font-bold">Your Pokedex</h2>
          <p className="text-sm text-muted-foreground">{totalPlaced}/151 filled</p>
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
          <div className="p-3 space-y-5">
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
                    {/* Filled tiles */}
                    {pokemonIds.map((id) => {
                      const pokemon = getPokemonById(id);
                      if (!pokemon) return null;
                      return (
                        <div
                          key={id}
                          className="relative bg-card border rounded-lg flex flex-col items-center justify-center p-[0.5vw] md:p-1 group aspect-square"
                        >
                          {/* Gen badge — top left */}
                          <GenBadge
                            gen={pokemon.generation}
                            className="absolute top-[0.5vw] left-[0.5vw] md:top-0.5 md:left-0.5 w-[3vw] h-[3vw] md:w-3.5 md:h-3.5 rounded-full overflow-hidden"
                          />

                          {/* Remove button — top right */}
                          {/* Mobile: always visible but subtle. Desktop: hover only */}
                          <button
                            onClick={() => removeEvoLine(def.id, id)}
                            className="absolute top-[0.5vw] right-[0.5vw] md:top-0.5 md:right-0.5 w-[3vw] h-[3vw] md:w-3.5 md:h-3.5 rounded-full bg-destructive/60 md:bg-destructive/80 text-white flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10"
                          >
                            <X className="w-[1.5vw] h-[1.5vw] md:w-2 md:h-2" />
                          </button>

                          {/* Sprite */}
                          <img
                            src={pokemon.sprite}
                            alt={pokemon.name}
                            className="w-[8vw] h-[8vw] md:w-10 md:h-10"
                            style={{ imageRendering: 'pixelated' }}
                            loading="lazy"
                          />

                          {/* Name */}
                          <span className="text-[min(1.8vw,7px)] md:text-[7px] font-medium capitalize truncate w-full text-center leading-tight">
                            {pokemon.name}
                          </span>

                          {/* Type badges */}
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
                    })}

                    {/* Add button */}
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

                    {/* Empty slots */}
                    {Array.from({ length: Math.max(0, emptyCount - (totalPlaced < 151 ? 1 : 0)) }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="aspect-square rounded-lg border border-dashed border-muted-foreground/15 bg-muted/20"
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
