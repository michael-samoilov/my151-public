import { lazy, Suspense, useEffect, useState } from 'react';
import { Download, Settings } from 'lucide-react';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { PageFooter } from '@/components/shared/PageFooter';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useDocumentLocale, useT } from '@/i18n';
import { cellKey, type GenAxisId, type TypeAxisId } from './model/cells';
import { getPickerMon } from './model/catalog';
import { prewarmPickerSprites } from './model/spritePreload';
import { kindFor } from './model/eligibility';
import { useFavoritesStore } from './store/useFavoritesStore';
import { FavoritesGrid } from './components/FavoritesGrid';
import { FavoritesCompletionCounter } from './components/FavoritesCompletionCounter';
import { PickerSheet } from './components/PickerSheet';
import { SettingsPane } from './components/SettingsPane';
import { SortDebugPanel } from './components/SortDebugPanel';
import { initialSortOrder, SORT_DEBUG_ENABLED } from './model/sortDebug';
import type { PackMove } from './model/packing';

const ICONS_STORAGE_KEY = 'personal-151-favorites-show-icons-v1';
const NO_REPEATS_STORAGE_KEY = 'personal-151-favorites-no-repeats-v1';
const FavoritesExportOverlay = lazy(() => import('./components/FavoritesExportOverlay'));

type Selection = { type: TypeAxisId; gen: GenAxisId };

function savedShowIcons(): boolean {
  try { return window.localStorage.getItem(ICONS_STORAGE_KEY) !== '0'; }
  catch { return true; }
}

/** On unless the viewer turned it off. */
function savedNoRepeats(): boolean {
  try { return window.localStorage.getItem(NO_REPEATS_STORAGE_KEY) !== '0'; }
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
  useJsErrorCounter();
  useDocumentLocale();
  const desktop = useIsDesktop();
  const fills = useFavoritesStore((s) => s.fills);
  const place = useFavoritesStore((s) => s.place);
  const applyPack = useFavoritesStore((s) => s.applyPack);
  const clear = useFavoritesStore((s) => s.clear);
  const [sel, setSel] = useState<Selection | null>(null);
  const [showIcons, setShowIcons] = useState(savedShowIcons);
  const [noRepeats, setNoRepeats] = useState(savedNoRepeats);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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
    try { window.localStorage.setItem(NO_REPEATS_STORAGE_KEY, noRepeats ? '1' : '0'); }
    catch { /* Storage can be unavailable in private browsing. */ }
  }, [noRepeats]);

  useEffect(() => {
    sendEventBeacon('favorites-open', { once: true });
    const timer = window.setTimeout(prewarmPickerSprites, 350);
    return () => window.clearTimeout(timer);
  }, []);

  function open(type: TypeAxisId, gen: GenAxisId) {
    const kind = kindFor(type, gen);
    if (kind === 'disabled' || kind === 'null') return;
    setSel({ type, gen });
  }

  const settingsPane = (
    <SettingsPane
      desktop={desktop}
      noRepeats={noRepeats}
      onToggleNoRepeats={() => setNoRepeats((value) => !value)}
      onClose={() => setSettingsOpen(false)}
    />
  );

  // Desktop shows the picker inside the grid, next to its cell. Mobile shows
  // it as a bottom sheet.
  const picker = sel ? (
    <PickerSheet
      type={sel.type}
      gen={sel.gen}
      fills={fills}
      currentId={fills[cellKey(sel.type, sel.gen)]}
      showIcons={showIcons}
      sortOrder={sortOrder}
      onToggleIcons={() => setShowIcons((value) => !value)}
      onClose={() => setSel(null)}
      onPlace={(id) => place(sel.type, sel.gen, id, noRepeats)}
      onApplyPack={(path: PackMove[]) => {
        if (typeof sel.gen === 'number') applyPack(sel.gen, path);
      }}
      onClear={() => clear(sel.type, sel.gen)}
    />
  ) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div inert={exportOpen} className="flex min-h-dvh flex-col bg-background text-foreground">
        <GlobalHeader />
        <div className="flex h-11 items-center gap-1 border-b bg-card px-3">
          <div className="flex min-w-0 flex-col justify-center gap-[0.0625rem]">
            <h1 className="min-w-0 text-[0.6875rem] font-semibold leading-none text-muted-foreground" title={t('favorites.title')}>
              {t('favorites.title')}
            </h1>
            <FavoritesCompletionCounter
              fills={fills}
              label={(filled, total) => t('favorites.completion.label', { filled, total })}
            />
          </div>
          <button
            type="button"
            data-testid="favorites-export-open"
            aria-label={t('favorites.export.title')}
            aria-expanded={exportOpen}
            onClick={() => { setSel(null); setSettingsOpen(false); setExportOpen(true); }}
            className="ml-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t('favorites.export.title')}</span>
          </button>
          <button
            type="button"
            data-testid="favorites-settings-open"
            aria-label={t('favorites.settings.open')}
            aria-expanded={settingsOpen}
            onClick={() => {
              setSel(null);
              setSettingsOpen((open) => !open);
            }}
            className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
        {/* The grid frame fills the screen below both headers. The grid
            scrolls inside it, and the footer stays below the fold. On
            desktop the frame runs to the screen edge, as the grid did when
            the page scrolled. */}
        <div className="flex h-[calc(100dvh-2*2.75rem)] shrink-0">
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
          {settingsOpen && desktop ? settingsPane : null}
          {SORT_DEBUG_ENABLED ? <SortDebugPanel desktop={desktop} order={sortOrder} onChange={setSortOrder} /> : null}
        </div>
        {settingsOpen && !desktop ? settingsPane : null}
        {desktop ? null : picker}
        <PageFooter faq="favorites" compact />
      </div>
      <FeedbackHost route="/favorite-pokemon-by-type" />
      {exportOpen && <Suspense fallback={null}>
        <FavoritesExportOverlay fills={fills} onClose={() => setExportOpen(false)} />
      </Suspense>}
    </TooltipProvider>
  );
}
