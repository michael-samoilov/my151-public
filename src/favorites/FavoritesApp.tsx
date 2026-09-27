import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { PageFooter } from '@/components/shared/PageFooter';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useT } from '@/i18n';
import { cellKey, type GenAxisId, type TypeAxisId } from './model/cells';
import { getPickerMon } from './model/catalog';
import { prewarmPickerSprites } from './model/spritePreload';
import { kindFor } from './model/eligibility';
import { useFavoritesStore } from './store/useFavoritesStore';
import { FavoritesGrid } from './components/FavoritesGrid';
import { PickerSheet, type PickerAnchor } from './components/PickerSheet';
import { SettingsPane } from './components/SettingsPane';
import type { PackMove } from './model/packing';

const TOOL_NAME = 'Favorite Pokémon Picker by Type and Generation';
const TYPES_STORAGE_KEY = 'personal-151-favorites-show-types-v1';
const NO_REPEATS_STORAGE_KEY = 'personal-151-favorites-no-repeats-v1';

type Selection = { type: TypeAxisId; gen: GenAxisId; anchor: PickerAnchor | null };

function savedShowTypes(): boolean {
  try { return window.localStorage.getItem(TYPES_STORAGE_KEY) === '1'; }
  catch { return false; }
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
  const desktop = useIsDesktop();
  const fills = useFavoritesStore((s) => s.fills);
  const place = useFavoritesStore((s) => s.place);
  const applyPack = useFavoritesStore((s) => s.applyPack);
  const clear = useFavoritesStore((s) => s.clear);
  const mainRef = useRef<HTMLElement>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [showTypes, setShowTypes] = useState(savedShowTypes);
  const [noRepeats, setNoRepeats] = useState(savedNoRepeats);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = useT();

  useEffect(() => {
    try { window.localStorage.setItem(TYPES_STORAGE_KEY, showTypes ? '1' : '0'); }
    catch { /* Storage can be unavailable in private browsing. */ }
  }, [showTypes]);

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
    const cell = mainRef.current?.querySelector<HTMLElement>(`[data-testid="favorites-cell-${type}-${gen}"]`);
    const scroller = mainRef.current?.querySelector<HTMLElement>('[data-testid="favorites-grid-scroll"]');
    const table = scroller?.parentElement;
    setSel({ type, gen, anchor: cell && scroller && table ? { cell, table, scroller } : null });
  }

  const settingsPane = (
    <SettingsPane
      desktop={desktop}
      noRepeats={noRepeats}
      onToggleNoRepeats={() => setNoRepeats((value) => !value)}
      onClose={() => setSettingsOpen(false)}
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <GlobalHeader />
        <div className="flex h-11 items-center gap-1 border-b bg-card px-3">
          <h1 className="min-w-0 overflow-hidden whitespace-nowrap text-[0.6875rem] font-semibold leading-none text-muted-foreground" title={TOOL_NAME}>
            {TOOL_NAME}
          </h1>
          <button
            type="button"
            data-testid="favorites-settings-open"
            aria-label={t('favorites.settings.open')}
            aria-expanded={settingsOpen}
            onClick={() => {
              setSel(null);
              setSettingsOpen((open) => !open);
            }}
            className="ml-auto shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
        {/* The grid frame fills the screen below both headers. The grid
            scrolls inside it, and the footer stays below the fold. On
            desktop the frame runs to the screen edge, as the grid did when
            the page scrolled. */}
        <div className="flex h-[calc(100dvh-2*2.75rem)] shrink-0">
          <main ref={mainRef} className={desktop ? 'h-full min-h-0 min-w-0 flex-1 px-2 pt-2' : 'h-full min-h-0 min-w-0 flex-1 p-1'}>
            <FavoritesGrid
              fills={fills}
              resolve={getPickerMon}
              selected={sel}
              onSelect={open}
              desktop={desktop}
            />
          </main>
          {desktop && sel ? (
            <PickerSheet
              type={sel.type}
              gen={sel.gen}
              fills={fills}
              currentId={fills[cellKey(sel.type, sel.gen)]}
              anchor={sel.anchor}
              showTypes={showTypes}
              onToggleTypes={() => setShowTypes((value) => !value)}
              onClose={() => setSel(null)}
              onPlace={(id) => place(sel.type, sel.gen, id, noRepeats)}
              onApplyPack={(path: PackMove[]) => {
                if (typeof sel.gen === 'number') applyPack(sel.gen, path);
              }}
              onClear={() => clear(sel.type, sel.gen)}
            />
          ) : null}
          {settingsOpen && desktop ? settingsPane : null}
        </div>
        {settingsOpen && !desktop ? settingsPane : null}
        {!desktop && sel ? (
          <PickerSheet
            type={sel.type}
            gen={sel.gen}
            fills={fills}
            currentId={fills[cellKey(sel.type, sel.gen)]}
            anchor={sel.anchor}
            showTypes={showTypes}
            onToggleTypes={() => setShowTypes((value) => !value)}
            onClose={() => setSel(null)}
            onPlace={(id) => place(sel.type, sel.gen, id, noRepeats)}
            onApplyPack={(path: PackMove[]) => {
              if (typeof sel.gen === 'number') applyPack(sel.gen, path);
            }}
            onClear={() => clear(sel.type, sel.gen)}
          />
        ) : null}
        <PageFooter faq="favorites" compact />
      </div>
      <FeedbackHost route="/favorite-pokemon-by-type" />
    </TooltipProvider>
  );
}
