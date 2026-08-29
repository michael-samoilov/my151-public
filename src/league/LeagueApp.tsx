import { useEffect } from 'react';
import { Info } from 'lucide-react';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { BrowserStoreContext } from '@/components/browser/browserStore';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { cn } from '@/lib/utils';
import { slotLabel } from './model/constants';
import {
  labelForLeagueSection,
  useLeagueBrowserStore,
} from './store/browserBridge';
import { useLeagueStore } from './store/useLeagueStore';
import { useLeagueUi } from './store/useLeagueUi';
import { LeagueHome } from './components/LeagueHome';
import { CardPage } from './components/CardPage';

/**
 * The league builder's shell. Mobile: league home ⇄ full-screen card, with
 * the selection pane as a bottom sheet. Desktop (md+): real panes with the
 * seam showing — league left, card right, and the selection pane as a third
 * pane from the right — each centring a phone-width column.
 */

function GlobalHeader() {
  return (
    <header className="flex items-center justify-between border-b bg-card px-3 py-2 sm:px-6">
      <a href="/pokemon-league-builder" className="text-2xl font-extrabold tracking-tight">
        <span className="text-primary">my151</span>
        <span className="text-foreground">.app</span>
      </a>
      <div className="flex flex-shrink-0 items-center gap-1">
        <LanguagePicker />
        <ToolsMenu current="league" />
      </div>
    </header>
  );
}

/**
 * The tool bar's identity: the tool's name until the user names their
 * league, then the name. The name is the input itself — its placeholder
 * shows the tool name — and an sr-only h1 keeps the heading in the
 * hydrated DOM (the static shell carries the crawlable one).
 */
function LeagueNameRow({ h1 }: { h1: boolean }) {
  const name = useLeagueStore((s) => s.name);
  const setName = useLeagueStore((s) => s.setName);
  return (
    <div className="flex min-w-0 flex-1 items-center">
      {h1 && <h1 className="sr-only">Pokémon League Builder</h1>}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pokémon League Builder"
        aria-label="League name"
        // Small on purpose; the league entry caps maximum-scale on iOS so
        // focusing a sub-16px input no longer zooms the page.
        className="min-w-0 flex-1 bg-transparent text-[0.9375rem] font-bold leading-none outline-none placeholder:font-bold placeholder:text-foreground/80"
      />
    </div>
  );
}

export function LeagueApp() {
  const openCard = useLeagueUi((s) => s.openCard);
  const browserOpen = useLeagueUi((s) => s.browserOpen);
  const closeBrowser = useLeagueUi((s) => s.closeBrowser);
  const isDesktop = useIsDesktop();

  // Keep the browser's pseudo-section mirror current while the pane is open:
  // grid-side mutations (a removal, a drag) must reflect in its pokeballs.
  useEffect(
    () =>
      useLeagueStore.subscribe(() => {
        useLeagueBrowserStore.getState().refresh();
      }),
    [],
  );

  const browser = (
    <BrowserStoreContext.Provider value={useLeagueBrowserStore}>
      <PokemonBrowser pickMode="instant" labelForSection={labelForLeagueSection} />
    </BrowserStoreContext.Provider>
  );

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col bg-background">
        <GlobalHeader />

        {/* ---------------- mobile: one column, home ⇄ card ---------------- */}
        {!isDesktop && (
        <div data-lg-viewport className="flex-1 overflow-y-auto pb-6 md:hidden">
          {openCard === null ? (
            <>
              {/* The tool bar — same 44px as the dex builder's. */}
              <div className="flex h-11 items-center gap-2 border-b bg-card px-3">
                <LeagueNameRow h1 />
                <span className="ml-auto flex items-center gap-2.5 text-muted-foreground">
                  <Info size={16} aria-hidden />
                </span>
              </div>
              <div className="mx-auto w-full max-w-[26rem] px-3 pt-2.5">
                <LeagueHome />
              </div>
            </>
          ) : (
            <div className="mx-auto w-full max-w-[26rem]">
              <CardPage cardIndex={openCard} showBack />
            </div>
          )}
        </div>
        )}

        {/* ---------------- desktop: league | card | picker ---------------- */}
        {isDesktop && (
        <div className="hidden min-h-0 flex-1 md:flex">
          <section className={cn('flex min-w-0 flex-col border-r', browserOpen ? 'w-1/3' : 'w-1/2')}>
            <div className="flex h-11 items-center border-b px-4">
              <div className="mx-auto flex w-full max-w-[26rem] items-center">
                <LeagueNameRow h1 />
                <Info size={16} className="ml-auto text-muted-foreground" aria-hidden />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-3">
              <div className="mx-auto w-full max-w-[26rem] px-3">
                <LeagueHome />
              </div>
            </div>
          </section>

          <section className={cn('flex min-w-0 flex-col', browserOpen ? 'w-1/3 border-r' : 'w-1/2')}>
            <div className="flex h-11 items-center border-b px-4">
              <div className="mx-auto w-full max-w-[26rem] text-lg font-extrabold tracking-tight">
                Pokémon Trainer Card
              </div>
            </div>
            <div data-lg-viewport className="min-h-0 flex-1 overflow-y-auto py-1">
              <div className="mx-auto w-full max-w-[26rem]">
                <CardPage cardIndex={openCard ?? 0} showBack={false} />
              </div>
            </div>
          </section>

          {browserOpen && (
            <section className="flex w-1/3 min-w-0 flex-col">{browser}</section>
          )}
        </div>
        )}

        {/* Mobile selection sheet (BottomSheet is md:hidden by design). */}
        {browserOpen && !isDesktop && (
          <BottomSheet
            onClose={closeBrowser}
            size="full"
            topGap={49}
            closeLabel={`Adding to ${slotLabel(openCard ?? 0)}`}
            title={
              <>
                <span className="text-foreground">Adding to: </span>
                <span className="text-primary">{slotLabel(openCard ?? 0)}</span>
              </>
            }
          >
            {browser}
          </BottomSheet>
        )}
      </div>
    </TooltipProvider>
  );
}
