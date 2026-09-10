import { useEffect, useState } from 'react';
import { Hammer } from 'lucide-react';
import { useT } from '@/i18n';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu, type ToolsCallout } from '@/components/layout/ToolsMenu';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { PageFooter } from '@/components/shared/PageFooter';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { openFeedback } from '@/components/feedback/feedbackChannel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePokedexStore } from '@/store/usePokedexStore';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { isMovedNoticeSeen, markLeaguePromoSeen, markMovedNoticeSeen } from '@/lib/launchFlags';
import dexBack from '@/assets/home/tool-dex-b.webp';
import dexFront from '@/assets/home/tool-dex.webp';
import leagueBack from '@/assets/home/tool-league-b.webp';
import leagueFront from '@/assets/home/tool-league.webp';

/**
 * The router page: one card per tool, plus a call to action.
 *
 * The card is a red panel with the screenshots breaking out of its top and left
 * edges, cut only by its bottom, and the copy in a caption below it. The copy
 * sits below rather than inside because inside it needed a gradient to stay
 * legible over the artwork, and it was capped at 9.4px by a one-line title rule.
 * Outside, it is 14px and free to wrap.
 *
 * Every measurement inside a card is a percentage of the card's own width, so a
 * breakpoint only picks how many cards fit in a row and the card scales itself.
 * That is `cqw` against the cell wrapper, which is the container-relative knob
 * CLAUDE.md sanctions — not a `vw` clamp, which would fight the root font-size
 * and shrink under an iOS pinch-zoom.
 *
 * The ratios come from `docs/future-tools/home-page/build-artboards.mjs`, where
 * a 45-frame sweep proves them from 320px to 2560px. They are written here as
 * percentages of a 166-unit-wide card, the same base the generator uses.
 */
const U = (n: number) => `${((n / 166) * 100).toFixed(3)}cqw`;

/** Shorter than the artboard's 104: the copy no longer lives inside the panel. */
const PANEL_ASPECT = '166 / 100';
const RADIUS = U(14);
/** Caption type. Capped in px so a full-width card does not balloon it. */
const TITLE = `min(${U(9.1)}, 19px)`;
const BLURB = `min(${U(7.6)}, 15.6px)`;
// Room for each screenshot's drop shadow to fall outside the clip box without
// being sliced off at its edge. The artwork shifts by the same amount, so it
// lands where it would have anyway.
const BLEED = U(34);

/**
 * Corner radius as a share of the screenshot's width.
 *
 * A phone's own proportion, not this app's card radius: the shot is a picture
 * of a phone screen, so its corners should read as that phone's. An iPhone 14
 * rounds 47.3pt on a 390pt screen. The radius is applied here rather than baked
 * into the asset, so one flat rectangle serves the 110px phone card and the
 * 263px desktop card alike. `capture-shots.mjs` keeps the same number and
 * refuses to write an asset with ink inside this curve.
 */
const PHONE_RADIUS = 0.121;

/** The fan: back card lower and further left, and turned a little more. */
const FAN = [
  { tilt: -8, offset: 0, drop: 6 },
  { tilt: -3, offset: 16, drop: 0 },
];
const SHOT_W = 116;
const SHOT_TOP = 8;
const POP_TOP = 56;
const POP_LEFT = 9.6;

interface Tool {
  key: string;
  /** Absent on a card that opens something in place rather than navigating. */
  href?: string;
  title: string;
  blurb: string;
  shots?: [string, string];
  /** One description per shot, back then front. The shots are content, not
   *  decoration: they show what each tool produces. */
  alts?: [string, string];
}

const HAMMER_TITLE = 'next';

/**
 * The tools, in the order they appear. Adding the favorite picker back is one
 * entry here — the grid's column count and the call to action's shape both
 * follow from the length, so nothing else changes. See `gridStyle` below.
 */
function useTools(placed: number): Tool[] {
  const t = useT();
  return [
    {
      key: 'dex',
      href: '/pokedex-builder',
      title: t('home.dex.title'),
      // A saved dex turns the blurb into the way back to it. The store is
      // read, never written, from this page: the hub must not touch a dex.
      blurb: placed > 0 ? t('home.dex.continue', { count: placed }) : t('home.dex.blurb'),
      shots: [dexBack, dexFront],
      alts: [
        'The Pokédex builder’s analytics page: type distribution charts for a custom region against the National Dex',
        'A custom regional Pokédex of 151 Pokémon, exported as an image from the Pokédex builder',
      ],
    },
    {
      key: 'league',
      href: '/custom-gym-leader',
      title: t('home.league.title'),
      blurb: t('home.league.blurb'),
      shots: [leagueBack, leagueFront],
      alts: [
        'A whole league exported from the gym leader maker: eight gym leaders, the Elite Four and the Champion with their teams',
        'A gym leader’s pro trainer card exported from the gym leader maker, with the badge, ace Pokémon and team',
      ],
    },
    { key: HAMMER_TITLE, title: t('home.next.title'), blurb: t('home.next.blurb') },
  ];
}

interface CardProps {
  tool: Tool;
  onPress?: () => void;
  /** Render as the wide bar that fills a row on its own. */
  wide?: boolean;
  /** Leave room above the panel for artwork to pop into. See `reserveByRow`. */
  reserve?: boolean;
}

/** The wide bar spans both columns of the phone grid; a tall card takes one. */
const SPAN = 'col-span-2';

/**
 * One card. The cell wrapper is the query container, so everything inside sizes
 * itself off the card's own width.
 *
 * Cells top-align. That is what keeps the red panels in a row on one edge, and
 * so the FIRST line of every title on one baseline, however many lines the
 * caption below runs to. Copy can be tuned to equal line counts in English, but
 * it cannot hold this on its own — the app ships in eight languages and a
 * translated title wraps differently.
 */
function Card({ tool, onPress, wide, reserve }: CardProps) {
  const panel = 'relative block w-full text-left bg-primary text-white no-underline';
  const body = wide ? <WideBody tool={tool} /> : <TallBody tool={tool} />;
  const style = wide ? undefined : { aspectRatio: PANEL_ASPECT, borderRadius: RADIUS };
  const wideStyle = { borderRadius: `min(${U(14)}, 18px)` };
  const inner = onPress ? (
    <button
      type="button"
      onClick={onPress}
      className={`${panel} cursor-pointer`}
      style={wide ? wideStyle : style}
      data-card-panel
    >
      {body}
    </button>
  ) : tool.href ? (
    <a
      href={tool.href}
      className={panel}
      style={style}
      data-card-panel
      // fetch keepalive lets the beacon outlive the navigation this starts.
      onClick={() => sendEventBeacon(tool.key === 'dex' ? 'hub-cta-dex' : 'hub-cta-league')}
    >
      {body}
    </a>
  ) : (
    <div className={panel} style={style} data-card-panel>
      {body}
    </div>
  );

  // `hub-card` is the hover trigger and stays put. On hover only the screenshots
  // inside the panel float up and settle back — the red panel and the caption do
  // not move. The motion is on the artwork (`.hub-float`), so a stationary
  // trigger keeps the pointer from chasing a target that slides out from under
  // it, and there is no hover flicker. The float lives in `index.css`.
  return (
    <div
      className={`hub-card flex flex-col ${wide ? SPAN : ''}`}
      style={{ containerType: 'inline-size' }}
    >
      <div style={{ paddingTop: reserve ? `calc(${U(POP_TOP)} * var(--art))` : 0 }}>{inner}</div>
      {wide ? null : <Caption tool={tool} />}
    </div>
  );
}

/** The panel body for a card in the grid: artwork, or the build mark. */
function TallBody({ tool }: { tool: Tool }) {
  return tool.shots ? (
    <Artwork tool={tool} />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center" data-card-badge>
      <Hammer style={{ width: U(35), height: U(35) }} strokeWidth={2} />
    </span>
  );
}

/**
 * The call to action fills a row on its own, so it takes a wider, shorter panel
 * and sets its mark beside the copy rather than above it. It is not a tool, and
 * this is the one place the page says so in shape rather than in words.
 */
function WideBody({ tool }: { tool: Tool }) {
  return (
    <span
      className="flex items-center"
      style={{ gap: U(7), padding: `${U(7.4)} ${U(8)}` }}
      data-card-badge
    >
      <Hammer style={{ width: U(15), height: U(15), flex: 'none' }} strokeWidth={2} />
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

/** Ink on the page, under the panel. */
function Caption({ tool }: { tool: Tool }) {
  // The tool cards are the page's h2 list: one heading per tool, which is
  // also the anchor text of the link to it. The call to action is not a tool,
  // so it is styled the same and is not a heading.
  const Title = tool.href ? 'h2' : 'p';
  return (
    <div style={{ padding: `${U(5.6)} ${U(1.7)} 0` }} data-card-caption>
      <Title
        data-card-title
        className="m-0 font-bold tracking-tight"
        style={{ fontSize: TITLE, lineHeight: 1.25 }}
      >
        {tool.title}
      </Title>
      <p
        className="m-0 text-muted-foreground text-pretty"
        style={{ fontSize: BLURB, lineHeight: 1.4, marginTop: U(3) }}
      >
        {tool.blurb}
      </p>
    </div>
  );
}

/**
 * Two clip boxes, not one. Both reach past the panel's top and left edges so the
 * screenshots break out there, and both stop at its bottom, which is the only
 * edge that cuts them. The shadows get their own box with a fade, so they thin
 * out instead of ending on a straight line at that edge.
 *
 * The shadow box holds a hidden copy of the same screenshot, which is what
 * gives it the screenshot's shape. Each asset is cropped to its own content —
 * the dex's grid ends above the app's footer, an export ends at its own edge —
 * so no single aspect ratio describes all four, and a hardcoded one would put
 * the shadow somewhere the picture is not. The copy costs one extra decode of
 * an image the browser has already fetched.
 */
function Artwork({ tool }: { tool: Tool }) {
  // Both clip boxes reach far past the panel's top-left edge, mostly over empty
  // space. That whole rectangle used to be part of the link, so a click well
  // above or beside the artwork still navigated. `pointerEvents: 'none'` here
  // hands those transparent margins back to the page; the screenshots below
  // re-enable events on themselves, so the link's hit target is the panel and
  // the two screenshots, nothing more.
  const box = {
    position: 'absolute',
    top: `calc((${U(POP_TOP)} * var(--art) + ${BLEED}) * -1)`,
    left: `calc((${U(POP_LEFT)} * var(--art) + ${BLEED}) * -1)`,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  } as const;
  const place = (i: number) => {
    const f = FAN[i];
    return {
      position: 'absolute' as const,
      left: `calc(${BLEED} + ${U(f.offset)})`,
      top: `calc(${BLEED} + ${U(SHOT_TOP)} + ${U(f.drop)})`,
      width: `calc(${U(SHOT_W)} * var(--art))`,
      transform: `rotate(${f.tilt}deg)`,
      transformOrigin: '0 0',
      borderRadius: `calc(${U(SHOT_W)} * var(--art) * ${PHONE_RADIUS})`,
    };
  };
  return (
    <>
      <span
        className="hub-float"
        style={{
          ...box,
          maskImage: `linear-gradient(to top, transparent 0, #000 ${BLEED})`,
          WebkitMaskImage: `linear-gradient(to top, transparent 0, #000 ${BLEED})`,
        }}
      >
        {FAN.map((f, i) => (
          <span
            key={f.tilt}
            aria-hidden
            className="block"
            style={{ ...place(i), boxShadow: '0 8px 20px -6px rgba(10, 10, 10, 0.35)' }}
          >
            <img src={tool.shots![i]} alt="" className="block w-full invisible" />
          </span>
        ))}
      </span>
      <span className="hub-float" style={box}>
        {FAN.map((f, i) => (
          <span
            key={f.tilt}
            className="block overflow-hidden border border-neutral-300 bg-background"
            // Re-enable events the clip box turned off, so a click on the
            // screenshot still follows the card's link.
            style={{ ...place(i), pointerEvents: 'auto' }}
          >
            {/* Not lazy: every card sits in the first viewport at every
                width, and these are the page's largest paint. */}
            <img
              src={tool.shots![i]}
              alt={tool.alts?.[i] ?? ''}
              decoding="async"
              className="block w-full"
            />
          </span>
        ))}
      </span>
    </>
  );
}

/**
 * Which cards leave room above themselves for artwork to pop into.
 *
 * The room belongs to the artwork, not to the card, so a row with no artwork in
 * it simply sits higher. That is how the call-to-action row closes the gap under
 * the tools today, and how it drops back down by itself when the favorite picker
 * ships with screenshots of its own.
 *
 * The reserve is shared across a row, though — one card in a row keeping room it
 * does not need is the price of the panels in that row sharing a top edge, and
 * the alignment is worth more than the gap. A spanning card always starts a row,
 * because it only spans when the count is odd.
 */
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
  useJsErrorCounter();
  useEffect(() => {
    sendEventBeacon('hub-shown', { once: true });
  }, []);
  const placed = usePokedexStore((s) => Object.values(s.sections).reduce((n, ids) => n + ids.length, 0));
  const tools = useTools(placed);

  // Shown once to a visitor who saved a dex before the launch, when "/" was
  // the builder: a tooltip on the Tools menu says where the builder went and
  // that nothing was lost. Seeing the hub is also seeing the gym leader
  // card, so the dex builder's own callout for it is marked seen here and
  // never repeats there.
  const [moved, setMoved] = useState(() => placed > 0 && !isMovedNoticeSeen());
  useEffect(() => {
    if (moved) markLeaguePromoSeen();
  }, [moved]);
  const movedCallout: ToolsCallout | null = moved
    ? {
        text: t('home.moved.tip', { count: placed }),
        dismissLabel: t('home.moved.dismiss'),
        testId: 'moved-notice',
        onDismiss: () => {
          markMovedNoticeSeen();
          setMoved(false);
        },
      }
    : null;
  // Desktop lays the tools on one row, but sizes each card as if the design's
  // four tools were present and left-aligns however many exist today. Three
  // cards keep the four-up card size and leave the last column empty, instead
  // of stretching to a third of the page each. A fourth tool fills that column;
  // a fifth or more widens the row. On a phone it is two up, which leaves the
  // last card alone when the count is odd — that is the card that spans instead.
  const desktopCols = Math.max(tools.length, 4);
  const gridStyle = { '--tool-cols': desktopCols } as React.CSSProperties;
  // The wide bar is a phone shape only, and the two shapes are different markup
  // rather than different CSS, so exactly one of them mounts. That is what
  // `useIsDesktop` is for elsewhere in this app; the alternative is rendering
  // both and hiding one, which duplicates the call to action's button.
  const isDesktop = useIsDesktop();
  const spansOnPhone = !isDesktop && tools.length % 2 === 1;
  const reserves = reserveByRow(tools, isDesktop ? desktopCols : 2);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col bg-background text-foreground">
        {/* The fold. Header and content fill one viewport on their own, so the
            footer always starts below it — what a visitor sees before scrolling
            is exactly this block. `min-h` rather than `h`, so a viewport too
            short for the content pushes the footer further down instead of
            crushing the grid. */}
        <div className="flex min-h-dvh flex-col">
          <header className="border-b bg-card">
            <div className="flex items-center justify-between px-3 sm:px-6 py-2">
              <span className="text-2xl font-extrabold tracking-tight whitespace-nowrap">
                <span className="text-primary">my151</span>
                <span className="text-foreground">.app</span>
              </span>
              {/* The same site bar as every tool page: language, report, tools. */}
              <div className="flex flex-shrink-0 items-center gap-1">
                <LanguagePicker />
                <FeedbackButton />
                <ToolsMenu callout={movedCallout} />
              </div>
            </div>
          </header>

          {/* Horizontal padding is a share of the viewport, not a rem step: rem
              here rides the root font-size knob, which caps at 1024px, so a rem
              gutter would stop growing exactly where the page gets widest. Type
              below is the opposite case and stays in rem on purpose, so it does
              follow that knob.

              Vertically it is three equal spacers, so the air above the hero,
              between the hero and the grid, and below the grid all match.
              `min-h-6` is the floor they collapse to when the content is taller
              than the viewport. */}
          <main className="flex flex-1 flex-col px-[4%] sm:max-md:px-[5.3%] md:px-[5.6%]">
            <div className="min-h-6 flex-1" />
            <section className="md:flex md:items-start md:justify-between">
              <h1
                // Every step here was measured, not guessed — see the README.
                // 1.3125rem is 21px at the mobile root size, the largest whole
                // pixel that keeps this heading to two lines at 320px, the
                // narrowest width the e2e projects cover; 22px spills to three.
                // The split hero gives the h1 a 375px column at 1024, where
                // anything over 1.75rem runs to four lines, so the big size waits
                // for xl.
                className="m-0 font-extrabold tracking-tight text-pretty text-[1.3125rem] sm:max-md:text-[1.9rem] md:text-[1.75rem] xl:text-[2.1rem] sm:max-md:max-w-[83%] md:w-[41%] md:shrink-0"
                style={{ lineHeight: 1.08 }}
              >
                {t('home.h1')}
              </h1>
              <div className="mt-2.5 md:mt-0 flex flex-col gap-2.5 sm:max-md:max-w-[83%] md:w-[55%] md:shrink-0">
                <p className="m-0 text-[0.78rem] leading-relaxed text-muted-foreground text-pretty">
                  {t('home.intro')}
                </p>
                <p className="m-0 text-[0.72rem] leading-relaxed text-muted-foreground/70 text-pretty">
                  {t('home.note')}
                </p>
              </div>
            </section>

            <div className="min-h-6 flex-1" />

            {/* `--art` scales the artwork against the card without touching the
                card itself.

                Every tablet rule is `sm:max-md:`, never a bare `sm:`. This repo
                sets `--breakpoint-md: 1024px`, and Tailwind sorts that px value
                ahead of `sm`'s 40rem, so it emits the md block FIRST — a bare
                `sm:` then beats its own `md:` override above 1024px. Bounding the
                tablet rules at md means the two bands cannot overlap at all. */}
            <div
              className="grid grid-cols-2 md:grid-cols-[repeat(var(--tool-cols),minmax(0,1fr))] gap-x-3.5 gap-y-6 sm:max-md:gap-x-7 md:gap-x-6 [--art:0.92]"
              style={gridStyle}
            >
              {tools.map((tool, i) => (
                <Card
                  key={tool.key}
                  tool={tool}
                  wide={spansOnPhone && i === tools.length - 1}
                  reserve={reserves[i]}
                  // The card asks what to build next, so the form opens on Idea
                  // rather than the Bug it defaults to elsewhere.
                  onPress={tool.key === HAMMER_TITLE ? () => openFeedback('idea') : undefined}
                />
              ))}
            </div>
            <div className="min-h-6 flex-1" />
          </main>
        </div>

        <PageFooter faq="hub" />
        <FeedbackHost route="home" />
      </div>
    </TooltipProvider>
  );
}
