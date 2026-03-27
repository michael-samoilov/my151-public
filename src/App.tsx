import { useState, useRef, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { PokedexGrid } from '@/components/pokedex/PokedexGrid';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SECTION_DEFS } from '@/data/slot-template';

const SHEET_HEIGHT_VH = 85;
const DISMISS_THRESHOLD = 120; // px drag distance to dismiss

function MobileSheet({ sectionName, onClose }: { sectionName: string; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    // Only allow dragging downward
    if (dy > 0) {
      isDragging.current = true;
      setDragY(dy);
      // Prevent pull-to-refresh
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > DISMISS_THRESHOLD) {
      onClose();
    } else {
      setDragY(0);
    }
    dragStartY.current = null;
    isDragging.current = false;
  }, [dragY, onClose]);

  const handleTabTap = useCallback(() => {
    // Only close on tap, not after a drag gesture
    if (!isDragging.current) {
      onClose();
    }
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        style={{ opacity: Math.max(0, 1 - dragY / (DISMISS_THRESHOLD * 3)) }}
      />
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          height: `${SHEET_HEIGHT_VH}vh`,
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none',
          overscrollBehavior: 'none',
        }}
      >
        {/* Pull tab / drag handle — tap or drag down to close */}
        <div
          className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleTabTap}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-1.5" />
          <span className="text-xs font-semibold text-muted-foreground">
            {sectionName}
          </span>
        </div>
        <div className="border-b" />
        <div className="flex-1 min-h-0" style={{ overscrollBehavior: 'contain' }}>
          <PokemonBrowser />
        </div>
      </div>
    </div>
  );
}

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
        <MobileSheet sectionName={sectionName} onClose={() => setMobileBrowserOpen(false)} />
      )}
    </TooltipProvider>
  );
}

export default App;
