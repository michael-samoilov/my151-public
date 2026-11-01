import { lazy, Suspense, useEffect, useRef } from 'react';
import { loadChunk } from '@/lib/staleDeploy';
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
import { MAIN_ID, SkipLink } from '@/components/shared/SkipLink';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { HEADER_FIELD_H, LeagueExportButton, LeagueViewToggle } from './components/HeaderActions';
import { LeagueTipSlot } from './components/LeagueFunnelNudge';
import { usePencilRoom } from './components/usePencilRoom';
import { confirmOnEnter } from './components/confirmOnEnter';
import { ScreenSpinner } from '@/components/shared/PokeBallSpinner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const importExportOverlay = () => loadChunk(() => import('./components/LeagueExportOverlay'));
const LeagueExportOverlay = lazy(() => importExportOverlay().then((m) => ({ default: m.LeagueExportOverlay })));

function GlobalHeader() {
  return (
    <header className="flex h-11 items-center justify-between border-b bg-card px-3 sm:px-6">
      <a href="/" lang="en" data-testid="wordmark" className="text-2xl font-extrabold tracking-tight">
        <span className="text-primary">my151</span>
        <span className="text-foreground">.app</span>
      </a>
      <div className="flex flex-shrink-0 items-center gap-0 min-[360px]:gap-1">
        <LanguagePicker />
        <FeedbackButton />
        <ToolsMenu current="league" />
      </div>
    </header>
  );
}

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

const PANE_CONTENT = 'w-[min(100%,88%)]';
const LEAGUE_SOLO_CONTENT = 'w-[min(100%,clamp(24rem,48%,44rem))]';

export function LeagueApp() {
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
  const openCardType = useLeagueStore((s) => (openCard !== null ? s.cards[openCard]?.type ?? null : null));
  const connectorColor = cardShades(openCardType).type;
  const isDesktop = useIsDesktop();

  useEffect(
    () =>
      useLeagueStore.subscribe(() => {
        useLeagueBrowserStore.getState().refresh();
      }),
    [],
  );

  const replacing = browserPurpose === 'replace' && replacingId !== null
    ? getPokemonById(replacingId)
    : undefined;
  const target =
    browserPurpose === 'legend' ? t('league.target.legend')
    : browserPurpose === 'signature' ? t('league.target.ace')
    : browserPurpose === 'partner' ? t('league.target.partner')
    : slotLabel(openCard ?? 0);
  const replacingName = replacing ? pokemonLabel(replacing.id, replacing.name).full : '';
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
      <PokemonBrowser pickMode="instant" labelForSection={() => target} dataSource={leaguePokemonDataSource} />
    </BrowserStoreContext.Provider>
  );

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col bg-background">
        <SkipLink />
        <GlobalHeader />

        {!isDesktop && (
        <main id={MAIN_ID} tabIndex={-1} className="min-h-0 flex-1 overflow-hidden focus:outline-none md:hidden">
        <ErrorBoundary where="league">
          <div
            className="p151-pane-track flex h-full w-[200%]"
            style={{ transform: `translate3d(${openCard === null ? '0' : '-50%'}, 0, 0)` }}
          >
            <div
              data-lg-viewport
              inert={openCard !== null}
              className="h-full w-1/2 overflow-y-auto"
            >
              <div data-testid="league-tool-bar" className="flex h-11 items-center gap-2 border-b bg-card px-3">
                <LeagueNameRow h1 />
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <LeagueViewToggle />
                  <LeagueExportButton />
                </span>
              </div>
              <LeagueTipSlot pane="league" />
              <div className="mx-auto w-full max-w-[26rem] px-3 pt-2.5">
                <LeagueHome />
              </div>
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

        {isDesktop && (
        <main id={MAIN_ID} tabIndex={-1} className="hidden min-h-0 flex-1 flex-col overflow-y-auto focus:outline-none md:flex">
        <ErrorBoundary where="league-desktop">
          <div className="relative flex h-full min-h-0 shrink-0">
            {openCard !== null && <GymConnector openCard={openCard} color={connectorColor} />}
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
              <LeagueTipSlot pane="league" />
              <div data-lg-viewport className="min-h-0 flex-1 overflow-y-auto py-3">
                <div className={cn('mx-auto px-3', openCard === null ? LEAGUE_SOLO_CONTENT : PANE_CONTENT)}>
                  <LeagueHome />
                </div>
              </div>
            </section>

            {openCard !== null && (
              <section className={cn('relative z-20 flex min-w-0 flex-col', browserOpen ? 'w-1/3 border-r' : 'w-1/2')}>
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
                <LeagueTipSlot pane="card" />
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

          <div className="shrink-0 border-t bg-background">
            <PageFooter faq="league" compact />
          </div>
        </ErrorBoundary>
        </main>
        )}

        {browserOpen && !isDesktop && (
          <BottomSheet
            onClose={closeBrowser}
            instant
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
      </div>
    </TooltipProvider>
  );
}
