import { useEffect, useState } from 'react';
import { useHomeSheetLift } from './useHomeSheetLift';
import { SLOT_COUNT } from '@/league/model/constants';
import { Hammer } from 'lucide-react';
import { useDocumentLocale, useT } from '@/i18n';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useXHeightAlignment } from './useXHeightAlignment';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { PageFooter } from '@/components/shared/PageFooter';
import { FeedbackHost } from '@/components/feedback/FeedbackHost';
import { openFeedback } from '@/components/feedback/feedbackChannel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePokedexStore } from '@/store/usePokedexStore';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useJsErrorCounter } from '@/hooks/useJsErrorCounter';
import { markLeaguePromoSeen } from '@/lib/launchFlags';
import dexBack from '@/assets/home/tool-dex-b.webp';
import dexBack300 from '@/assets/home/tool-dex-b-300.webp';
import dexBack400 from '@/assets/home/tool-dex-b-400.webp';
import dexFront from '@/assets/home/tool-dex.webp';
import dexFront300 from '@/assets/home/tool-dex-300.webp';
import dexFront400 from '@/assets/home/tool-dex-400.webp';
import leagueBack from '@/assets/home/tool-league-b.webp';
import leagueBack300 from '@/assets/home/tool-league-b-300.webp';
import leagueBack400 from '@/assets/home/tool-league-b-400.webp';
import leagueFront from '@/assets/home/tool-league.webp';
import leagueFront300 from '@/assets/home/tool-league-300.webp';
import leagueFront400 from '@/assets/home/tool-league-400.webp';
import favoritesBack from '@/assets/home/tool-favorites-b.webp';
import favoritesBack300 from '@/assets/home/tool-favorites-b-300.webp';
import favoritesBack400 from '@/assets/home/tool-favorites-b-400.webp';
import favoritesFront from '@/assets/home/tool-favorites.webp';
import favoritesFront300 from '@/assets/home/tool-favorites-300.webp';
import favoritesFront400 from '@/assets/home/tool-favorites-400.webp';

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
const PANEL_ASPECT = '166 / 79.167';
// Capped in px so the wide desktop band does not take a huge rounded corner:
// the radius is a share of the card's width, and a third-of-the-page card would
// otherwise round ~34px, whose bottom-left curve exposes the screenshot behind
// it. See `--shot-nudge`, which shifts the shots clear of this corner.
const RADIUS = `min(${U(14)}, 14px)`;
/** Caption type. Capped in px so a full-width card does not balloon it. */
const TITLE = `min(${U(9.1)}, 19px)`;
const BLURB = `min(${U(7.6)}, 15.6px)`;
// Room for each screenshot's drop shadow to fall outside the clip box without
// being sliced off at its edge. The artwork shifts by the same amount, so it
// lands where it would have anyway.
const BLEED = U(34);

/** Export-paper corners are gentle and leave each native title band intact. */
const EXPORT_RADIUS = 0.02;

/** Equal-width sheets share their top anchor and rotate in 7° steps. */
const FAN = [
  { tilt: -3.5, offset: 0 },
  { tilt: 3.5, offset: 16 },
];
// One width makes the shortest native export bleed below the unchanged panel.
const SHOT_W = 134;
const SHOT_TOP = 8;
const POP_TOP = 56;
const POP_LEFT = 9.6;

/**
 * The CSS width a shot renders at in each band of the hub's layout, measured
 * from the current layout: 128px on a 390px phone, 140px at 1280. That is the
 * narrowest shot; the widest is about 10% wider on a phone and 20% on a
 * desktop. Browsers load the smallest copy that covers `sizes` times the pixel
 * ratio, so a wider `sizes` would send a 3x phone the 800px original. With
 * this one, a 1x desktop or a 2x phone loads the 300px copy, a 2.6x to 3x
 * phone or a 2x laptop the 400px copy, and a landscape phone or tablet the
 * 800px original. `scripts/resize-shots.sh` writes the copies.
 */
const SHOT_SIZES =
  '(min-width: 1024px) calc(11.87vw - 0.602rem), (min-width: 640px) calc(33.197vw - 0.65rem), calc(34.163vw - 0.325rem)';
const shot = (c300: string, c400: string, full: string, fetchPriority?: 'high') => ({
  src: full,
  srcSet: `${c300} 300w, ${c400} 400w, ${full} 800w`,
  sizes: SHOT_SIZES,
  fetchPriority,
});

interface Tool {
  key: string;
  /** Absent on a card that opens something in place rather than navigating. */
  href?: string;
  title: string;
  blurb: string;
  /** Saved work for this tool in this browser. `count` is 0 when there is none. */
  progress?: { count: number; total: number; label: string };
  shots?: [ReturnType<typeof shot>, ReturnType<typeof shot>];
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
const PROGRESS_TOKEN = '{progress}';

function readSavedState(key: string): Record<string, unknown> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    return saved?.state && typeof saved.state === 'object' ? saved.state : null;
  } catch {
    return null;
  }
}

/** Read saved work without creating a demo league or changing either store. */
function useSavedToolProgress() {
  const [league, setLeague] = useState(0);
  const [favorites, setFavorites] = useState({ filled: 0, total: 257 });
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
          const fills = Object.fromEntries(Object.entries(savedFills).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number',
          ));
          const { buildFavoritesSnapshot } = await import('@/favorites/export/snapshot');
          const { filled, total } = buildFavoritesSnapshot(fills).completion;
          if (active) setFavorites({ filled, total });
        } else if (active) setFavorites({ filled: 0, total: 257 });
      } catch {
        // Blocked storage or an unreadable save must not stop the homepage.
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
      // The page's largest paint on a phone. The hub's HTML is prerendered,
      // so the browser sees this priority before it requests anything.
      shots: [shot(dexFront300, dexFront400, dexFront, 'high'), shot(dexBack300, dexBack400, dexBack)],
      alts: [
        'Custom Pokédex Maker: a custom regional Pokédex in progress on the Build page',
        'A custom regional Pokédex exported with detailed type, generation and base-stat distribution charts',
      ],
    },
    {
      key: 'league',
      href: '/custom-gym-leader',
      title: t('home.league.title'),
      blurb: t('home.league.blurb'),
      progress: { count: league, total: SLOT_COUNT, label: t('home.league.saved', { progress: PROGRESS_TOKEN }) },
      shots: [shot(leagueBack300, leagueBack400, leagueBack), shot(leagueFront300, leagueFront400, leagueFront)],
      alts: [
        'Gym Leader Maker: a whole league exported with eight gym leaders, the Elite Four, the Champion and the endgame boss with their story teams',
        'A gym leader’s pro trainer card exported from the gym leader maker, with the badge, ace Pokémon and team',
      ],
    },
    {
      key: 'favorites',
      href: '/favorite-pokemon-picker',
      title: t('home.favorites.title'),
      blurb: t('home.favorites.blurb'),
      progress: { count: favorites.filled, total: favorites.total, label: t('home.favorites.saved', { progress: PROGRESS_TOKEN }) },
      shots: [shot(favoritesBack300, favoritesBack400, favoritesBack), shot(favoritesFront300, favoritesFront400, favoritesFront)],
      alts: [t('home.favorites.fullGridAlt'), t('home.favorites.simplifiedAlt')],
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
  // `--panel-ar` is set on the grid: the tall proportion on a phone, a wide low
  // band on desktop (see `.hub-grid` in index.css). PANEL_ASPECT is the fallback.
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
      <div style={{ paddingTop: reserve ? `calc(${U(POP_TOP)} * var(--art) + var(--panel-inset, 0px))` : 0 }}>{inner}</div>
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

/** Ink on the page, under the panel. */
// fetch keepalive lets the beacon outlive the navigation a card link starts.
function sendCardBeacon(key: string) {
  sendEventBeacon(key === 'dex' ? 'hub-cta-dex' : key === 'league' ? 'hub-cta-league' : 'hub-cta-favorites');
}

function Caption({ tool }: { tool: Tool }) {
  // The tool cards are the page's h2 list: one heading per tool. The heading
  // holds a link to the tool, so its words are anchor text, and the panel link
  // above carries the same name through its artwork's alt text. The link
  // inherits the heading's colour and adds no underline, so the card looks the
  // same. The call to action is not a tool, so it is styled the same and is
  // not a heading.
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
        className={`m-0 text-muted-foreground ${tool.key === HAMMER_TITLE ? 'whitespace-pre-line' : 'text-pretty'}`}
        style={{ fontSize: BLURB, lineHeight: 'var(--caption-leading, 1.4)', marginTop: `var(--caption-gap, ${U(3)})` }}
      >
        {tool.blurb}
      </p>
      {tool.progress && (
        // The saved-work line. It shows on every visit, with 0 before the
        // tool is used, so a first visitor sees what the tool counts and that
        // this browser keeps it. The counts are read after the app adopts the
        // prerendered HTML (zustand's hook gives React the dex store's initial
        // state while it hydrates), so a visitor with saved work would see 0
        // first; index.css hides the count until it arrives (`p151-saved-*`).
        // An invisible copy at the largest count gives the line its size
        // before the count arrives.
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
  // Which shot is floating, or none. Driven by pointer events on the stationary
  // hit twins below, not by `:has(:hover)`: the CSS approach silently no-ops on
  // older Chrome and pre-16.4 iOS Safari, so this drives it in JS instead. The
  // guard is unchanged — the handlers sit on the twins, which never move, so a
  // floating shot can never move out from under the pointer and toggle itself.
  const [floated, setFloated] = useState<number | null>(null);
  const stageRef = useHomeSheetLift(floated);
  // Shorter sheets need slightly more paper below the pocket for the extra lift.
  const widerPair = tool.key === 'dex' || tool.key === 'league';
  const shotWidth = tool.key === 'dex' ? 147 : tool.key === 'league' ? 149 : SHOT_W;
  // The shortest front sheet sets a shared resting top and bottom reserve.
  // Both clip boxes reach far past the panel's top-left edge, mostly over empty
  // space. That whole rectangle used to be part of the link, so a click well
  // above or beside the artwork still navigated. `pointerEvents: 'none'` here
  // hands those transparent margins back to the page; the screenshots below
  // re-enable events on themselves, so the link's hit target is the panel and
  // the two screenshots, nothing more.
  const box = {
    position: 'absolute',
    top: `calc((${U(POP_TOP)} * var(--art) + ${BLEED} + var(--panel-height) * 0.55) * -1)`,
    left: `calc((${U(POP_LEFT)} * var(--art) + ${BLEED}) * -1)`,
    right: 'calc(100cqw - var(--card-width, 100cqw))',
    bottom: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  } as const;
  // The rest geometry of a shot: where it sits and how it tilts, with no float.
  const geom = (i: number) => {
    const f = FAN[i];
    // The shorter league summary needs extra paper below the shared hover fold.
    const scale = tool.key === 'league' && i === 0 ? 'var(--rear-scale, 1)' : '1';
    return {
      position: 'absolute' as const,
      // The nudge clears bottom corners; the front sheet uses half the remaining
      // right clearance. All visible, shadow and stationary hit copies share it.
      left: `calc(${BLEED} + ${U(f.offset)} + var(--shot-nudge, 0px)${i === 0 ? ` - ${U(1)}` : ''}${i === 1
        ? ` + (var(--card-width, 100cqw) - (${U(FAN[1].offset)} - ${U(POP_LEFT)} * var(--art) + var(--shot-nudge, 0px) + ${U(shotWidth)} * var(--art))) / 2${widerPair ? ` - ${U(5)}` : ''}`
        : ''})`,
      // Share the Dex's safe resting top. Compensate for the tilted top edge's
      // half-width projection, so different sheet widths have the same top.
      top: `calc(${BLEED} + var(--panel-height) * 0.55 + ${U(SHOT_TOP)} + 6px + var(--panel-height) * 0.105 + (${U(shotWidth)} * var(--art) * ${scale} - ${U(147)} * var(--art)) * ${Math.sin(Math.abs(f.tilt) * Math.PI / 180) / 2})`,
      width: `calc(${U(shotWidth)} * var(--art) * ${scale})`,
      transformOrigin: '50% 0' as const,
      borderRadius: `calc(${U(shotWidth)} * var(--art) * ${scale} * ${EXPORT_RADIUS})`,
    };
  };
  // The floating shots carry `--hf`, the per-shot hover float that `index.css`
  // sets to 0 at rest and a lift on hover. It sits ahead of the rotate, so the
  // shot rises straight up in screen space whatever its tilt. The clip box does
  // not move, so the shot slides up inside it and reveals the part of itself
  // that sits hidden below the card's bottom edge.
  const floatTransform = (i: number) => `translateY(var(--hf, 0px)) rotate(${FAN[i].tilt}deg)`;
  const restTransform = (i: number) => `rotate(${FAN[i].tilt}deg)`;
  // `data-float` names the floating shot; `index.css` reads it to set `--hf`.
  // `display: contents` keeps this wrapper out of the box tree, so the clip
  // boxes still position against the panel. Images are `draggable={false}` so a
  // drag grabs nothing — otherwise the browser drags the card link and shows a
  // ghost of the whole card, which reads as one merged image.
  return (
    <span data-artwork data-float={floated ?? undefined} style={{ display: 'contents' }}>
      {/* The stage. A fixed-size box pinned to the panel's bottom-left that owns
          the screenshots' size: everything inside is a share of the STAGE's
          width, not the card's, so widening or shortening the red panel around it
          moves and resizes nothing here. Full width (= the panel) on a phone;
          narrower on desktop (see `.hub-stage`), so the card can grow wide and
          short while the screenshots keep the size and left-edge position they
          have now — the extra width becomes red to their right. */}
      <span className="hub-stage" ref={stageRef}>
      {/* Shadows. Masked so they fade out near the top break-out rather than
          ending on a straight line at the clip edge. Each rides its own shot's
          `--hf`, so a shadow floats with the shot it belongs to. */}
      <span
        data-audit-clip="intended"
        style={{
          ...box,
          // Past the panel's right edge by the shadow's reach (21px blur, -5px
          // spread, so 16px), plus margin: on a phone the front sheet sits a few
          // pixels from that edge, and its shadow ended on a straight line there.
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
            <img {...tool.shots![i]} alt="" draggable={false} className="block w-full invisible" />
          </span>
        ))}
      </span>
      {/* The visible shots. They float, so they carry no pointer events — the
          stationary hit layer below owns hovering and clicking. */}
      <span style={box} data-audit-clip="intended">
        {FAN.map((f, i) => (
          <span
            key={f.tilt}
            data-shot={i}
            className="hub-float-shot block"
            style={{ ...geom(i), transform: floatTransform(i) }}
          >
            {/* Not lazy: every card sits in the first viewport at every
                width, and these are the page's largest paint. */}
            <img
              {...tool.shots![i]}
              alt={tool.alts?.[i] ?? ''}
              draggable={false}
              decoding="async"
              className="block w-full"
            />
          </span>
        ))}
      </span>
      {/* The hit layer: one transparent twin per shot, at the shot's REST
          footprint, and it never moves. Its pointer handlers float that one shot
          and drop it again. Because the thing you hover stays put while the shot
          lifts, the shot can never rise out from under the pointer and toggle
          itself — the guard against hover flicker. The twins are the click
          target too, so a click on a screenshot still follows the card's link;
          the front twin sits last, so it wins the overlap. */}
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
            onPointerEnter={(e) => { if (e.pointerType !== 'touch') setFloated(i); }}
            onPointerLeave={() => setFloated((prev) => (prev === i ? null : prev))}
          >
            {/* An invisible copy of the shot gives the twin the shot's exact
                height, so the hit area matches the screenshot's footprint. The
                browser has already decoded this image, so it costs no fetch. */}
            <img {...tool.shots![i]} alt="" draggable={false} className="block w-full invisible" />
          </span>
        ))}
      </span>
      </span>
    </span>
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
  useDocumentLocale();
  useJsErrorCounter();
  useEffect(() => {
    sendEventBeacon('hub-shown', { once: true });
  }, []);
  const placed = usePokedexStore((s) => Object.values(s.sections).reduce((n, ids) => n + ids.length, 0));
  const tools = useTools(placed);

  useEffect(() => { markLeaguePromoSeen(); }, []);
  // Desktop lays the tools on one row that fills the width: three cards spread
  // to where a fourth card's right edge would sit. The cards go wide and short
  // so the red reads as a low band, not a block; the screenshots do not change,
  // because each renders in a fixed-size stage pinned to its card's bottom-left
  // (see `.hub-stage`). On a phone it is two up, which leaves the last card alone
  // when the count is odd — that is the card that spans instead.
  const desktopCols = tools.length;
  const gridStyle = { '--tool-cols': desktopCols } as React.CSSProperties;
  // The wide bar is a phone shape only, and the two shapes are different markup
  // rather than different CSS, so exactly one of them mounts. That is what
  // `useIsDesktop` is for elsewhere in this app; the alternative is rendering
  // both and hiding one, which duplicates the call to action's button.
  const isDesktop = useIsDesktop();
  const { titleRef, descriptionRef, offset: descriptionOffset } = useXHeightAlignment(isDesktop);
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
              <span lang="en" className="text-2xl font-extrabold tracking-tight whitespace-nowrap">
                <span className="text-primary">my151</span>
                <span className="text-foreground">.app</span>
              </span>
              {/* The same site bar as every tool page: language, report, tools. */}
              <div className="flex flex-shrink-0 items-center gap-0 min-[360px]:gap-1">
                <LanguagePicker />
                <FeedbackButton />
                <ToolsMenu />
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
          {/* `overflow-x-clip` cuts the screenshot shadows' clip boxes, which
              reach past the right-hand card, at the screen edge, so the page
              never scrolls sideways. The shadows themselves end inside it.
              Safari before 16 has no `clip` and gets `hidden`, which makes
              `main` a scroll container; nothing in it overflows vertically. */}
          <main className="hub-home flex flex-1 flex-col overflow-x-clip not-supports-[overflow:clip]:overflow-x-hidden px-[4%] sm:max-md:px-[5.3%] md:px-[5.6%]">
            <div className="hub-spacer min-h-6 flex-1" />
            <section className="md:grid md:grid-cols-4 md:items-baseline md:gap-x-6">
              <h1
                ref={titleRef}
                // Every step here was measured, not guessed — see the README.
                // 1.3125rem is 21px at the mobile root size, the largest whole
                // pixel that keeps this heading to two lines at 320px, the
                // narrowest width the e2e projects cover; 22px spills to three.
                // Desktop copy spans the same two-card halves as the grid.
                // Keep the larger heading size at xl to preserve its line fit.
                className="m-0 font-extrabold tracking-tight text-pretty text-[1.3125rem] sm:max-md:text-[1.9rem] md:text-[1.75rem] xl:text-[2.1rem] sm:max-md:max-w-[83%] md:col-span-2"
                style={{ lineHeight: 1.08 }}
              >
                {t('home.h1')}
              </h1>
              {/* Share the first baseline, then align the two fonts' lowercase x tops. */}
              <div
                className="mt-2.5 md:mt-0 flex flex-col gap-2.5 sm:max-md:max-w-[83%] md:col-span-2"
                style={isDesktop ? { transform: `translateY(${descriptionOffset}px)` } : undefined}
              >
                <p ref={descriptionRef} className="m-0 text-[0.78rem] leading-relaxed text-muted-foreground text-pretty">
                  {t('home.intro')}
                </p>
              </div>
            </section>

            <div className="hub-spacer min-h-6 flex-1" />

            {/* `--art` scales the artwork against the card without touching the
                card itself.

                Every tablet rule is `sm:max-md:`, never a bare `sm:`. This repo
                sets `--breakpoint-md: 1024px`, and Tailwind sorts that px value
                ahead of `sm`'s 40rem, so it emits the md block FIRST — a bare
                `sm:` then beats its own `md:` override above 1024px. Bounding the
                tablet rules at md means the two bands cannot overlap at all. */}
            <div
              className="hub-grid grid grid-cols-2 md:grid-cols-[repeat(var(--tool-cols),minmax(0,1fr))] gap-x-3.5 gap-y-6 sm:max-md:gap-x-7 md:gap-x-6 [--art:0.92]"
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
            <div className="hub-spacer min-h-6 flex-1" />
          </main>
        </div>

        <PageFooter faq="hub" />
        <FeedbackHost route="home" />
      </div>
    </TooltipProvider>
  );
}
