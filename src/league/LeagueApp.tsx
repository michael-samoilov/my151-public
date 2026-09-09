import { useEffect, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { BrowserStoreContext } from '@/components/browser/browserStore';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useLeagueBeacon } from './hooks/useLeagueBeacon';
import { getPokemonById } from '@/hooks/usePokemonData';
import { pokemonLabel, useNamesVersion } from '@/i18n';
import { cn } from '@/lib/utils';
import { slotLabel } from './model/constants';
import { useLeagueBrowserStore } from './store/browserBridge';
import { useLeagueStore } from './store/useLeagueStore';
import { useLeagueUi } from './store/useLeagueUi';
import { LeagueHome } from './components/LeagueHome';
import { CardActions, CardIdentity, CardPage } from './components/CardPage';
import { PageFooter } from '@/components/shared/PageFooter';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { HEADER_FIELD_H, LeagueExportButton, LeagueViewToggle } from './components/HeaderActions';
import { usePencilRoom } from './components/usePencilRoom';
import { confirmOnEnter } from './components/confirmOnEnter';

/**
 * The league builder's shell. Mobile: league home ⇄ full-screen card, with
 * the selection pane as a bottom sheet. Desktop (md+): real panes with the
 * seam showing — league left, card right, and the selection pane as a third
 * pane from the right — each centring a phone-width column.
 */

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
const TOOL_NAME = 'Custom Gym Leader & Trainer Card Maker';
// The name in three pieces, so the eyebrow can hide the least essential ones
// from sight where the bar is narrow while the DOM keeps the whole phrase:
// " Maker" goes below `sm`, " & Trainer Card" goes below 380px, and both go
// in the narrow desktop pane (143px). Measured: the full name is 200px at
// 11px, "Custom Gym Leader & Trainer Card" 180px, "Custom Gym Leader"
// 100px. No ellipsis, no clipped glyphs.
const TOOL_NAME_HEAD = 'Custom Gym Leader';
const TOOL_NAME_MID = ' & Trainer Card';
const TOOL_NAME_TAIL = ' Maker';
/**
 * One string, whatever the width. A narrow desktop pane once swapped in a
 * two-word name, but Google crawls mobile-first and reads whichever string is
 * in the DOM, so the full name stays and `truncate` clips it; the title
 * attribute keeps the whole name reachable.
 */
const LEAGUE_NAME_PLACEHOLDER = 'Name your league';

/**
 * The tool bar's identity, in two lines: the tool's name, and the league's.
 *
 * These used to be one line — the tool name *was* the input's placeholder, so
 * typing appeared to rename the page. Splitting them says which is which: the
 * heading names the page and never changes (it is also the crawlable h1), and
 * the field under it is the user's, bold and black once they use it.
 */
function LeagueNameRow({ h1, narrow = false }: { h1: boolean; narrow?: boolean }) {
  const name = useLeagueStore((s) => s.name);
  const setName = useLeagueStore((s) => s.setName);
  const Heading = h1 ? 'h1' : 'span';
  const blockRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const pencilRoom = usePencilRoom(blockRef, ghostRef, name);
  return (
    <div ref={blockRef} className="flex min-w-0 flex-1 flex-col justify-center gap-[0.0625rem]">
      <Heading
        className="overflow-hidden whitespace-nowrap text-[0.6875rem] font-semibold leading-none text-muted-foreground"
        title={TOOL_NAME}
      >
        {TOOL_NAME_HEAD}
        <span className={cn('inline-block whitespace-pre leading-none max-[380px]:sr-only', narrow && 'sr-only')}>{TOOL_NAME_MID}</span>
        <span className={cn('inline-block whitespace-pre leading-none max-sm:sr-only', narrow && 'sr-only')}>{TOOL_NAME_TAIL}</span>
      </Heading>
      {/* The field is sized to its own text by an invisible copy stacked in
          the same grid cell, so the pencil sits at the end of the words
          rather than at the far edge of the bar. */}
      <label className="group flex min-w-0 max-w-full cursor-text items-center gap-1 overflow-hidden">
        <span
          className="grid min-w-0 items-center overflow-hidden border-b border-dashed border-foreground/25 transition-colors [grid-template-columns:minmax(0,max-content)] group-hover:border-foreground/50 group-focus-within:border-foreground/60"
          style={{ height: HEADER_FIELD_H }}
        >
          <span
            ref={ghostRef}
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
            enterKeyHint="done"
            onKeyDown={confirmOnEnter}
            // Small on purpose; the league entry caps maximum-scale on iOS so
            // focusing a sub-16px input no longer zooms the page.
            // The same weight the gym card's theme placeholder wears, so the
            // two "not filled in yet" fields read as one thing.
            // The words are clipped at the field's own box, and a clip
            // lands mid-glyph — which reads as the name running under
            // whatever sits next in the bar rather than ending. An
            // ellipsis says it ends. Browsers draw it only while the
            // field is not focused, which is the behaviour to want: once
            // you are typing you need to see the caret's end of the text,
            // not a mark saying there is more.
            //
            // Only the drawing is cut. `value` is the whole name, and the
            // store keeps it — the export renders from the store.
            className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-[0.875rem] font-bold leading-tight text-ellipsis outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
          />
        </span>
        {pencilRoom && (
          <Pencil size={11} className="shrink-0 text-primary" aria-hidden />
        )}
      </label>
    </div>
  );
}

export function LeagueApp() {
  // The sheet heading names a Pokémon, and `pokemonLabel` reads the name
  // store without subscribing to it.
  useNamesVersion();
  useLeagueBeacon();
  useJsErrorCounter();
  useEffect(() => {
    sendEventBeacon('league-open', { once: true });
  }, []);
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
  /**
   * A legendary joins the card's endgame boss row, not the card as a whole,
   * and every card has one of those rows — so the subject names the row.
   * "Adding to: Gym 1" over the legendary picker says the wrong place. The
   * ace and the partner are slots of their own on every card, and their
   * pickers name the slot for the same reason.
   */
  const target =
    browserPurpose === 'legend' ? 'Endgame Boss legendary'
    : browserPurpose === 'signature' ? 'Ace Pokémon'
    : browserPurpose === 'partner' ? 'Partner / Shouldermon'
    : slotLabel(openCard ?? 0);
  const sheetHeading = replacing
    ? {
        lead: 'Replacing:',
        subject: pokemonLabel(replacing.id, replacing.name).name,
        plain: `Replacing ${pokemonLabel(replacing.id, replacing.name).name}`,
      }
    : {
        lead: 'Adding to:',
        subject: target,
        plain: `Adding to ${target}`,
      };

  const browser = (
    <BrowserStoreContext.Provider value={useLeagueBrowserStore}>
      {/* The pane header on desktop says what the sheet title says on a
          phone: the slot being filled, not the card it is on. */}
      <PokemonBrowser pickMode="instant" labelForSection={() => target} />
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
              className="h-full w-1/2 overflow-y-auto"
            >
              {/* The tool bar — same 44px as the dex builder's. */}
              <div data-testid="league-tool-bar" className="flex h-11 items-center gap-2 border-b bg-card px-3">
                <LeagueNameRow h1 />
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <LeagueViewToggle />
                  <LeagueExportButton />
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
              <PageFooter faq="league" />
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
                <LeagueNameRow h1 narrow={browserOpen} />
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <LeagueViewToggle />
                  <LeagueExportButton />
                </span>
              </div>
            </div>
            <div data-lg-viewport className="min-h-0 flex-1 overflow-y-auto py-3">
              <div className="mx-auto w-full max-w-[26rem] px-3">
                <LeagueHome />
              </div>
              <PageFooter faq="league" />
            </div>
          </section>

          <section className={cn('flex min-w-0 flex-col', browserOpen ? 'w-1/3 border-r' : 'w-1/2')}>
            {/* The pane's header is the card's own identity, in the same bar
                the league pane gives its identity. It used to be a second
                title — "Pokémon Trainer Card", set large and bold — with the
                card's real header a row below it, so the two panes named
                themselves at different sizes and different heights. */}
            <div data-testid="league-tool-bar" className="flex h-11 items-center border-b px-4">
              <div className="mx-auto flex w-full max-w-[26rem] items-center gap-2">
                <CardIdentity cardIndex={openCard ?? 0} showBack={false} />
                <CardActions cardIndex={openCard ?? 0} />
              </div>
            </div>
            <div data-lg-viewport className="min-h-0 flex-1 overflow-y-auto py-1">
              <div className="mx-auto w-full max-w-[26rem]">
                <CardPage cardIndex={openCard ?? 0} showBack={false} withBar={false} />
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

        {/* The report form's only mount point on this entry.
            `FeedbackButton` is just a trigger: it calls `openFeedback`, and
            whichever `FeedbackHost` is mounted owns the sheet. The league
            builder boots from its own root (`src/league/main.tsx`), not from
            `App.tsx`, so it never inherited that app's host -- and every bug
            button here did nothing at all, silently, because an unregistered
            opener is a no-op rather than an error.

            Outside the two panes on purpose. Each of them is `overflow-hidden`
            and goes `inert` when the other is showing, so a sheet mounted in
            one would be clipped, or unreachable, half the time. */}
        <FeedbackHost route={openCard === null ? 'league' : 'league-card'} />
      </div>
    </TooltipProvider>
  );
}
