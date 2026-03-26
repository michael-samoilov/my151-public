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

function App() {
  const [currentView, setCurrentView] = useState<'builder' | 'analytics'>('builder');
  const [draggedPokemonId, setDraggedPokemonId] = useState<number | null>(null);
  const assignPokemon = usePokedexStore((s) => s.assignPokemon);
  const movePokemon = usePokedexStore((s) => s.movePokemon);

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
      </DndContext>
    </TooltipProvider>
  );
}

export default App;
