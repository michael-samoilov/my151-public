import { useEffect, useState } from 'react';
import { Info, Pencil } from 'lucide-react';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { BrowserStoreContext } from '@/components/browser/browserStore';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { getPokemonById } from '@/hooks/usePokemonData';
import { pokemonLabel, useNamesVersion } from '@/i18n';
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
import { PageFooter } from '@/components/shared/PageFooter';
import { LeagueSettingsButton } from './components/LeagueSettings';

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
const TOOL_NAME = 'Pokémon League Builder';
const LEAGUE_NAME_PLACEHOLDER = 'Name your league';

/**
 * The tool bar's identity, in two lines: the tool's name, and the league's.
 *
 * These used to be one line — the tool name *was* the input's placeholder, so
 * typing appeared to rename the page. Splitting them says which is which: the
 * heading names the page and never changes (it is also the crawlable h1), and
 * the field under it is the user's, bold and black once they use it.
 */
function LeagueNameRow({ h1 }: { h1: boolean }) {
  const name = useLeagueStore((s) => s.name);
  const setName = useLeagueStore((s) => s.setName);
  const Heading = h1 ? 'h1' : 'span';
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-[0.0625rem]">
      <Heading className="truncate text-[0.6875rem] font-semibold leading-none text-muted-foreground">
        {TOOL_NAME}
      </Heading>
      {/* The field is sized to its own text by an invisible copy stacked in
          the same grid cell, so the pencil sits at the end of the words
          rather than at the far edge of the bar. */}
      <label className="group flex min-w-0 max-w-full cursor-text items-center gap-1 overflow-hidden">
        <span className="grid min-w-0 items-center border-b border-dashed border-foreground/25 transition-colors group-hover:border-foreground/50 group-focus-within:border-foreground/60">
          <span
            aria-hidden
            className={cn(
              'invisible col-start-1 row-start-1 whitespace-pre text-[0.875rem] leading-tight',
              name ? 'font-bold' : 'font-normal',
            )}
          >
            {name || LEAGUE_NAME_PLACEHOLDER}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={LEAGUE_NAME_PLACEHOLDER}
            aria-label="League name"
            // Small on purpose; the league entry caps maximum-scale on iOS so
            // focusing a sub-16px input no longer zooms the page.
            className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-[0.875rem] font-bold leading-tight outline-none placeholder:font-normal placeholder:text-muted-foreground"
          />
        </span>
        <Pencil size={11} className="shrink-0 text-muted-foreground/70 group-focus-within:text-foreground/60" aria-hidden />
      </label>
    </div>
  );
}

export function LeagueApp() {
  // The sheet heading names a Pokémon, and `pokemonLabel` reads the name
  // store without subscribing to it.
  useNamesVersion();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openCard = useLeagueUi((s) => s.openCard);
  const shownCard = useLeagueUi((s) => s.openCard ?? s.lastCard);
  const browserPurpose = useLeagueUi((s) => s.browserPurpose);
  const replacingId = useLeagueUi((s) => s.replacingId);
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

  /**
   * What the selection sheet is for, in its own words. Replacing a line is
   * not adding to a slot, and saying "Adding to: Gym 1" while the user is
   * swapping Gyarados out reads as the wrong action.
   */
  const replacing = browserPurpose === 'replace' && replacingId !== null
    ? getPokemonById(replacingId)
    : undefined;
  const sheetHeading = replacing
    ? {
        lead: 'Replacing:',
        subject: pokemonLabel(replacing.id, replacing.name).name,
        plain: `Replacing ${pokemonLabel(replacing.id, replacing.name).name}`,
      }
    : {
        lead: 'Adding to:',
        subject: slotLabel(openCard ?? 0),
        plain: `Adding to ${slotLabel(openCard ?? 0)}`,
      };

  const browser = (
    <BrowserStoreContext.Provider value={useLeagueBrowserStore}>
      <PokemonBrowser pickMode="instant" labelForSection={labelForLeagueSection} />
    </BrowserStoreContext.Provider>
  );

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col bg-background">
        <GlobalHeader />

        {/* ------- mobile: two panes on one track, the camera pans ------- */}
        {!isDesktop && (
        <div className="min-h-0 flex-1 overflow-hidden md:hidden">
          <div
            className="p151-pane-track flex h-full w-[200%]"
            style={{ transform: `translate3d(${openCard === null ? '0' : '-50%'}, 0, 0)` }}
          >
            <div
              data-lg-viewport
              // Both panes stay mounted so the card is measured and fitted
              // before it arrives. `inert` keeps the one off screen out of
              // the tab order and off the screen reader.
              inert={openCard !== null}
              // pb-2, the dex builder view page's buffer: small enough that
              // the footer still sits flush under the fold, big enough to
              // absorb the fit's sub-pixel rounding. The card pane next door
              // does without it. Its hints wrap where the summary's truncate,
              // so its fitted height steps by a whole line rather than
              // sliding, and 8px there costs a step and leaves a visible gap
              // above the footer instead of a buffer.
              className="h-full w-1/2 overflow-y-auto pb-2"
            >
              {/* The tool bar — same 44px as the dex builder's. */}
              <div data-testid="league-tool-bar" className="flex h-11 items-center gap-2 border-b bg-card px-3">
                <LeagueNameRow h1 />
                <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
                  <Info size={16} aria-hidden />
                  <LeagueSettingsButton open={settingsOpen} onOpenChange={setSettingsOpen} />
                </span>
              </div>
              <div className="mx-auto w-full max-w-[26rem] px-3 pt-2.5">
                <LeagueHome />
              </div>
              {/* Below the fold by construction. `useFitScale` measures from
                  the fitted block's top to the bottom of this pane, so the
                  block takes the whole viewport and the footer starts exactly
                  where it ends — the same placement the dex builder's panes
                  use, one footer per scrolling pane. */}
              <PageFooter />
            </div>
            <div
              data-lg-viewport
              inert={openCard === null}
              className="h-full w-1/2 overflow-y-auto"
            >
              <div className="mx-auto w-full max-w-[26rem]">
                <CardPage cardIndex={shownCard} showBack />
              </div>
              <PageFooter />
            </div>
          </div>
        </div>
        )}

        {/* ---------------- desktop: league | card | picker ---------------- */}
        {isDesktop && (
        <div className="hidden min-h-0 flex-1 md:flex">
          <section className={cn('flex min-w-0 flex-col border-r', browserOpen ? 'w-1/3' : 'w-1/2')}>
            <div data-testid="league-tool-bar" className="flex h-11 items-center border-b px-4">
              <div className="mx-auto flex w-full max-w-[26rem] items-center">
                <LeagueNameRow h1 />
                <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
                  <Info size={16} aria-hidden />
                  <LeagueSettingsButton open={settingsOpen} onOpenChange={setSettingsOpen} />
                </span>
              </div>
            </div>
            <div data-lg-viewport className="min-h-0 flex-1 overflow-y-auto py-3">
              <div className="mx-auto w-full max-w-[26rem] px-3">
                <LeagueHome />
              </div>
              <PageFooter />
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
              <PageFooter />
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
            closeLabel={sheetHeading.plain}
            title={
              <>
                <span className="text-foreground">{sheetHeading.lead} </span>
                <span className="text-primary">{sheetHeading.subject}</span>
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
