import { Hammer } from 'lucide-react';
import { useT } from '@/i18n';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { PageFooter } from '@/components/shared/PageFooter';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { openFeedback } from '@/components/feedback/feedbackChannel';
import { TooltipProvider } from '@/components/ui/tooltip';
import dexBack from '@/assets/home/tool-dex-b.webp';
import dexFront from '@/assets/home/tool-dex.webp';
import leagueBack from '@/assets/home/tool-league-b.webp';
import leagueFront from '@/assets/home/tool-league.webp';
import favBack from '@/assets/home/tool-fav-b.webp';
import favFront from '@/assets/home/tool-fav.webp';

/**
 * The router page: four cards, one per tool.
 *
 * Every measurement inside a card is a percentage of the card's own width, so
 * a breakpoint only picks how many cards fit in a row and the card scales
 * itself. That is `cqw` against the cell wrapper, which is the sanctioned
 * container-relative knob in CLAUDE.md — not a `vw` clamp, which would fight
 * the root font-size and shrink under an iOS pinch-zoom.
 *
 * The ratios come from `docs/future-tools/home-page/build-artboards.mjs`, where
 * a 45-frame sweep proves them from 320px to 2560px. They are written here as
 * percentages of a 166-unit-wide card, the same base the generator uses, so the
 * two stay comparable.
 */
const U = (n: number) => `${((n / 166) * 100).toFixed(3)}cqw`;

const CARD_ASPECT = '166 / 104';
const RADIUS = U(14);
const PAD = U(6);
const COPY_BAND = U(52);
const FADE = U(26);
const TITLE = U(9.1);
const BLURB = U(8.5);
const COPY_GAP = '0.1875rem';
const BLURB_BAND = `calc(${BLURB} * 2.7)`;
const CARD_HEIGHT = U(104);
const COPY_HEIGHT = `calc(${TITLE} * 1.15 + ${COPY_GAP} + ${BLURB_BAND})`;
// Room for each screenshot's drop shadow to fall outside the clip box without
// being sliced off at its edge. The artwork shifts by the same amount, so it
// lands where it would have anyway.
const BLEED = U(34);

// A screenshot is a phone viewport, so its height follows from its width.
const SHOT_ASPECT = 390 / 844;

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
}

interface CardProps {
  tool: Tool;
  onPress?: () => void;
}

/**
 * One card. The cell wrapper is the query container, so everything inside sizes
 * itself off the card's own width; the cell also reserves the overhang with
 * `padding-top`, which is why a card can never land on the one above it however
 * the grid reflows.
 *
 * `--art` scales the artwork against the card without touching the card itself.
 * Tablet packs the two rows closer with a smaller fan; phone and desktop run the
 * fan at full size.
 */
function Card({ tool, onPress }: CardProps) {
  const panel = 'relative block w-full text-left bg-primary text-white no-underline';
  const panelStyle = { aspectRatio: CARD_ASPECT, borderRadius: RADIUS };
  const body = (
    <>
      {tool.shots ? (
        <>
          <Artwork tool={tool} />
          <Gradient />
        </>
      ) : (
        <Mark />
      )}
      <div
        className="absolute flex flex-col"
        style={{ left: PAD, right: PAD, bottom: PAD, gap: COPY_GAP }}
      >
        <h2
          className="m-0 font-extrabold tracking-tight whitespace-nowrap"
          style={{ fontSize: TITLE, lineHeight: 1.15 }}
        >
          {tool.title}
        </h2>
        <p
          className="m-0"
          style={{
            fontSize: BLURB,
            lineHeight: 1.35,
            // Two lines, always: a one-line blurb must not lift the title.
            height: BLURB_BAND,
            color: 'rgba(255, 255, 255, 0.86)',
            textWrap: 'balance',
          }}
        >
          {tool.blurb}
        </p>
      </div>
    </>
  );
  return (
    <div style={{ containerType: 'inline-size' }}>
      <div style={{ paddingTop: `calc(${U(POP_TOP)} * var(--art))` }}>
        {onPress ? (
          <button type="button" onClick={onPress} className={`${panel} cursor-pointer`} style={panelStyle}>
            {body}
          </button>
        ) : (
          <a href={tool.href} className={panel} style={panelStyle}>
            {body}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Two clip boxes, not one. Both reach past the card's top and left edges so the
 * screenshots break out there, and both stop at the card's bottom, which is the
 * only edge that cuts them. The shadows get their own box with a fade, so they
 * thin out instead of ending on a straight line at that edge.
 */
function Artwork({ tool }: { tool: Tool }) {
  const box = {
    position: 'absolute',
    top: `calc((${U(POP_TOP)} * var(--art) + ${BLEED}) * -1)`,
    left: `calc((${U(POP_LEFT)} * var(--art) + ${BLEED}) * -1)`,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
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
      borderRadius: `calc(${U(SHOT_W)} * var(--art) * 0.09)`,
    };
  };
  return (
    <>
      <div
        style={{
          ...box,
          maskImage: `linear-gradient(to top, transparent 0, #000 ${BLEED})`,
          WebkitMaskImage: `linear-gradient(to top, transparent 0, #000 ${BLEED})`,
        }}
      >
        {FAN.map((f, i) => (
          <div
            key={f.tilt}
            aria-hidden
            style={{
              ...place(i),
              height: `calc(${U(SHOT_W)} * var(--art) / ${SHOT_ASPECT})`,
              boxShadow: '0 14px 30px rgba(10, 10, 10, 0.2), 0 3px 8px rgba(10, 10, 10, 0.1)',
            }}
          />
        ))}
      </div>
      <div style={box}>
        {FAN.map((f, i) => (
          <div
            key={f.tilt}
            className="overflow-hidden border border-neutral-300 bg-background"
            style={place(i)}
          >
            <img
              src={tool.shots![i]}
              alt=""
              loading="lazy"
              decoding="async"
              className="block w-full"
            />
          </div>
        ))}
      </div>
    </>
  );
}

/** Red rising from the card's bottom, so the copy stays legible over artwork. */
function Gradient() {
  const c = '220, 38, 38';
  return (
    <div
      className="absolute inset-x-0 bottom-0"
      style={{
        height: `calc(${COPY_BAND} + ${FADE})`,
        borderRadius: `0 0 ${RADIUS} ${RADIUS}`,
        background:
          `linear-gradient(to top, rgb(${c}) 0, rgb(${c}) calc(${COPY_BAND} * 0.55), ` +
          `rgba(${c}, 0.92) ${COPY_BAND}, rgba(${c}, 0) calc(${COPY_BAND} + ${FADE}))`,
      }}
    />
  );
}

/**
 * No tool to screenshot yet, so this card carries the build icon the dex
 * builder already uses. It is centred in the space above the heading, so the
 * air above it matches the air below by construction rather than by eye.
 */
function Mark() {
  return (
    <div
      className="absolute inset-x-0 top-0 flex items-center justify-center"
      style={{ height: `calc(${CARD_HEIGHT} - ${PAD} - ${COPY_HEIGHT})` }}
    >
      <Hammer style={{ width: U(35), height: U(35) }} strokeWidth={2} />
    </div>
  );
}

export function HomePage() {
  const t = useT();
  const tools: Tool[] = [
    {
      key: 'dex',
      href: '/',
      title: t('home.dex.title'),
      blurb: t('home.dex.blurb'),
      shots: [dexBack, dexFront],
    },
    {
      key: 'league',
      href: '/pokemon-league-builder',
      title: t('home.league.title'),
      blurb: t('home.league.blurb'),
      shots: [leagueBack, leagueFront],
    },
    {
      key: 'fav',
      href: '/favorite-pokemon-picker',
      title: t('home.fav.title'),
      blurb: t('home.fav.blurb'),
      shots: [favBack, favFront],
    },
    { key: 'next', title: t('home.next.title'), blurb: t('home.next.blurb') },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh flex flex-col bg-background text-foreground">
        <header className="border-b bg-card">
          <div className="flex items-center justify-between px-3 sm:px-6 py-2">
            <span className="text-2xl font-extrabold tracking-tight whitespace-nowrap">
              <span className="text-primary">my151</span>
              <span className="text-foreground">.app</span>
            </span>
            <LanguagePicker />
          </div>
        </header>

        {/* Horizontal padding is a share of the viewport, not a rem step: rem
            here rides the root font-size knob, which caps at 1024px, so a rem
            gutter would stop growing exactly where the page gets widest. Type
            below is the opposite case and stays in rem on purpose, so it does
            follow that knob. */}
        <main className="flex-1 px-[4%] sm:px-[5.3%] md:px-[5.6%] pt-6 md:pt-16 pb-4">
          <section className="md:flex md:items-start md:justify-between">
            <h1
              className="m-0 font-extrabold tracking-tight text-pretty text-[1.7rem] sm:text-[1.9rem] md:text-[2.1rem] sm:max-w-[83%] md:max-w-none md:w-[41%] md:shrink-0"
              style={{ lineHeight: 1.08 }}
            >
              {t('home.h1')}
            </h1>
            <div className="mt-2.5 md:mt-0 flex flex-col gap-2.5 sm:max-w-[83%] md:max-w-none md:w-[55%] md:shrink-0">
              <p className="m-0 text-[0.78rem] leading-relaxed text-muted-foreground text-pretty">
                {t('home.intro')}
              </p>
              <p className="m-0 text-[0.72rem] leading-relaxed text-muted-foreground/70 text-pretty">
                {t('home.note')}
              </p>
            </div>
          </section>

          {/* `art` shrinks the fan on tablet so the two rows pack closer; phone
              and desktop run it at full size. */}
          <div
            className="mt-8 md:mt-16 grid grid-cols-2 md:grid-cols-4 gap-x-3.5 gap-y-3.5 sm:gap-x-7 md:gap-x-6 [--art:1] sm:[--art:0.82] md:[--art:1]"
          >
            {tools.map((tool) => (
              <Card
                key={tool.key}
                tool={tool}
                onPress={tool.key === 'next' ? () => openFeedback() : undefined}
              />
            ))}
          </div>
        </main>

        <PageFooter />
        <FeedbackHost route="home" />
      </div>
    </TooltipProvider>
  );
}
