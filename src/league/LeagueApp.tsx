import { lazy, Suspense, useEffect, useRef } from 'react';
import { reloadIfStale } from '@/lib/staleDeploy';
import { whenIdle } from '@/lib/whenIdle';
import { Pencil, PanelRightClose } from 'lucide-react';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { PokemonBrowser } from '@/components/browser/PokemonBrowser';
import { PokemonNameText } from '@/components/shared/PokemonNameText';
import { BrowserStoreContext } from '@/components/browser/browserStore';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useLeagueBeacon } from './hooks/useLeagueBeacon';
import { useLeagueFunnelNudges } from './hooks/useLeagueFunnelNudges';
import { useFullLeagueConfetti } from './hooks/useFullLeagueConfetti';
import { getPokemonById, leaguePokemonDataSource } from '@/league/data/catalog';
import { pokemonLabel, raw, useDocumentLocale, useNamesVersion, useT } from '@/i18n';
import { splitTemplate } from '@/lib/richTemplate';
import { cn } from '@/lib/utils';
import { slotLabel } from './slotLabel';
import { useLeagueBrowserStore } from './store/browserBridge';
import { useLeagueStore } from './store/useLeagueStore';
import { useLeagueUi } from './store/useLeagueUi';
import { LeagueHome } from './components/LeagueHome';
import { GymConnector } from './components/GymConnector';
import { cardShades } from './theme';
import { CardActions, CardIdentity, CardPage } from './components/CardPage';
import { PageFooter } from '@/components/shared/PageFooter';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { HEADER_FIELD_H, LeagueExportButton, LeagueViewToggle } from './components/HeaderActions';
import { LeagueFunnelNudge } from './components/LeagueFunnelNudge';
import { usePencilRoom } from './components/usePencilRoom';
import { confirmOnEnter } from './components/confirmOnEnter';
import { ScreenSpinner } from '@/components/shared/PokeBallSpinner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const importExportOverlay = () => reloadIfStale(import('./components/LeagueExportOverlay'));
const LeagueExportOverlay = lazy(() => importExportOverlay().then((m) => ({ default: m.LeagueExportOverlay })));

/**
 * The league builder's shell. Mobile: league home ⇄ full-screen card, with
 * the selection pane as a bottom sheet. Desktop (md+): real panes with the
 * seam showing — league left, card right, and the selection pane as a third
 * pane from the right — each centring a phone-width column.
 */

function GlobalHeader() {
  return (
    <header className="flex h-11 items-center justify-between border-b bg-card px-3 sm:px-6">
      <a href="/" lang="en" data-testid="wordmark" className="text-2xl font-extrabold tracking-tight">
        <span className="text-primary">my151</span>
        <span className="text-foreground">.app</span>
      </a>
      {/* No gap under 360px, as the hub sets it: a longer Tools label, such
          as Spanish "Herramientas", otherwise pushes the menu past a 320px
          screen and the page scrolls sideways. */}
      <div className="flex flex-shrink-0 items-center gap-0 min-[360px]:gap-1">
        <LanguagePicker />
        <FeedbackButton />
        <ToolsMenu current="league" />
      </div>
    </header>
  );
}

/*
 * The tool's name comes in three pieces (`league.tool.*`), so the eyebrow can
 * hide the least essential ones from sight where the bar is narrow while the
 * DOM keeps the whole phrase: the tail goes below `sm`, the middle below
 * 380px, and both go in the narrow desktop pane (143px). Measured in English:
 * the full name is 200px at 11px, "Custom Gym Leader & Trainer Card" 180px,
 * "Custom Gym Leader" 100px. No ellipsis, no clipped glyphs. The title
 * attribute keeps the whole name reachable.
 */

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
  const t = useT();
  const toolHead = t('league.tool.head');
  const toolMid = t('league.tool.mid');
  const toolTail = t('league.tool.tail');
  const placeholder = t('league.name.placeholder');
  return (
    <div ref={blockRef} className="flex min-w-0 flex-1 flex-col justify-center gap-[0.0625rem]">
      <Heading
        className="overflow-hidden whitespace-nowrap text-[0.6875rem] font-semibold leading-none text-muted-foreground"
        title={toolHead + toolMid + toolTail}
      >
        {toolHead}
        <span className={cn('inline-block whitespace-pre leading-none max-[380px]:sr-only', narrow && 'sr-only')}>{toolMid}</span>
        <span className={cn('inline-block whitespace-pre leading-none max-sm:sr-only', narrow && 'sr-only')}>{toolTail}</span>
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
            {name || placeholder}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            aria-label={t('league.name.label')}
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

/**
 * Desktop pane content widths. Both columns grow with the pane — about two
 * thirds of it, a shade past the middle half — instead of the old fixed 26rem,
 * which read as a narrow island once a pane was wide. Capped so an ultra-wide
 * pane does not inflate the card, floored so a three-pane layout keeps a usable
 * width, and never wider than the pane itself. The dex builder sizes its grid
 * the same way.
 */
const PANE_CONTENT = 'w-[min(100%,88%)]';
/**
 * With no card open the league owns the whole width, so it centres a larger
 * column than it does when it shares the row with a card.
 */
const LEAGUE_SOLO_CONTENT = 'w-[min(100%,clamp(24rem,48%,44rem))]';

export function LeagueApp() {
  // The sheet heading names a Pokémon, and `pokemonLabel` reads the name
  // store without subscribing to it.
  useNamesVersion();
  useDocumentLocale();
  const t = useT();
  useLeagueBeacon();
  useLeagueFunnelNudges();
  useFullLeagueConfetti();
  useJsErrorCounter();
  useEffect(() => {
    sendEventBeacon('league-open', { once: true });
  }, []);
  // The export screen loads on its own, so its code and stylesheet stay out of
  // the first load (about 42 KiB); it is fetched once the builder is idle, so
  // the first Export opens as fast as before.
  useEffect(() => {
    whenIdle(() => { void importExportOverlay().catch(() => {}); });
  }, []);
  const openCard = useLeagueUi((s) => s.openCard);
  const shownCard = useLeagueUi((s) => s.openCard ?? s.lastCard);
  const browserPurpose = useLeagueUi((s) => s.browserPurpose);
  const replacingId = useLeagueUi((s) => s.replacingId);
  const browserOpen = useLeagueUi((s) => s.browserOpen);
  const exportOpen = useLeagueUi((s) => s.exportOpen);
  const closeBrowser = useLeagueUi((s) => s.closeBrowser);
  const closeCardPage = useLeagueUi((s) => s.closeCardPage);
  // The open gym's own type colour tints the connector ribbon. Read reactively
  // so retyping the gym recolours the ribbon; grey until a type is chosen.
  const openCardType = useLeagueStore((s) => (openCard !== null ? s.cards[openCard]?.type ?? null : null));
  // The ribbon carries the gym's own type colour (the hue), and the connector
  // draws it translucent at `BASE_TINT` so it composites to the row's `base`
  // colour over white. So the selected row flows out into the ribbon with no
  // seam, but the ribbon stays a tint of the type rather than a flat fill.
  // `cardShades(null)` gives the neutral hue a typeless row uses.
  const connectorColor = cardShades(openCardType).type;
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
    browserPurpose === 'legend' ? t('league.target.legend')
    : browserPurpose === 'signature' ? t('league.target.ace')
    : browserPurpose === 'partner' ? t('league.target.partner')
    : slotLabel(openCard ?? 0);
  const replacingName = replacing ? pokemonLabel(replacing.id, replacing.name).full : '';
  // One sentence with the subject in red, so each language puts the subject
  // where its own word order wants it.
  const sheetHeading = replacing
    ? {
        parts: splitTemplate(raw('league.sheet.replacing')),
        subject: replacingName,
        plain: t('league.sheet.replacingPlain', { name: replacingName }),
      }
    : {
        parts: splitTemplate(raw('league.sheet.adding')),
        subject: target,
        plain: t('league.sheet.addingPlain', { target }),
      };

  const browser = (
    <BrowserStoreContext.Provider value={useLeagueBrowserStore}>
      {/* The pane header on desktop says what the sheet title says on a
          phone: the slot being filled, not the card it is on. */}
      <PokemonBrowser pickMode="instant" labelForSection={() => target} dataSource={leaguePokemonDataSource} />
    </BrowserStoreContext.Provider>
  );

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col bg-background">
        <GlobalHeader />

        {/* ------- mobile: two panes on one track, the camera pans ------- */}
        {!isDesktop && (
        <main className="min-h-0 flex-1 overflow-hidden md:hidden">
        <ErrorBoundary where="league">
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
        </ErrorBoundary>
        </main>
        )}

        {/* ---------------- desktop: league | card | picker ---------------- */}
        {isDesktop && (
        <main className="hidden min-h-0 flex-1 flex-col overflow-y-auto md:flex">
        <ErrorBoundary where="league-desktop">
          <div className="relative flex h-full min-h-0 shrink-0">
            {/* The sankey ribbon linking the open gym's row to its card, in the
                gutter between the two panes. Mounted only with a card open. */}
            {openCard !== null && <GymConnector openCard={openCard} color={connectorColor} />}
            {/* League pane. It owns the whole width until a gym opens, then
                gives half (a third once the picker joins) to the card. */}
            <section className={cn('flex min-w-0 flex-col border-r', openCard === null ? 'flex-1' : browserOpen ? 'w-1/3' : 'w-1/2')}>
              <div data-testid="league-tool-bar" className="flex h-11 items-center border-b px-4">
                <div className={cn('mx-auto flex w-full items-center', openCard === null ? LEAGUE_SOLO_CONTENT : PANE_CONTENT)}>
                  <LeagueNameRow h1 narrow={browserOpen} />
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    <LeagueViewToggle />
                    <LeagueExportButton />
                  </span>
                </div>
              </div>
              <div data-lg-viewport className="min-h-0 flex-1 overflow-y-auto py-3">
                <div className={cn('mx-auto px-3', openCard === null ? LEAGUE_SOLO_CONTENT : PANE_CONTENT)}>
                  <LeagueHome />
                </div>
              </div>
            </section>

            {/* Card pane — mounted only once a gym is open, so a new visitor
                lands on the league alone. A collapse control folds it back to
                the league, the way the Pokémon browser's pane collapses. */}
            {openCard !== null && (
              // `relative z-20` lifts the gym card above the connector so the
              // ribbon tucks under its rounded corners, while the league pane
              // stays under the connector so the ribbon can reach its row.
              <section className={cn('relative z-20 flex min-w-0 flex-col', browserOpen ? 'w-1/3 border-r' : 'w-1/2')}>
                {/* The pane's header is the card's own identity, in the same
                    bar the league pane gives its identity. */}
                <div data-testid="league-tool-bar" className="flex h-11 items-center gap-2 border-b px-4">
                  <button
                    type="button"
                    onClick={closeCardPage}
                    aria-label={t('league.card.collapse')}
                    className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <PanelRightClose size={18} />
                  </button>
                  <div className={cn('mx-auto flex w-full items-center gap-2', PANE_CONTENT)}>
                    <CardIdentity cardIndex={openCard} showBack={false} />
                    <CardActions cardIndex={openCard} />
                  </div>
                </div>
                <div data-lg-viewport className="min-h-0 flex-1 overflow-y-auto py-1">
                  <div className={cn('mx-auto', PANE_CONTENT)}>
                    <CardPage cardIndex={openCard} showBack={false} withBar={false} />
                  </div>
                </div>
              </section>
            )}

            {browserOpen && (
              <section className="flex w-1/3 min-w-0 flex-col">{browser}</section>
            )}
          </div>

          {/* One footer for the whole page, below the fold. The panes row
              above takes the whole viewport (`h-full`), and this container
              scrolls to reveal the footer under it. That hands every pixel of
              height to the panes, so `useFitScale` grows the cards and their
              sprites, and the footer holds still as the card pane opens and
              closes — the two per-pane footers used to scroll with their own
              panes. */}
          <div className="shrink-0 border-t bg-background">
            <PageFooter faq="league" compact />
          </div>
        </ErrorBoundary>
        </main>
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
                {sheetHeading.parts.map((part, i) =>
                  part.kind === 'slot' ? (
                    <span key={i} className="text-primary"><PokemonNameText name={sheetHeading.subject} /></span>
                  ) : (
                    <span key={i} className="text-foreground">{part.text}</span>
                  ),
                )}
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
        {exportOpen && <ErrorBoundary where="league-export"><Suspense fallback={<ScreenSpinner />}><LeagueExportOverlay /></Suspense></ErrorBoundary>}
        <LeagueFunnelNudge />
      </div>
    </TooltipProvider>
  );
}
