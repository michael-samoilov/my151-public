import { useState, useRef, useCallback, useEffect, lazy, startTransition, Suspense } from 'react';
import { Header } from '@/components/layout/Header';
import type { AppView } from '@/components/layout/Header';
import { ToolbarSlotContext } from '@/components/layout/toolbarSlot';
import { PokedexGrid } from '@/components/pokedex/PokedexGrid';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { DrillDownSheet, DrillDownPanel } from '@/components/analytics/DrillDownSheet';
import { usePokedexStore } from '@/store/usePokedexStore';

// Route chunks stay lazy so boot ships small, and are prefetched when the
// main thread first goes idle (see the effect in App) so a tab switch pays
// only for rendering. `lazy` and the prefetch share one thunk each: the
// module registry dedupes, so whichever runs first does the work and the
// other reuses it.
const importAnalyticsDashboard = () => import('@/components/analytics/AnalyticsDashboard');
const importViewPage = () => import('@/components/view/ViewPage');

const AnalyticsDashboard = lazy(() =>
  importAnalyticsDashboard().then((m) => ({ default: m.AnalyticsDashboard })),
);
const ViewPage = lazy(() =>
  importViewPage().then((m) => ({ default: m.ViewPage })),
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
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { isAnalyticsUnlocked } from '@/lib/milestones';
import { cn } from '@/lib/utils';
import { sectionName as sectionLabel, useDocumentLocale } from '@/i18n';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { whenIdle } from '@/lib/whenIdle';

declare const __BUILD_TIMESTAMP__: string;
console.log(`[P151] build: ${__BUILD_TIMESTAMP__}`);

function MobileSheet({ sectionName, topGap, onClose, isDesktop }: { sectionName: string | null; topGap: number; onClose: () => void; isDesktop: boolean }) {
  // The sheet is `md:hidden`, so a browser mounted in it at desktop width is a
  // second, invisible copy of the side pane's, built on the same tap and
  // re-rendered with it. It mounts the first time the sheet is at phone width
  // instead, and then stays, so a tablet turned across the breakpoint and back
  // still has its staged picks. The sheet itself mounts at every width: its
  // Escape handler is what closes the desktop pane.
  const [browserMounted, setBrowserMounted] = useState(!isDesktop);
  if (!isDesktop && !browserMounted) setBrowserMounted(true);
  return (
    <BottomSheet
      onClose={onClose}
      size="full"
      topGap={topGap}
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
      {browserMounted && <PokemonBrowser />}
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
  // The second header's right cell; pages portal their controls into it.
  const [toolbarEl, setToolbarEl] = useState<HTMLElement | null>(null);
  // State rather than refs so the idle pre-mount below can flip them without
  // a navigation. Once true they stay true: routes mount once and live on.
  const [viewMounted, setViewMounted] = useState(false);
  const [analyticsMounted, setAnalyticsMounted] = useState(false);
  const mobileBrowserOpen = usePokedexStore((s) => s.mobileBrowserOpen);
  const setMobileBrowserOpen = usePokedexStore((s) => s.setMobileBrowserOpen);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const drillDownSegment = usePokedexStore((s) => s.drillDownSegment);
  const isDesktop = useIsDesktop();

  // The mobile sheets stop at the header's bottom edge, so the nav tabs stay
  // visible and the sheet's handle stays reachable. The header is two
  // rem-sized bars that grow with the root font size (layoutFontSize.ts), so
  // its height is measured here, not pinned.
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Prefetch the route chunks once boot has settled, so the first visit to
  // Analytics or View doesn't wait on a network fetch and the chunk's module
  // evaluation — the analytics chunk computes its national baselines at
  // module scope, which is exactly the work that made the first tab switch
  // slow. Analytics goes first because its evaluation is the expensive one;
  // the view chunk takes a second idle slot so the two never form one long
  // block. A failed prefetch is ignored: `lazy` retries the import on the
  // actual visit. Readers who asked the browser to save data keep the old
  // fetch-on-first-visit behavior.
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
                // With the chunks in hand, mount both routes into their hidden
                // containers. The transition keeps the hidden render at low
                // priority, so a tap on the builder interrupts it instead of
                // waiting behind it. Analytics only pre-mounts once its tab is
                // reachable; until then there is nothing to warm.
                whenIdle(() => {
                  if (cancelled) return;
                  startTransition(() => {
                    setViewMounted(true);
                    if (isAnalyticsUnlocked(usePokedexStore.getState().milestoneMax)) {
                      setAnalyticsMounted(true);
                    }
                  });
                });
              });
          });
        });
    });
    return () => { cancelled = true; };
  }, []);

  // Analytics can unlock after boot (the reader places their 25th Pokémon).
  // Pre-mount it in the next idle slot after that, so the newly enabled tab
  // is warm by the time it is tapped.
  useEffect(() => {
    if (!analyticsUnlocked || analyticsMounted) return;
    let cancelled = false;
    whenIdle(() => {
      if (cancelled) return;
      startTransition(() => setAnalyticsMounted(true));
    });
    return () => { cancelled = true; };
  }, [analyticsUnlocked, analyticsMounted]);

  // Mount the desktop browser panel's content only while a section is active,
  // holding it through the 300ms slide-out so the closing animation keeps its
  // content. The off-canvas panel used to stay mounted with the full
  // unfiltered grid (~20k DOM nodes), re-rendering on every store change —
  // the main INP cost on the builder view. Browser filter state lives in the
  // zustand store, so unmounting loses nothing.
  const [browserPanelMounted, setBrowserPanelMounted] = useState(false);
  // Mount during render, not in an effect, so the panel's content is present
  // in the same commit that starts the slide-in.
  if (activeSection && !browserPanelMounted) setBrowserPanelMounted(true);
  useEffect(() => {
    if (activeSection) return;
    const id = window.setTimeout(() => setBrowserPanelMounted(false), 300);
    return () => window.clearTimeout(id);
  }, [activeSection]);

  // Clear all filters when the mobile browser sheet closes (fresh state on
  // next open). Lives here, not in PokemonBrowser: the sheet unmounts its
  // browser instance on close, and the desktop panel instance that used to
  // catch this transition no longer stays mounted.
  const prevMobileBrowserOpen = useRef(mobileBrowserOpen);
  useEffect(() => {
    if (prevMobileBrowserOpen.current && !mobileBrowserOpen) {
      usePokedexStore.getState().resetBrowserFilters();
    }
    prevMobileBrowserOpen.current = mobileBrowserOpen;
  }, [mobileBrowserOpen]);

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
    // The nav paints first; the heavy lazy page mounts inside a transition,
    // so React can yield to the tab animation instead of freezing it — the
    // old single synchronous commit is what made switches choppy.
    if (view === 'view') { startTransition(() => setViewMounted(true)); sendEventBeacon('view-visit', { once: true }); }
    if (view === 'analytics') startTransition(() => setAnalyticsMounted(true));
    setCurrentView(view);
    if (view !== 'builder') {
      setMobileBrowserOpen(false);
      usePokedexStore.getState().setActiveSection(null);
    }
  }, [setMobileBrowserOpen]);

  // null means "no section chosen yet", i.e. plain browsing. Kept as null
  // rather than a display string so the sheet branches on state, not on text.
  const sectionName = activeSection ? sectionLabel(activeSection) : null;

  return (
    <TooltipProvider>
      <div className="h-dvh flex flex-col">
        <Header ref={headerRef} currentView={currentView} onViewChange={handleViewChange} toolbarRef={setToolbarEl} />

        <ToolbarSlotContext.Provider value={{ el: toolbarEl, view: currentView }}>
        {/* Builder — always mounted to avoid remount cost on tab switch */}
        <div ref={builderAreaRef} className={cn('flex-1 min-h-0 relative overflow-hidden', currentView !== 'builder' ? 'hidden' : 'p151-view-enter')}>
          <div className={cn(
            'h-full transition-[margin] duration-300 ease-out',
            'md:w-1/2',
            activeSection ? 'md:mr-auto' : 'md:mx-auto',
          )}>
            <PokedexGrid />
          </div>
          {/* Desktop browser panel — slides in from right as an overlay.
              The wrapper stays mounted to own the transform transition; the
              browser itself mounts only while open (plus the slide-out). */}
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

        {/* View — lazy, mounted on first visit then kept alive */}
        <div className={cn('flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col', currentView !== 'view' ? 'hidden' : 'p151-view-enter')}>
          {viewMounted && (
            <ErrorBoundary where="view">
              <Suspense fallback={<RouteFallback />}>
                <ViewPage />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>

        {/* Analytics — lazy, mounted on first visit then kept alive */}
        <div className={cn('flex-1 flex min-h-0', currentView !== 'analytics' ? 'hidden' : 'p151-view-enter')}>
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
            {analyticsMounted && (
              <ErrorBoundary where="analytics">
                <Suspense fallback={<RouteFallback />}>
                  <AnalyticsDashboard />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
          {drillDownSegment && isDesktop && (
            <div className="hidden md:flex w-1/2 flex-shrink-0 border-l">
              <DrillDownPanel />
            </div>
          )}
        </div>
        </ToolbarSlotContext.Provider>
      </div>

      {/* Mobile browser sheet */}
      {currentView === 'builder' && mobileBrowserOpen && (
        <MobileSheet sectionName={sectionName} topGap={headerHeight} isDesktop={isDesktop} onClose={() => { setMobileBrowserOpen(false); usePokedexStore.getState().setActiveSection(null); }} />
      )}

      {/* Analytics drill-down sheet — only on analytics view, mobile only.
          The desktop pane above covers >=1024px; mounting both built three
          hidden carousel panels per desktop chart tap. */}
      {currentView === 'analytics' && drillDownSegment && !isDesktop && <DrillDownSheet topGap={headerHeight} />}

      {/* The report form's single mount point, outside every page's hidden
          subtree and error boundary, so the footer link and the crash fallback
          both open a sheet that is actually on screen. The route is the visible
          page, which the footer link cannot carry on its own. */}
      <FeedbackHost route={currentView} />

      {/* Milestone celebration nudges (analytics @25, view @100, confetti @151) */}
      <MilestoneCelebration onNavigate={handleViewChange} />

      {/* Dev-only MilestoneBar tuning panel (renders only with ?tune) */}
      <MilestoneTunePanel />
    </TooltipProvider>
  );
}

export default App;
