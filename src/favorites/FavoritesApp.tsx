import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { FollowUpHint } from '@/components/milestone/FollowUpHint';
import { fireCompletionConfetti, preloadCompletionConfetti } from '@/components/milestone/completionConfetti';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { PageFooter } from '@/components/shared/PageFooter';
import { MAIN_ID, SkipLink } from '@/components/shared/SkipLink';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { whenIdle } from '@/lib/whenIdle';
import { loadChunk } from '@/lib/staleDeploy';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useDocumentLocale, useT } from '@/i18n';
import { cellKey, parseCellKey, type GenAxisId, type TypeAxisId } from './model/cells';
import { getPickerMon } from './model/catalog';
import { openCell, prefetchCellSoon, prefetchEverySprite } from './model/spritePreload';
import { kindFor } from './model/eligibility';
import { buildFavoritesSnapshot } from './export/snapshot';
import { recordSavedPicks } from './export/savedPicks';
import type { FeedbackToolContext } from '@/lib/feedbackContext';
import { sendFavoriteExportShownBeacon, sendFavoriteNudgeShownBeacon, useFavoriteBeacon } from './hooks/useFavoriteBeacon';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useCompletionNudge } from './hooks/useCompletionNudge';
import { filledCount, useAnalyticsUnlock } from './hooks/useAnalyticsUnlock';
import { AnalyticsNudge } from './components/AnalyticsNudge';
import { useFavoritesStore } from './store/useFavoritesStore';
import { FavoritesGrid } from './components/FavoritesGrid';
import { FavoritesHeader, type FavoritesView } from './components/FavoritesHeader';
import { FavoritesTypeRepairNotice } from './components/FavoritesTypeRepairNotice';
import { PickerSheet } from './components/PickerSheet';
import { SortDebugPanel } from './components/SortDebugPanel';
import { initialSortOrder, SORT_DEBUG_ENABLED } from './model/sortDebug';
import type { PackMove } from './model/packing';
import { PokeBallSpinner, ScreenSpinner } from '@/components/shared/PokeBallSpinner';

// v2: Icons now starts off. v1 held `1` for nearly everyone, written on the first visit, not chosen.
const ICONS_STORAGE_KEY = 'personal-151-favorites-show-icons-v2';
const FavoritesAnalyticsDashboard = lazy(() => loadChunk(() => import('./components/FavoritesAnalyticsDashboard')));
const FavoritesExportOverlay = lazy(() => loadChunk(() => import('./components/FavoritesExportOverlay')));

type Selection = { type: TypeAxisId; gen: GenAxisId; keyboard?: boolean };

function completionShown() {
  sendFavoriteNudgeShownBeacon();
  fireCompletionConfetti();
}

function savedShowIcons(): boolean {
  try { return window.localStorage.getItem(ICONS_STORAGE_KEY) === '1'; }
  catch { return false; }
}

function GlobalHeader() {
  return (
    <header className="flex h-11 items-center justify-between border-b bg-card px-3 sm:px-6">
      <a href="/" data-testid="wordmark" className="text-2xl font-extrabold tracking-tight">
        <span className="text-primary">my151</span>
        <span className="text-foreground">.app</span>
      </a>
      <div className="flex flex-shrink-0 items-center gap-0 min-[360px]:gap-1">
        <LanguagePicker />
        <FeedbackButton />
        <ToolsMenu current="favorites" />
      </div>
    </header>
  );
}

export function FavoritesApp() {
  const [sel, setSel] = useState<Selection | null>(null);
  return <TooltipProvider delayDuration={200}>
    <ErrorBoundary where="favorite-picker">
      <FavoritesContent sel={sel} setSel={setSel} />
    </ErrorBoundary>
    <FeedbackHost route="/favorite-pokemon-picker" getToolContext={() => {
      const completion = buildFavoritesSnapshot(useFavoritesStore.getState().fills ?? {}).completion;
      return {
        placed: completion.filled, search: false, filters: [],
        favorites: { filled: completion.filled, total: completion.total,
          picksFilled: completion.picksFilled, pointersFilled: completion.pointersFilled,
          selection: sel ? { type: sel.type, gen: sel.gen } : null },
      } satisfies FeedbackToolContext;
    }} />
  </TooltipProvider>;
}

function FavoritesContent({ sel, setSel }: {
  sel: Selection | null;
  setSel: (next: Selection | null) => void;
}) {
  useFavoriteBeacon();
  useJsErrorCounter();
  useDocumentLocale();
  const desktop = useIsDesktop();
  const fills = useFavoritesStore((s) => s.fills);
  const shiny = useFavoritesStore((s) => s.shiny);
  const place = useFavoritesStore((s) => s.place);
  const applyPack = useFavoritesStore((s) => s.applyPack);
  const clear = useFavoritesStore((s) => s.clear);
  const [showIcons, setShowIcons] = useState(savedShowIcons);
  const [shinyView, setShinyView] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [currentView, setCurrentView] = useState<FavoritesView>('picker');
  const [analyticsMounted, setAnalyticsMounted] = useState(false);
  const exportRef = useRef<HTMLButtonElement>(null);
  const completionNudge = useCompletionNudge();
  const analytics = useAnalyticsUnlock();
  const filled = useMemo(() => filledCount(fills), [fills]);
  useEffect(() => { recordSavedPicks(); }, [fills]);
  useEffect(() => {
    if (completionNudge.armed) preloadCompletionConfetti();
  }, [completionNudge.armed]);
  const [sortOrder, setSortOrder] = useState(initialSortOrder);
  const t = useT();

  useEffect(() => {
    document.title = `${t('favorites.title')} | my151`;
  }, [t]);

  useEffect(() => {
    try { window.localStorage.setItem(ICONS_STORAGE_KEY, showIcons ? '1' : '0'); }
    catch { /* Storage can be unavailable in private browsing. */ }
  }, [showIcons]);

  useEffect(() => {
    let alive = true;
    let observer: IntersectionObserver | null = null;
    whenIdle(() => {
      if (!alive) return;
      prefetchCellSoon('normal', 1);
      if (window.matchMedia('(min-width: 1024px)').matches) return;
      const seen = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          seen.unobserve(entry.target);
          const cell = parseCellKey((entry.target as HTMLElement).dataset.cell ?? '');
          if (cell) prefetchCellSoon(cell.type, cell.gen);
        }
      });
      document.querySelectorAll('[data-cell]').forEach((el) => seen.observe(el));
      observer = seen;
    });
    return () => { alive = false; observer?.disconnect(); };
  }, []);
  useEffect(() => {
    if (sel) whenIdle(prefetchEverySprite);
  }, [sel]);

  function open(type: TypeAxisId, gen: GenAxisId, keyboard = false) {
    const kind = kindFor(type, gen);
    if (kind === 'disabled' || kind === 'null') return;
    openCell(type, gen);
    setCurrentView('picker');
    setShinyView(false);
    setSel(desktop && sel?.type === type && sel.gen === gen ? null : { type, gen, keyboard });
  }

  const picker = sel ? (
    <PickerSheet
      autoFocus={sel.keyboard}
      type={sel.type}
      gen={sel.gen}
      fills={fills}
      shiny={shiny}
      currentId={fills[cellKey(sel.type, sel.gen)]}
      showIcons={showIcons}
      shinyView={shinyView}
      sortOrder={sortOrder}
      onToggleIcons={() => {
        if (!showIcons) sendEventBeacon('favorites-icons-on', { once: true });
        setShowIcons(!showIcons);
      }}
      onToggleShiny={() => {
        if (!shinyView) sendEventBeacon('favorites-shiny-on', { once: true });
        setShinyView(!shinyView);
      }}
      onClose={() => {
        if (sel.keyboard) requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>(`[data-testid="favorites-cell-${sel.type}-${sel.gen}"]`)?.focus({ preventScroll: true });
        });
        setSel(null);
      }}
      onPlace={(id, shinyPick) => place(sel.type, sel.gen, id, shinyPick)}
      onApplyPack={(path: PackMove[]) => {
        if (typeof sel.gen === 'number') applyPack(sel.gen, path);
      }}
      onClear={() => clear(sel.type, sel.gen)}
      onOpenCell={(type, gen, keyboard) => {
        document.querySelector(`[data-testid="favorites-cell-${type}-${gen}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        open(type, gen, keyboard);
      }}
    />
  ) : null;

  return (
    <>
      <div inert={exportOpen} className="flex min-h-dvh flex-col bg-background text-foreground">
        <SkipLink />
        <GlobalHeader />
        {/* One `<main>` for both tabs. A `<main>` that is also a tab panel
            loses its landmark role, so the panels are plain elements. */}
        <main id={MAIN_ID} tabIndex={-1} className="flex shrink-0 flex-col focus:outline-none">
        <FavoritesHeader fills={fills} filled={filled} analyticsUnlocked={analytics.unlocked}
          currentView={currentView} exportOpen={exportOpen} exportRef={exportRef}
          onViewChange={(view) => {
            if (view === 'analytics' && !analytics.unlocked) return;
            setSel(null);
            if (view === 'analytics') setAnalyticsMounted(true);
            setCurrentView(view);
          }}
          onExport={() => { setSel(null); setExportOpen(true); sendFavoriteExportShownBeacon(fills, shiny); }} />
        <div id="favorites-panel-picker" role="tabpanel" aria-labelledby="favorites-tab-picker"
          hidden={currentView !== 'picker'} className={currentView === 'picker' ? 'flex h-[calc(100dvh-2*2.75rem)] shrink-0 flex-col' : 'hidden'}>
          <FavoritesTypeRepairNotice fills={fills} onReview={open} />
          <div className="flex min-h-0 flex-1">
            <div className={desktop ? 'h-full min-h-0 min-w-0 flex-1 px-2 pt-2' : 'h-full min-h-0 min-w-0 flex-1 p-1'}>
              <FavoritesGrid
                fills={fills}
                shiny={shiny}
                resolve={getPickerMon}
                selected={sel}
                onSelect={open}
                edits={{ clear, place }}
                desktop={desktop}
                pane={desktop ? picker : null}
              />
            </div>
            {SORT_DEBUG_ENABLED ? <SortDebugPanel desktop={desktop} order={sortOrder} onChange={setSortOrder} /> : null}
          </div>
        </div>
        <div id="favorites-panel-analytics" role="tabpanel" aria-labelledby="favorites-tab-analytics"
          hidden={currentView !== 'analytics'} className={currentView === 'analytics' ? 'h-[calc(100dvh-2*2.75rem)] shrink-0 min-h-0' : 'hidden'}>
          {analyticsMounted && <Suspense fallback={<div role="status" aria-label={t('favorites.nav.analytics')} className="flex h-full items-center justify-center opacity-70"><PokeBallSpinner delayed className="h-12 w-12" /></div>}>
            <FavoritesAnalyticsDashboard fills={fills} active={currentView === 'analytics'} />
          </Suspense>}
        </div>
        </main>
        {desktop ? null : picker}
        <PageFooter faq="favorites" compact />
      </div>
      <AnalyticsNudge armed={analytics.armed} canShow={currentView === 'picker' && !exportOpen && (desktop || sel === null)} desktop={desktop}
        onDismiss={analytics.dismiss}
        onOpen={() => {
          setSel(null);
          setAnalyticsMounted(true);
          setCurrentView('analytics');
          analytics.dismiss();
        }} />
      <FollowUpHint
        armed={completionNudge.armed}
        dismiss={completionNudge.dismiss}
        fulfilled={exportOpen}
        anchorRef={exportRef}
        title={t('favorites.nudge.complete.title')}
        body={t('favorites.nudge.complete.body')}
        onShown={completionShown}
      />
      {exportOpen && <Suspense fallback={<ScreenSpinner />}>
        <FavoritesExportOverlay fills={fills} shiny={shiny} onClose={() => setExportOpen(false)}
          onReview={(type, gen) => { setExportOpen(false); open(type, gen); }} />
      </Suspense>}
    </>
  );
}
