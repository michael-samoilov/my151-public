import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { PokedexGrid } from '@/components/pokedex/PokedexGrid';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TooltipProvider } from '@/components/ui/tooltip';
import { X } from 'lucide-react';
import { SECTION_DEFS } from '@/data/slot-template';

function App() {
  const [currentView, setCurrentView] = useState<'builder' | 'analytics'>('builder');
  const mobileBrowserOpen = usePokedexStore((s) => s.mobileBrowserOpen);
  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const activeSection = usePokedexStore((s) => s.activeSection);

  const sectionName = activeSection
    ? SECTION_DEFS.find((s) => s.id === activeSection)?.name ?? 'Section'
    : 'Browse Pokemon';

  return (
    <TooltipProvider>
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

      {/* Mobile browser sheet */}
      {mobileBrowserOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileBrowserOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 h-[85vh] bg-background rounded-t-2xl shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-3 border-b">
              <span className="text-sm font-semibold">
                {sectionName}
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
    </TooltipProvider>
  );
}

export default App;
