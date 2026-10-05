import { lazy, Suspense, useEffect, useState } from 'react';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { PageFooter } from '@/components/shared/PageFooter';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useDocumentLocale, useT } from '@/i18n';
import { cellKey, type GenAxisId, type TypeAxisId } from './model/cells';
import { getPickerMon } from './model/catalog';
import { prewarmPickerSprites } from './model/spritePreload';
import { kindFor } from './model/eligibility';
import { buildFavoritesSnapshot } from './export/snapshot';
import type { FeedbackToolContext } from '@/lib/feedbackContext';
import { useFavoriteBeacon } from './hooks/useFavoriteBeacon';
import { useFavoritesStore } from './store/useFavoritesStore';
import { FavoritesGrid } from './components/FavoritesGrid';
import { FavoritesHeader, type FavoritesView } from './components/FavoritesHeader';
import { FavoritesTypeRepairNotice } from './components/FavoritesTypeRepairNotice';
import { PickerSheet } from './components/PickerSheet';
import { SortDebugPanel } from './components/SortDebugPanel';
import { initialSortOrder, SORT_DEBUG_ENABLED } from './model/sortDebug';
import type { PackMove } from './model/packing';

const ICONS_STORAGE_KEY = 'personal-151-favorites-show-icons-v1';
const FavoritesAnalyticsDashboard = lazy(() => import('./components/FavoritesAnalyticsDashboard'));
const FavoritesExportOverlay = lazy(() => import('./components/FavoritesExportOverlay'));

type Selection = { type: TypeAxisId; gen: GenAxisId; keyboard?: boolean };

function savedShowIcons(): boolean {
  try { return window.localStorage.getItem(ICONS_STORAGE_KEY) !== '0'; }
  catch { return true; }
}

function GlobalHeader() {
  return (
    <header className="flex h-11 items-center justify-between border-b bg-card px-3 sm:px-6">
      <a href="/" data-testid="wordmark" className="text-2xl font-extrabold tracking-tight">
        <span className="text-primary">my151</span>
        <span className="text-foreground">.app</span>
      </a>
      <div className="flex flex-shrink-0 items-center gap-1">
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
    <FeedbackHost route="/favorite-pokemon-by-type" getToolContext={() => {
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
  const place = useFavoritesStore((s) => s.place);
  const applyPack = useFavoritesStore((s) => s.applyPack);
  const clear = useFavoritesStore((s) => s.clear);
  const [showIcons, setShowIcons] = useState(savedShowIcons);
  const [exportOpen, setExportOpen] = useState(false);
  const [currentView, setCurrentView] = useState<FavoritesView>('picker');
  const [analyticsMounted, setAnalyticsMounted] = useState(false);
  // Always the default order for users. `?sortdebug=1` lets a preview change it.
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
    const timer = window.setTimeout(prewarmPickerSprites, 350);
    return () => window.clearTimeout(timer);
  }, []);

  function open(type: TypeAxisId, gen: GenAxisId, keyboard = false) {
    const kind = kindFor(type, gen);
    if (kind === 'disabled' || kind === 'null') return;
    setCurrentView('picker');
    setSel({ type, gen, keyboard });
  }

  // Desktop shows the picker inside the grid, next to its cell. Mobile shows
  // it as a bottom sheet.
  const picker = sel ? (
    <PickerSheet
      autoFocus={sel.keyboard}
      type={sel.type}
      gen={sel.gen}
      fills={fills}
      currentId={fills[cellKey(sel.type, sel.gen)]}
      showIcons={showIcons}
      sortOrder={sortOrder}
      onToggleIcons={() => setShowIcons((value) => !value)}
      onClose={() => {
        if (sel.keyboard) requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>(`[data-testid="favorites-cell-${sel.type}-${sel.gen}"]`)?.focus({ preventScroll: true });
        });
        setSel(null);
      }}
      onPlace={(id) => place(sel.type, sel.gen, id)}
      onApplyPack={(path: PackMove[]) => {
        if (typeof sel.gen === 'number') applyPack(sel.gen, path);
      }}
      onClear={() => clear(sel.type, sel.gen)}
    />
  ) : null;

  return (
    <>
      <div inert={exportOpen} className="flex min-h-dvh flex-col bg-background text-foreground">
        <GlobalHeader />
        <FavoritesHeader fills={fills} currentView={currentView} exportOpen={exportOpen}
          onViewChange={(view) => {
            setSel(null);
            if (view === 'analytics') setAnalyticsMounted(true);
            setCurrentView(view);
          }}
          onExport={() => { setSel(null); setExportOpen(true); }} />
        {/* The grid frame fills the screen below both headers. The grid
            scrolls inside it, and the footer stays below the fold. On
            desktop the frame runs to the screen edge, as the grid did when
            the page scrolled. */}
        <div id="favorites-panel-picker" role="tabpanel" aria-labelledby="favorites-tab-picker"
          hidden={currentView !== 'picker'} className={currentView === 'picker' ? 'flex h-[calc(100dvh-2*2.75rem)] shrink-0 flex-col' : 'hidden'}>
          <FavoritesTypeRepairNotice fills={fills} onReview={open} />
          <div className="flex min-h-0 flex-1">
            <main className={desktop ? 'h-full min-h-0 min-w-0 flex-1 px-2 pt-2' : 'h-full min-h-0 min-w-0 flex-1 p-1'}>
              <FavoritesGrid
                fills={fills}
                resolve={getPickerMon}
                selected={sel}
                onSelect={open}
                desktop={desktop}
                pane={desktop ? picker : null}
              />
            </main>
            {SORT_DEBUG_ENABLED ? <SortDebugPanel desktop={desktop} order={sortOrder} onChange={setSortOrder} /> : null}
          </div>
        </div>
        <main id="favorites-panel-analytics" role="tabpanel" aria-labelledby="favorites-tab-analytics"
          hidden={currentView !== 'analytics'} className={currentView === 'analytics' ? 'h-[calc(100dvh-2*2.75rem)] shrink-0 min-h-0' : 'hidden'}>
          {analyticsMounted && <Suspense fallback={<div role="status" aria-label={t('nav.analytics')} className="m-4 h-32 animate-pulse rounded-lg bg-muted" />}>
            <FavoritesAnalyticsDashboard fills={fills} />
          </Suspense>}
        </main>
        {desktop ? null : picker}
        <PageFooter faq="favorites" compact />
      </div>
      {exportOpen && <Suspense fallback={null}>
        <FavoritesExportOverlay fills={fills} onClose={() => setExportOpen(false)}
          onReview={(type, gen) => { setExportOpen(false); open(type, gen); }} />
      </Suspense>}
    </>
  );
}
