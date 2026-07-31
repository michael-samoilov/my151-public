import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { Header } from '@/components/layout/Header';
import type { AppView } from '@/components/layout/Header';
import { PokedexGrid } from '@/components/pokedex/PokedexGrid';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { DrillDownSheet, DrillDownPanel } from '@/components/analytics/DrillDownSheet';
import { usePokedexStore } from '@/store/usePokedexStore';

const AnalyticsDashboard = lazy(() =>
  import('@/components/analytics/AnalyticsDashboard').then((m) => ({ default: m.AnalyticsDashboard })),
);
const ViewPage = lazy(() =>
  import('@/components/view/ViewPage').then((m) => ({ default: m.ViewPage })),
);

function RouteFallback() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 animate-spin opacity-70">
        <circle cx="16" cy="16" r="15" fill="#fafafa" stroke="#dc2626" strokeWidth="1.5" />
        <path d="M2 16 A14 14 0 0 1 30 16" fill="#dc2626" />
        <line x1="2" y1="16" x2="30" y2="16" stroke="#fafafa" strokeWidth="2" />
        <circle cx="16" cy="16" r="4.5" fill="#fafafa" stroke="#dc2626" strokeWidth="2" />
      </svg>
    </div>
  );
}
import { TooltipProvider } from '@/components/ui/tooltip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCompletionBeacon, sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useMilestoneTracker } from '@/hooks/useMilestoneTracker';
import { MilestoneTunePanel } from '@/components/pokedex/MilestoneBar';
import { MilestoneCelebration } from '@/components/milestone/MilestoneCelebration';
import { isAnalyticsUnlocked } from '@/lib/milestones';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { cn } from '@/lib/utils';
import { sectionName as sectionLabel, useDocumentLocale } from '@/i18n';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';

declare const __BUILD_TIMESTAMP__: string;
console.log(`[P151] build: ${__BUILD_TIMESTAMP__}`);

// Top gap (px) the mobile selection sheet leaves below the viewport top
// when fully raised — matches the analytics drilldown sheet
// (DrillDownSheet HEADER_HEIGHT) so its close handle is always reachable.
// Uses dvh (not vh) so the dynamic mobile URL bar can't push the top
// off-screen.
const SHEET_TOP_GAP_PX = 49;

function MobileSheet({ sectionName, onClose }: { sectionName: string | null; onClose: () => void }) {
  return (
    <BottomSheet
      onClose={onClose}
      size="full"
      topGap={SHEET_TOP_GAP_PX}
      closeLabel={sectionName ? `Adding to ${sectionName}` : 'Browse Pokémon'}
      title={
        sectionName !== null ? (
          <>
            <span className="text-foreground">Adding to: </span>
            <span className="text-primary">{sectionName}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Browse Pokémon</span>
        )
      }
    >
      <PokemonBrowser />
    </BottomSheet>
  );
}

function App() {
  // Keeps <html lang>/dir in step with the active locale: it drives the
  // per-script font stacks, CSS :lang() selectors, and screen-reader voice.
  useDocumentLocale();
  useCompletionBeacon();
  useMilestoneTracker();
  useJsErrorCounter();
  const [currentView, setCurrentView] = useState<AppView>('builder');
  const viewMounted = useRef(false);
  const analyticsMounted = useRef(false);
  const mobileBrowserOpen = usePokedexStore((s) => s.mobileBrowserOpen);
  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const drillDownSegment = usePokedexStore((s) => s.drillDownSegment);

  // Forward wheel events from the whitespace flanking the centered build page
  // to its internal scroll container when the browser panel is closed.
  const builderAreaRef = useRef<HTMLDivElement>(null);
  const activeSectionRef = useRef(activeSection);
  useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);
  useEffect(() => {
    const el = builderAreaRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (activeSectionRef.current) return; // panel open — let normal layout handle it
      // An open sheet or dialog is a layer above the page, so a wheel over it
      // is not "whitespace beside the build page" — forwarding it scrolls the
      // app underneath the sheet, which is the one thing an overlay must not
      // do. The overlay is `position: fixed` and so looks detached, but it is
      // still a DOM descendant of this element, which is why it reaches here at
      // all. Measured: without this, a wheel over the feedback sheet moved the
      // build page by the full deltaY.
      if ((e.target as Element | null)?.closest?.('[data-overlay], [role="dialog"]')) return;
      const scrollEl = el.querySelector('[data-build-scroll]') as HTMLElement | null;
      if (!scrollEl || scrollEl.contains(e.target as Node)) return; // already inside scroller
      scrollEl.scrollTop += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleViewChange = useCallback((view: AppView) => {
    // Analytics is gated until 25 Pokémon (sticky). Guard every path here.
    if (view === 'analytics' && !isAnalyticsUnlocked(usePokedexStore.getState().milestoneMax)) return;
    if (view === 'view') { viewMounted.current = true; sendEventBeacon('view-visit', { once: true }); }
    if (view === 'analytics') analyticsMounted.current = true;
    setCurrentView(view);
    if (view !== 'builder') {
      setMobileBrowserOpen(false);
      usePokedexStore.getState().setActiveSection(null);
    }
  }, [setMobileBrowserOpen]);

  // Gates the desktop-only browser panel. 1024px is --breakpoint-md, matching the
  // `md:` prefix the panel's own classes use, so mount and visibility agree.
  const isDesktopPanel = useViewportAtLeast(1024);

  // null means "no section chosen yet", i.e. plain browsing. Kept as null
  // rather than a display string so the sheet branches on state, not on text.
  const sectionName = activeSection ? sectionLabel(activeSection) : null;

  return (
    <TooltipProvider>
      <div className="h-dvh flex flex-col">
        <Header currentView={currentView} onViewChange={handleViewChange} />

        {/* Builder — always mounted to avoid remount cost on tab switch */}
        <div ref={builderAreaRef} className={cn('flex-1 min-h-0 relative overflow-hidden', currentView !== 'builder' && 'hidden')}>
          <div className={cn(
            'h-full transition-[margin] duration-300 ease-out',
            'md:w-1/2',
            activeSection ? 'md:mr-auto' : 'md:mx-auto',
          )}>
            <PokedexGrid />
          </div>
          {/* Desktop browser panel — slides in from right as an overlay.
            *
            * Gated on viewport width rather than left to `hidden md:flex` alone.
            * With no section active this panel renders the full unfiltered list,
            * which measured 16,020 of the page's 16,400 DOM nodes — 97.9% of the
            * document on a 390px viewport, none of it ever painted. CSS hides it,
            * but React still builds and reconciles the whole tree, so the first tap
            * on mobile had to tear ~15,000 nodes down before it could respond.
            *
            * Mobile browses through MobileSheet instead, which is already mounted
            * on demand a few lines below. Desktop keeps the panel permanently
            * mounted: the slide-in transition needs it present to animate from
            * translate-x-full, so do NOT extend this gate to on-demand mounting.
            *
            * useViewportAtLeast is the existing hook used for sprite sizing. It
            * reads the *unzoomed* width, so iOS pinch-zoom cannot unmount the
            * panel mid-gesture the way a raw matchMedia would risk. */}
          {isDesktopPanel && (
            <div className={cn(
              'hidden md:flex absolute right-0 top-0 bottom-0 z-10',
              'w-1/2 border-l bg-background',
              'transition-transform duration-300 ease-out',
              activeSection ? 'translate-x-0' : 'translate-x-full',
            )}>
              <div className="flex-1 min-w-0">
                <PokemonBrowser />
              </div>
            </div>
          )}
        </div>

        {/* View — lazy, mounted on first visit then kept alive */}
        <div className={cn('flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col', currentView !== 'view' && 'hidden')}>
          {viewMounted.current && (
            <ErrorBoundary where="view">
              <Suspense fallback={<RouteFallback />}>
                <ViewPage />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>

        {/* Analytics — lazy, mounted on first visit then kept alive */}
        <div className={cn('flex-1 flex min-h-0', currentView !== 'analytics' && 'hidden')}>
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
            {analyticsMounted.current && (
              <ErrorBoundary where="analytics">
                <Suspense fallback={<RouteFallback />}>
                  <AnalyticsDashboard />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
          {drillDownSegment && (
            <div className="hidden md:flex w-1/2 flex-shrink-0 border-l">
              <DrillDownPanel />
            </div>
          )}
        </div>
      </div>

      {/* Mobile browser sheet */}
      {currentView === 'builder' && mobileBrowserOpen && (
        <MobileSheet sectionName={sectionName} onClose={() => { setMobileBrowserOpen(false); usePokedexStore.getState().setActiveSection(null); }} />
      )}

      {/* Analytics drill-down sheet — only on analytics view */}
      {currentView === 'analytics' && drillDownSegment && <DrillDownSheet />}

      {/* Milestone celebration nudges (analytics @25, view @100, confetti @151) */}
      <MilestoneCelebration onNavigate={handleViewChange} />

      {/* Dev-only MilestoneBar tuning panel (renders only with ?tune) */}
      <MilestoneTunePanel />
    </TooltipProvider>
  );
}

export default App;
