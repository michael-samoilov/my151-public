import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { preload } from 'react-dom';
import { HomeScreenshot, MobileArtwork } from '@/home/artwork';
import { mobileArtwork, MOBILE_MEDIA } from '@/home/artwork-data';
import { installHomeArtwork } from '@/home/artwork-controller.js';
import { useHomeSheetLift } from './useHomeSheetLift';
import { SLOT_COUNT } from '@/league/model/constants';
import { useDocumentLocale, useT } from '@/i18n';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { PageFooter } from '@/components/shared/PageFooter';
import { MAIN_ID, SkipLink } from '@/components/shared/SkipLink';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { openFeedback } from '@/components/feedback/feedbackChannel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePokedexStore } from '@/store/usePokedexStore';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { markLeaguePromoSeen } from '@/lib/launchFlags';
import dexBack from '@/assets/home/tool-dex-b.webp';
import dexBackAvif from '@/assets/home/tool-dex-b.avif';
import dexFront from '@/assets/home/tool-dex.webp';
import dexFrontAvif from '@/assets/home/tool-dex.avif';
import leagueBack from '@/assets/home/tool-league-b.webp';
import leagueBackAvif from '@/assets/home/tool-league-b.avif';
import leagueFront from '@/assets/home/tool-league.webp';
import leagueFrontAvif from '@/assets/home/tool-league.avif';
import favoritesBack from '@/assets/home/tool-favorites-b.webp';
import favoritesBackAvif from '@/assets/home/tool-favorites-b.avif';
import favoritesFront from '@/assets/home/tool-favorites.webp';
import favoritesFrontAvif from '@/assets/home/tool-favorites.avif';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { EggIcon } from '@/components/shared/AppIcons';
import { pathScale } from '@/lib/pathScale';

const U = (n: number) => `${((n / 166) * 100).toFixed(3)}cqw`;

const PANEL_ASPECT = '166 / 79.167';
const RADIUS = `min(${U(14)}, 14px)`;
const TITLE = `min(${U(9.1)}, var(--card-title-cap))`;
const BLURB = `min(${U(7.6)}, var(--card-text-cap))`;
const BLEED = U(34);

const EXPORT_RADIUS = 0.02;

const FAN = [
  { tilt: -3.5, offset: 0 },
  { tilt: 3.5, offset: 16 },
];
const SHOT_W = 134;
const SHOT_TOP = 8;
const POP_TOP = 56;
const POP_LEFT = 9.6;

const shot = (src: string, avif: string, width: number, height: number, fetchPriority?: 'high') => ({ src, avif, width, height, fetchPriority });


interface Tool {
  key: string;
  href?: string;
  title: string;
  blurb: string;
  progress?: { count: number; total: number; label: string };
  shots?: [ReturnType<typeof shot>, ReturnType<typeof shot>];
  alts?: [string, string];
}

const NEXT_CARD = 'next';

const PROGRESS_TOKEN = '{progress}';

function readSavedState(key: string): Record<string, unknown> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    return saved?.state && typeof saved.state === 'object' ? saved.state : null;
  } catch {
    return null;
  }
}

declare global {
  interface Window { p151HubCounts?: { dex: number | null; league: number; favorites: number | null } }
}

// Counted by the hub's boot script and already written into the prerendered
// page (scripts/prerender-hub.ts). The first render starts from them, so
// hydration matches; the app's own counts follow.
const bootCounts = typeof window === 'undefined' ? undefined : window.p151HubCounts;
const noSubscription = () => () => {};

function useSavedToolProgress() {
  const [league, setLeague] = useState(bootCounts?.league ?? 0);
  const [favorites, setFavorites] = useState({ filled: bootCounts?.favorites ?? 0, total: 257 });
  useEffect(() => {
    let active = true;
    async function readSaved() {
      try {
        const cards = readSavedState('league-builder')?.cards;
        setLeague(Array.isArray(cards) ? cards.slice(0, SLOT_COUNT).filter(
          card => Array.isArray(card?.lines) && card.lines.length > 0,
        ).length : 0);
        const savedFills = readSavedState('favorite-picker')?.fills;
        if (savedFills && typeof savedFills === 'object' && !Array.isArray(savedFills)) {
          const { recordSavedPicks } = await import('@/favorites/export/savedPicks');
          const completion = recordSavedPicks();
          if (active && completion) setFavorites({ filled: completion.filled, total: completion.total });
        } else if (active) setFavorites({ filled: 0, total: 257 });
      } catch {
        return;
      }
    }
    void readSaved();
    window.addEventListener('storage', readSaved);
    return () => { active = false; window.removeEventListener('storage', readSaved); };
  }, []);
  return { league, favorites };
}

function useTools(placed: number): Tool[] {
  const t = useT();
  const { league, favorites } = useSavedToolProgress();
  return [
    {
      key: 'dex',
      href: '/pokedex-builder',
      title: t('home.dex.title'),
      blurb: t('home.dex.blurb'),
      progress: { count: placed, total: 151, label: t('home.dex.saved', { progress: PROGRESS_TOKEN }) },
      shots: [shot(dexFront, dexFrontAvif, 800, 1777, 'high'), shot(dexBack, dexBackAvif, 800, 942)],
      alts: [t('home.dex.buildAlt'), t('home.dex.exportAlt')],
    },
    {
      key: 'league',
      href: '/custom-gym-leader',
      title: t('home.league.title'),
      blurb: t('home.league.blurb'),
      progress: { count: league, total: SLOT_COUNT, label: t('home.league.saved', { progress: PROGRESS_TOKEN }) },
      shots: [shot(leagueBack, leagueBackAvif, 800, 1020), shot(leagueFront, leagueFrontAvif, 800, 1268)],
      alts: [t('home.league.leagueAlt'), t('home.league.cardAlt')],
    },
    {
      key: 'favorites',
      href: '/favorite-pokemon-picker',
      title: t('home.favorites.title'),
      blurb: t('home.favorites.blurb'),
      progress: { count: favorites.filled, total: favorites.total, label: t('home.favorites.saved', { progress: PROGRESS_TOKEN }) },
      shots: [shot(favoritesBack, favoritesBackAvif, 800, 1433), shot(favoritesFront, favoritesFrontAvif, 800, 1773)],
      alts: [t('home.favorites.fullGridAlt'), t('home.favorites.simplifiedAlt')],
    },
    { key: NEXT_CARD, title: t('home.next.title'), blurb: t('home.next.blurb') },
  ];
}

interface CardProps {
  tool: Tool;
  onPress?: () => void;
  wide?: boolean;
  reserve?: boolean;
}

const SPAN = 'col-span-2';

function Card({ tool, onPress, wide, reserve }: CardProps) {
  for (const image of tool.shots ?? []) {
    preload(image.avif, { as: 'image', type: 'image/avif', fetchPriority: image.fetchPriority, media: mobileArtwork.length ? 'not all and ' + MOBILE_MEDIA : undefined });
  }
  const panel = 'relative block w-full text-left bg-primary text-white no-underline';
  const body = wide ? <WideBody tool={tool} /> : <TallBody tool={tool} />;
  const style = wide ? undefined : { aspectRatio: `var(--panel-ar, ${PANEL_ASPECT})`, borderRadius: RADIUS };
  const wideStyle = { borderRadius: `min(${U(14)}, 18px)` };
  const inner = onPress ? (
    <button
      type="button"
      onClick={onPress}
      className={`${panel} cursor-pointer`}
      style={wide ? wideStyle : style}
      data-card-panel
      aria-label={tool.shots ? undefined : tool.title}
    >
      {body}
      {tool.shots && <span className="hub-pocket-edge" aria-hidden data-card-pocket />}
    </button>
  ) : tool.href ? (
    <a
      href={tool.href}
      className={panel}
      style={style}
      data-card-panel
      aria-label={tool.shots ? undefined : tool.title}
      onClick={() => sendCardBeacon(tool.key)}
    >
      {body}
      {tool.shots && <span className="hub-pocket-edge" aria-hidden data-card-pocket />}
    </a>
  ) : (
    <div className={panel} style={style} data-card-panel>
      {body}
      {tool.shots && <span className="hub-pocket-edge" aria-hidden data-card-pocket />}
    </div>
  );

  return (
    <div
      data-hub-card={tool.shots ? tool.key : undefined}
      className={`hub-card flex flex-col ${wide ? SPAN : ''}`}
      style={{ containerType: 'inline-size' }}
    >
      <div style={{ paddingTop: reserve ? `calc(${U(POP_TOP)} * var(--art) + var(--panel-inset, 0px))` : 0 }}>{inner}</div>
      {wide ? null : <Caption tool={tool} />}
    </div>
  );
}

const EGG = pathScale(1.35);
const EGG_BOX = `calc(${U(35)} * var(--panel-h, 79.167) / 79.167)`;

function TallBody({ tool }: { tool: Tool }) {
  return tool.shots ? (
    <><Artwork tool={tool} /><MobileArtwork toolKey={tool.key} alt={tool.alts?.join(' / ') ?? tool.title} /></>
  ) : (
    <span className="absolute inset-0 flex items-center justify-center" data-card-badge>
      <EggIcon style={{ width: EGG_BOX, height: EGG_BOX, ...EGG.style }} strokeWidth={EGG.strokeWidth} />
    </span>
  );
}

function WideBody({ tool }: { tool: Tool }) {
  return (
    <span
      className="flex items-center"
      style={{ gap: U(7), padding: `${U(7.4)} ${U(8)}` }}
      data-card-badge
    >
      <EggIcon style={{ width: U(15), height: U(15), flex: 'none', ...EGG.style }} strokeWidth={EGG.strokeWidth} />
      <span className="block">
        <span
          className="block font-bold tracking-tight"
          style={{ fontSize: `min(${U(7.6)}, 19px)`, lineHeight: 1.2 }}
        >
          {tool.title}
        </span>
        <span
          className="block"
          style={{
            fontSize: `min(${U(6.4)}, 15.6px)`,
            lineHeight: 1.35,
            marginTop: U(1.6),
            color: 'rgba(255, 255, 255, 0.82)',
          }}
        >
          {tool.blurb}
        </span>
      </span>
    </span>
  );
}

function ProgressText({ progress }: { progress: NonNullable<Tool['progress']> }) {
  const [before, after] = progress.label.split(PROGRESS_TOKEN);
  return (
    <>
      {before}
      <strong className="font-bold tabular-nums whitespace-nowrap"><span className="text-primary">{progress.count}</span><span className="text-foreground">/{progress.total}</span></strong>
      {after}
    </>
  );
}

function sendCardBeacon(key: string) {
  sendEventBeacon(key === 'dex' ? 'hub-cta-dex' : key === 'league' ? 'hub-cta-league' : 'hub-cta-favorites');
}

function Caption({ tool }: { tool: Tool }) {
  const Title = tool.href ? 'h2' : 'p';
  return (
    <div style={{ padding: `var(--caption-top, ${U(5.6)}) ${U(1.7)} 0` }} data-card-caption>
      <Title
        data-card-title
        className="m-0 font-bold tracking-tight"
        style={{ fontSize: TITLE, lineHeight: 1.25 }}
      >
        {tool.href ? (
          <a href={tool.href} className="text-inherit no-underline" onClick={() => sendCardBeacon(tool.key)}>
            {tool.title}
          </a>
        ) : (
          tool.title
        )}
      </Title>
      <p
        className={`m-0 text-muted-foreground ${tool.key === NEXT_CARD ? 'whitespace-pre-line' : 'text-pretty'}`}
        style={{ fontSize: BLURB, lineHeight: 'var(--caption-leading, 1.4)', marginTop: `var(--caption-gap, ${U(3)})` }}
      >
        {tool.blurb}
      </p>
      {tool.progress && (
        <p
          data-card-progress={tool.key}
          data-empty={tool.progress.count > 0 ? undefined : ''}
          className="m-0 grid text-muted-foreground"
          style={{ fontSize: BLURB, lineHeight: 'var(--caption-leading, 1.4)' }}
        >
          <span aria-hidden className="invisible [grid-area:1/1]">
            <ProgressText progress={{ ...tool.progress, count: tool.progress.total }} />
          </span>
          <span data-progress-count className="[grid-area:1/1]"><ProgressText progress={tool.progress} /></span>
        </p>
      )}
    </div>
  );
}

function Artwork({ tool }: { tool: Tool }) {
  const [floated, setFloated] = useState<number | null>(null);
  const stageRef = useHomeSheetLift(floated);
  const widerPair = tool.key === 'dex' || tool.key === 'league';
  const shotWidth = tool.key === 'dex' ? 147 : tool.key === 'league' ? 149 : SHOT_W;
  const box = {
    position: 'absolute',
    top: `calc((${U(POP_TOP)} * var(--art) + ${BLEED} + var(--panel-height) * 0.55) * -1)`,
    left: `calc((${U(POP_LEFT)} * var(--art) + ${BLEED}) * -1)`,
    right: 'calc(100cqw - var(--card-width, 100cqw))',
    bottom: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  } as const;
  const geom = (i: number) => {
    const f = FAN[i];
    const scale = tool.key === 'league' && i === 0 ? 'var(--rear-scale, 1)' : '1';
    return {
      position: 'absolute' as const,
      left: `calc(${BLEED} + ${U(f.offset)} + var(--shot-nudge, 0px)${i === 0 ? ` - ${U(1)}` : ''}${i === 1
        ? ` + (var(--card-width, 100cqw) - (${U(FAN[1].offset)} - ${U(POP_LEFT)} * var(--art) + var(--shot-nudge, 0px) + ${U(shotWidth)} * var(--art))) / 2${widerPair ? ` - ${U(5)}` : ''}`
        : ''})`,
      top: `calc(${BLEED} + var(--panel-height) * 0.55 + ${U(SHOT_TOP)} + 6px + var(--panel-height) * 0.105 + (${U(shotWidth)} * var(--art) * ${scale} - ${U(147)} * var(--art)) * ${Math.sin(Math.abs(f.tilt) * Math.PI / 180) / 2})`,
      width: `calc(${U(shotWidth)} * var(--art) * ${scale})`,
      transformOrigin: '50% 0' as const,
      borderRadius: `calc(${U(shotWidth)} * var(--art) * ${scale} * ${EXPORT_RADIUS})`,
    };
  };
  const floatTransform = (i: number) => `translateY(var(--hf, 0px)) rotate(${FAN[i].tilt}deg)`;
  const restTransform = (i: number) => `rotate(${FAN[i].tilt}deg)`;
  return (
    <span data-artwork data-float={floated ?? undefined} style={{ display: 'contents' }}>
      <span className="hub-stage" ref={stageRef}>
      <span
        data-audit-clip="intended"
        style={{
          ...box,
          right: `calc(100cqw - var(--card-width, 100cqw) - 24px)`,
          maskImage: `linear-gradient(to top, transparent 0, #000 ${BLEED})`,
          WebkitMaskImage: `linear-gradient(to top, transparent 0, #000 ${BLEED})`,
        }}
      >
        {FAN.map((f, i) => (
          <span
            key={f.tilt}
            aria-hidden
            data-shot={i}
            className="hub-float-shot block"
            style={{ ...geom(i), transform: floatTransform(i), boxShadow: '0 9px 21px -5px rgba(10, 10, 10, 0.42)' }}
          >
            <span
              className="block w-full invisible"
              style={{ aspectRatio: `${tool.shots![i].width} / ${tool.shots![i].height}` }}
            />
          </span>
        ))}
      </span>
      <span style={box} data-audit-clip="intended">
        {FAN.map((f, i) => (
          <span
            key={f.tilt}
            data-shot={i}
            className="hub-float-shot block"
            style={{ ...geom(i), transform: floatTransform(i) }}
          >
            <HomeScreenshot
              id={`${tool.key}-${i}`}
              image={tool.shots![i]}
              alt={tool.alts?.[i] ?? ''}
              draggable={false}
              decoding="sync"
              className="block w-full h-auto"
            />
          </span>
        ))}
      </span>
      <span style={box} data-audit-clip="intended">
        {FAN.map((f, i) => (
          <span
            key={f.tilt}
            data-shot={i}
            data-hit
            className="hub-hit block"
            style={{ ...geom(i), transform: restTransform(i), pointerEvents: 'auto' }}
            // Float for a mouse or pen, never a touch tap (which would set the
            // state and, with no matching leave, leave a shot stuck up). This
            // replaces a CSS `(hover: hover) and (pointer: fine)` gate, which a
            // touchscreen laptop fails even when a mouse is in use.
            // platform: A touch tap fires pointerenter with no matching leave, and touchscreen laptops fail (hover: hover), so pointerType gates the float.
            onPointerEnter={(e) => { if (e.pointerType !== 'touch') setFloated(i); }}
            onPointerLeave={() => setFloated((prev) => (prev === i ? null : prev))}
          >
            <span
              className="block w-full invisible"
              style={{ aspectRatio: `${tool.shots![i].width} / ${tool.shots![i].height}` }}
            />
          </span>
        ))}
      </span>
      </span>
    </span>
  );
}

function reserveByRow(tools: Tool[], cols: number): boolean[] {
  const rowHasArt = new Map<number, boolean>();
  tools.forEach((tool, i) => {
    const row = Math.floor(i / cols);
    rowHasArt.set(row, (rowHasArt.get(row) ?? false) || Boolean(tool.shots));
  });
  return tools.map((_, i) => rowHasArt.get(Math.floor(i / cols)) ?? false);
}

export function HomePage() {
  const t = useT();
  useLayoutEffect(() => { installHomeArtwork(mobileArtwork); }, []);
  useDocumentLocale();
  useJsErrorCounter();
  useEffect(() => {
    document.dispatchEvent(new Event('p151-hub-interactive'));
    sendEventBeacon('hub-shown', { once: true });
  }, []);
  const storedPlaced = usePokedexStore((s) => Object.values(s.sections).reduce((n, ids) => n + ids.length, 0));
  const hydrating = useSyncExternalStore(noSubscription, () => false, () => true);
  const tools = useTools(hydrating && bootCounts ? bootCounts.dex ?? 0 : storedPlaced);

  useEffect(() => { markLeaguePromoSeen(); }, []);
  const desktopCols = tools.length;
  const gridStyle = { '--tool-cols': desktopCols } as React.CSSProperties;
  const isDesktop = useIsDesktop();
  const spansOnPhone = !isDesktop && tools.length % 2 === 1;
  const reserves = reserveByRow(tools, isDesktop ? desktopCols : 2);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col bg-background text-foreground">
        <div className="flex min-h-dvh flex-col">
          <SkipLink />
          <header className="border-b bg-card">
            <div className="flex items-center justify-between px-3 sm:px-6 py-2">
              <span lang="en" className="text-2xl font-extrabold tracking-tight whitespace-nowrap">
                <span className="text-primary">my151</span>
                <span className="text-foreground">.app</span>
              </span>
              <div className="flex flex-shrink-0 items-center gap-0 min-[360px]:gap-1">
                <LanguagePicker />
                <FeedbackButton />
                <ToolsMenu />
              </div>
            </div>
          </header>

          <main id={MAIN_ID} tabIndex={-1} className="hub-home flex flex-1 flex-col overflow-x-clip focus:outline-none not-supports-[overflow:clip]:overflow-x-hidden px-[4%] sm:max-md:px-[5.3%] md:px-[5.6%]">
            <ErrorBoundary where="hub">
            <div className="hub-spacer min-h-6 flex-1" />
            <section className="md:grid md:grid-cols-4 md:items-baseline md:gap-x-6">
              <h1
                className="m-0 font-extrabold tracking-tight text-pretty [word-break:auto-phrase] text-[1.3125rem] sm:max-md:text-[1.9rem] md:text-[1.75rem] xl:text-[2.1rem] sm:max-md:max-w-[83%] md:col-span-2"
                style={{ lineHeight: 1.08 }}
              >
                {t('home.h1')}
              </h1>
              {/* On desktop the intro's x-height top meets the title's. This div is 1rem,
                  so its 1ex is the x-height per rem, and the factors are the intro and
                  title sizes in rem. At xl the intro's line height is half of the title's
                  1.08 * 2.1rem line plus that same x-height offset, so a three-line intro
                  ends on the baseline of a two-line title. */}
              {/* platform: In a 1rem box, CSS 1ex is the font's x-height per rem, so the translate factors are the intro and title sizes. */}
              <div className="mt-2.5 md:mt-0 flex flex-col gap-2.5 sm:max-md:max-w-[83%] md:col-span-2 md:translate-y-[calc((1_-_1.75)*1ex)] xl:translate-y-[calc((1_-_2.1)*1ex)]">
                <p className="m-0 text-[0.78rem] md:text-[1rem] leading-relaxed xl:leading-[calc((2.268rem_+_1.1ex)/2)] text-muted-foreground text-pretty">
                  {t('home.intro')}
                </p>
              </div>
            </section>

            <div className="hub-spacer min-h-6 flex-1" />

            <div
              className="hub-grid grid grid-cols-2 min-[1300px]:grid-cols-[repeat(var(--tool-cols),minmax(0,1fr))] gap-x-3.5 gap-y-6 sm:max-md:gap-x-7 md:gap-x-6 [--art:0.92] [--card-title-cap:19px] [--card-text-cap:15.6px] md:[--card-title-cap:24px] md:[--card-text-cap:20px]"
              style={gridStyle}
            >
              {tools.map((tool, i) => (
                <Card
                  key={tool.key}
                  tool={tool}
                  wide={spansOnPhone && i === tools.length - 1}
                  reserve={reserves[i]}
                  onPress={tool.key === NEXT_CARD ? () => openFeedback('idea') : undefined}
                />
              ))}
            </div>
            <div className="hub-spacer min-h-6 flex-1" />
            </ErrorBoundary>
          </main>
        </div>

        <PageFooter faq="hub" />
        <FeedbackHost route="home" />
      </div>
    </TooltipProvider>
  );
}
