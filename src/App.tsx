import { useState, useRef, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import type { AppView } from '@/components/layout/Header';
import { PokedexGrid } from '@/components/pokedex/PokedexGrid';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { DrillDownSheet, DrillDownPanel } from '@/components/analytics/DrillDownSheet';
import { ViewPage } from '@/components/view/ViewPage';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BUILD_GROUPS } from '@/data/slot-template';
import { useCompletionBeacon } from '@/hooks/useCompletionBeacon';

declare const __BUILD_TIMESTAMP__: string;
// eslint-disable-next-line no-console
console.log(`[P151] build: ${__BUILD_TIMESTAMP__}`);

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
        }}
      >
        {/* Pull tab / drag handle — tap or drag down to close (44px min touch target per Apple HIG) */}
        <div
          className="flex flex-col items-center justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleTabTap}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-1" />
          <span className="text-sm font-semibold">
            {sectionName !== 'Browse Pokemon' ? (
              <>
                <span className="text-foreground">Adding to: </span>
                <span className="text-primary">{sectionName}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{sectionName}</span>
            )}
          </span>
        </div>
        <div className="border-b" />
        <div className="flex-1 min-h-0">
          <PokemonBrowser />
        </div>
      </div>
    </div>
  );
}

function App() {
  useCompletionBeacon();
  const [currentView, setCurrentView] = useState<AppView>('builder');
  const mobileBrowserOpen = usePokedexStore((s) => s.mobileBrowserOpen);
  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const drillDownSegment = usePokedexStore((s) => s.drillDownSegment);

  const handleViewChange = useCallback((view: AppView) => {
    setCurrentView(view);
    if (view !== 'builder') {
      setMobileBrowserOpen(false);
      usePokedexStore.getState().setActiveSection(null);
    }
  }, [setMobileBrowserOpen]);

  const sectionName = activeSection
    ? BUILD_GROUPS.find((g) => g.id === activeSection)?.name ?? 'Section'
    : 'Browse Pokemon';

  return (
    <TooltipProvider>
      <div className="h-dvh flex flex-col">
        <Header currentView={currentView} onViewChange={handleViewChange} />

        {currentView === 'builder' ? (
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 min-w-0">
              <PokedexGrid />
            </div>
            <div className="flex-1 min-w-0 hidden md:block">
              <PokemonBrowser />
            </div>
          </div>
        ) : currentView === 'view' ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <ViewPage />
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
              <AnalyticsDashboard />
            </div>
            {drillDownSegment && (
              <div className="hidden md:flex w-[min(50vw,546px)] flex-shrink-0 border-l">
                <DrillDownPanel />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile browser sheet */}
      {currentView === 'builder' && mobileBrowserOpen && (
        <MobileSheet sectionName={sectionName} onClose={() => { setMobileBrowserOpen(false); usePokedexStore.getState().setActiveSection(null); }} />
      )}

      {/* Analytics drill-down sheet — only on analytics view */}
      {currentView === 'analytics' && drillDownSegment && <DrillDownSheet />}
    </TooltipProvider>
  );
}

export default App;
