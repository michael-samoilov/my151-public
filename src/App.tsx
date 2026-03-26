import { useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { Header } from '@/components/layout/Header';
import { PokedexGrid } from '@/components/pokedex/PokedexGrid';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById } from '@/hooks/usePokemonData';
import { SpriteImage } from '@/components/shared/SpriteImage';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { X } from 'lucide-react';

function App() {
  const [currentView, setCurrentView] = useState<'builder' | 'analytics'>('builder');
  const [draggedPokemonId, setDraggedPokemonId] = useState<number | null>(null);
  const assignPokemon = usePokedexStore((s) => s.assignPokemon);
  const movePokemon = usePokedexStore((s) => s.movePokemon);
  const mobileBrowserOpen = usePokedexStore((s) => s.mobileBrowserOpen);
  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const selectedSlot = usePokedexStore((s) => s.selectedSlot);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const pokemonId = event.active.data.current?.pokemonId;
    if (pokemonId) setDraggedPokemonId(pokemonId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedPokemonId(null);
    const { active, over } = event;
    if (!over) return;

    const overData = over.data.current;
    if (!overData?.slotNumber) return;

    const activeData = active.data.current;
    if (activeData?.pokemonId) {
      assignPokemon(overData.slotNumber, activeData.pokemonId);
    } else if (activeData?.fromSlot) {
      movePokemon(activeData.fromSlot, overData.slotNumber);
    }
  };

  const draggedPokemon = draggedPokemonId ? getPokemonById(draggedPokemonId) : null;

  return (
    <TooltipProvider>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="h-screen flex flex-col">
          <Header currentView={currentView} onViewChange={setCurrentView} />

          {currentView === 'builder' ? (
            <div className="flex-1 flex min-h-0">
              <div className="flex-1 min-w-0">
                <PokedexGrid />
              </div>
              <div className="w-[420px] flex-shrink-0 hidden md:block">
                <PokemonBrowser />
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <AnalyticsDashboard />
            </div>
          )}
        </div>

        <DragOverlay>
          {draggedPokemon && (
            <div className="flex items-center gap-2 p-2 rounded-lg border bg-card shadow-lg">
              <SpriteImage src={draggedPokemon.sprite} alt={draggedPokemon.name} size={40} />
              <div>
                <span className="text-sm font-medium capitalize">{draggedPokemon.name}</span>
                <div className="flex gap-1">
                  {draggedPokemon.types.map((t) => (
                    <TypeBadge key={t} type={t} size="sm" />
                  ))}
                </div>
              </div>
            </div>
          )}
        </DragOverlay>

        {/* Mobile browser sheet */}
        {mobileBrowserOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileBrowserOpen(false)}
            />
            <div className="absolute bottom-0 left-0 right-0 h-[85vh] bg-background rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between p-3 border-b">
                <span className="text-sm font-semibold">
                  {selectedSlot ? `Pick for Slot #${String(selectedSlot).padStart(3, '0')}` : 'Browse Pokemon'}
                </span>
                <button
                  onClick={() => setMobileBrowserOpen(false)}
                  className="p-1.5 rounded-full hover:bg-muted"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <PokemonBrowser />
              </div>
            </div>
          </div>
        )}
      </DndContext>
    </TooltipProvider>
  );
}

export default App;
