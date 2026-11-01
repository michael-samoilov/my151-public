import { Activity, useState, useRef, useCallback, useEffect, lazy, startTransition, Suspense } from 'react';
import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { Header } from '@/components/layout/Header';
import type { AppView } from '@/components/layout/Header';
import { ToolbarSlotContext } from '@/components/layout/toolbarSlot';
import { PokedexGrid } from '@/components/pokedex/PokedexGrid';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { BrowserStoreContext, type BrowserStoreState } from '@/components/browser/browserStore';

import { usePokedexStore } from '@/store/usePokedexStore';
import { loadChunk } from '@/lib/staleDeploy';
import { BUILD_TIMESTAMP } from '@/lib/buildVersion';

const importAnalyticsDashboard = () => loadChunk(() => import('@/components/analytics/AnalyticsDashboard'));
const importViewPage = () => loadChunk(() => import('@/components/view/ViewPage'));

const AnalyticsDashboard = lazy(() =>
  importAnalyticsDashboard().then((m) => ({ default: m.AnalyticsDashboard })),
);
const importDrillDown = () => loadChunk(() => import('@/components/analytics/DrillDownSheet'));
const DrillDownSheet = lazy(() => importDrillDown().then(module => ({ default: module.DrillDownSheet })));
const DrillDownPanel = lazy(() => importDrillDown().then(module => ({ default: module.DrillDownPanel })));
const ViewPage = lazy(() =>
  importViewPage().then((m) => ({ default: m.ViewPage })),
);

function RouteFallback() {
  return (
    <div className="flex-1 flex items-center justify-center opacity-70">
      <PokeBallSpinner delayed className="w-12 h-12" />
    </div>
  );
}
import { TooltipProvider } from '@/components/ui/tooltip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCompletionBeacon, sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useMilestoneTracker } from '@/hooks/useMilestoneTracker';
import { MilestoneTunePanel } from '@/components/pokedex/MilestoneBar';
import { MilestoneCelebration } from '@/components/milestone/MilestoneCelebration';
import { PokeBallSpinner, ScreenSpinner } from '@/components/shared/PokeBallSpinner';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { MAIN_ID, SkipLink } from '@/components/shared/SkipLink';
import { isAnalyticsUnlocked } from '@/lib/milestones';
import { cn } from '@/lib/utils';
import { sectionName as sectionLabel, useDocumentLocale, useT } from '@/i18n';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { whenIdle } from '@/lib/whenIdle';
import { pauseSpriteWarmup, spriteWarmupPlan, warmSprites } from '@/lib/spriteWarmup';

console.log(`[P151] build: ${BUILD_TIMESTAMP}`);

function MobileSheet({ sectionName, topGap, onClose, isDesktop }: { sectionName: string | null; topGap: number; onClose: () => void; isDesktop: boolean }) {
  const [browserMounted, setBrowserMounted] = useState(!isDesktop);
  if (!isDesktop && !browserMounted) setBrowserMounted(true);
  const t = useT();
  return (
    <BottomSheet
      onClose={onClose}
      instant
      size="full"
      topGap={topGap}
      closeLabel={sectionName ? t('builder.addingToLabel', { section: sectionName }) : t('builder.browse')}
      title={
        sectionName !== null ? (
          <>
            <span className="text-foreground">{t('builder.addingTo')}</span>
            <span className="text-primary">{sectionName}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{t('builder.browse')}</span>
        )
      }
    >
      {browserMounted && <PokemonBrowser />}
    </BottomSheet>
  );
}

/** Hidden content renders at the lowest priority, after everything else; 5 s covers the lab phone. */
const PRACTICE_RENDER_MS = 5000;

/**
 * Builds a hidden Starters picker once while the page is idle, so the first
 * picker a visitor opens runs on warm code: on the lab phone, the first
 * Starters open fell from about 680 to 459 ms. Hidden `<Activity>` content
 * renders without effects or layout and yields to any input. It renders into
 * an element that is never attached, so no selector or screen reader finds it.
 */
function PickerPracticeRender({ onDone }: { onDone: () => void }) {
  const [host] = useState(() => document.createElement('div'));
  const [store] = useState(() => create<BrowserStoreState>()(() => ({
    ...usePokedexStore.getState(),
    activeSection: 'starter', activeCategoryFilter: 'starter', activeArchetypeFilter: null,
    searchQuery: '', typeFilter: ['grass'], typeFilterMode: 'any', generationFilter: null,
    shapeFilter: null, colorFilter: null, eggGroupFilter: null, evoLineSizeFilter: null,
    // Never the visitor's own Pokédex: nothing here may write to it.
    addToSection: () => {}, removeEvoLine: () => {}, setActiveSection: () => {}, setMobileBrowserOpen: () => {},
  })));
  useEffect(() => {
    const id = setTimeout(() => whenIdle(() => startTransition(onDone)), PRACTICE_RENDER_MS);
    return () => clearTimeout(id);
  }, [onDone]);
  return createPortal(
    <Activity mode="hidden">
      <BrowserStoreContext.Provider value={store}>
        <PokemonBrowser />
      </BrowserStoreContext.Provider>
    </Activity>,
    host,
  );
}

function App() {
  useDocumentLocale();
  useCompletionBeacon();
  useMilestoneTracker();
  useJsErrorCounter();
  const [currentView, setCurrentView] = useState<AppView>('builder');
  const [toolbarEl, setToolbarEl] = useState<HTMLElement | null>(null);
  const [viewMounted, setViewMounted] = useState(false);
  const [analyticsMounted, setAnalyticsMounted] = useState(false);
  const [practiceRender, setPracticeRender] = useState(false);
  const endPracticeRender = useCallback(() => setPracticeRender(false), []);
  useEffect(() => {
    if (analyticsMounted) void importDrillDown();
  }, [analyticsMounted]);
  const mobileBrowserOpen = usePokedexStore((s) => s.mobileBrowserOpen);
  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const drillDownSegment = usePokedexStore((s) => s.drillDownSegment);
  const isDesktop = useIsDesktop();

  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const analyticsUnlocked = isAnalyticsUnlocked(usePokedexStore((s) => s.milestoneMax));
  useEffect(() => {
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    let cancelled = false;
    whenIdle(() => {
      if (cancelled) return;
      importAnalyticsDashboard()
        .catch(() => {})
        .finally(() => {
          whenIdle(() => {
            if (cancelled) return;
            void importViewPage()
              .catch(() => {})
              .finally(() => {
                whenIdle(() => {
                  if (cancelled) return;
                  startTransition(() => {
                    setViewMounted(true);
                    if (isAnalyticsUnlocked(usePokedexStore.getState().milestoneMax)) {
                      setAnalyticsMounted(true);
                    }
                  });
                  whenIdle(() => {
                    if (cancelled) return;
                    warmSprites(spriteWarmupPlan(usePokedexStore.getState().sections));
                    startTransition(() => setPracticeRender(true));
                  });
                });
              });
          });
        });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!analyticsUnlocked || analyticsMounted) return;
    let cancelled = false;
    whenIdle(() => {
      if (cancelled) return;
      startTransition(() => setAnalyticsMounted(true));
    });
    return () => { cancelled = true; };
  }, [analyticsUnlocked, analyticsMounted]);

  useEffect(() => pauseSpriteWarmup(Boolean(activeSection)), [activeSection]);

  const [browserPanelMounted, setBrowserPanelMounted] = useState(false);
  if (activeSection && !browserPanelMounted) setBrowserPanelMounted(true);
  useEffect(() => {
    if (activeSection) return;
    const id = window.setTimeout(() => setBrowserPanelMounted(false), 300);
    return () => window.clearTimeout(id);
  }, [activeSection]);

  const prevMobileBrowserOpen = useRef(mobileBrowserOpen);
  useEffect(() => {
    if (prevMobileBrowserOpen.current && !mobileBrowserOpen) {
      usePokedexStore.getState().resetBrowserFilters();
    }
    prevMobileBrowserOpen.current = mobileBrowserOpen;
  }, [mobileBrowserOpen]);

  const builderAreaRef = useRef<HTMLDivElement>(null);
  const activeSectionRef = useRef(activeSection);
  useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);
  useEffect(() => {
    const el = builderAreaRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (activeSectionRef.current) return;

      if ((e.target as Element | null)?.closest?.('[data-overlay], [role="dialog"]')) return;
      const scrollEl = el.querySelector('[data-build-scroll]') as HTMLElement | null;
      if (!scrollEl || scrollEl.contains(e.target as Node)) return;
      scrollEl.scrollTop += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleViewChange = useCallback((view: AppView) => {
    if (view === 'analytics' && !isAnalyticsUnlocked(usePokedexStore.getState().milestoneMax)) return;
    if (view === 'view') { startTransition(() => setViewMounted(true)); sendEventBeacon('view-visit', { once: true }); }
    if (view === 'analytics') startTransition(() => setAnalyticsMounted(true));
    setCurrentView(view);
    if (view !== 'builder') {
      setMobileBrowserOpen(false);
      usePokedexStore.getState().setActiveSection(null);
    }
  }, [setMobileBrowserOpen]);

  const sectionName = activeSection ? sectionLabel(activeSection) : null;

  return (
    <TooltipProvider>
      <div className="h-dvh flex flex-col">
        <SkipLink />
        <Header ref={headerRef} currentView={currentView} onViewChange={handleViewChange} toolbarRef={setToolbarEl} />

        <ToolbarSlotContext.Provider value={{ el: toolbarEl, view: currentView }}>
        <main id={MAIN_ID} tabIndex={-1} className="flex min-h-0 flex-1 flex-col focus:outline-none">
        <ErrorBoundary where="pokedex-builder">
        <div ref={builderAreaRef} className={cn('flex-1 min-h-0 relative overflow-hidden', currentView !== 'builder' ? 'hidden' : 'p151-view-enter')}>
          <div className={cn(
            'h-full',
            'md:w-1/2',
            activeSection ? 'md:mr-auto' : 'md:mx-auto',
          )}>
            <PokedexGrid />
          </div>
          <div className={cn(
            'hidden md:flex absolute right-0 top-0 bottom-0 z-10',
            'w-1/2 border-l bg-background',
            'transition-transform duration-300 ease-out',
            activeSection ? 'translate-x-0' : 'translate-x-full',
          )}>
            {isDesktop && browserPanelMounted && (
              <div className="flex-1 min-w-0">
                <PokemonBrowser deferRows />
              </div>
            )}
          </div>
        </div>

        <div className={cn('flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col', currentView !== 'view' ? 'hidden' : 'p151-view-enter')}>
          {viewMounted && (
            <ErrorBoundary where="view">
              <Suspense fallback={<RouteFallback />}>
                <ViewPage />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>

        <div className={cn('flex-1 flex min-h-0', currentView !== 'analytics' ? 'hidden' : 'p151-view-enter')}>
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
            {analyticsMounted && (
              <ErrorBoundary where="analytics">
                <Suspense fallback={<RouteFallback />}>
                  <AnalyticsDashboard onAddPokemon={() => handleViewChange('builder')} />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
          {drillDownSegment && isDesktop && (
            <div className="hidden md:flex w-1/2 flex-shrink-0 border-l">
              <Suspense fallback={<ScreenSpinner />}><DrillDownPanel /></Suspense>
            </div>
          )}
        </div>
        </ErrorBoundary>
        </main>
        </ToolbarSlotContext.Provider>
      </div>

      {currentView === 'builder' && mobileBrowserOpen && (
        <MobileSheet sectionName={sectionName} topGap={headerHeight} isDesktop={isDesktop} onClose={() => { setMobileBrowserOpen(false); usePokedexStore.getState().setActiveSection(null); }} />
      )}

      {currentView === 'analytics' && drillDownSegment && !isDesktop && <Suspense fallback={<ScreenSpinner />}><DrillDownSheet topGap={headerHeight} /></Suspense>}

      {practiceRender && <PickerPracticeRender onDone={endPracticeRender} />}

      <FeedbackHost route={currentView} />

      <MilestoneCelebration view={currentView} onNavigate={handleViewChange} />

      <MilestoneTunePanel />
    </TooltipProvider>
  );
}

export default App;
