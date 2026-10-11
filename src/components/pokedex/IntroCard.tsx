import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { expandTemplate } from '@/lib/richTemplate';
import { formatNumber, raw, t } from '@/i18n';
import { DEX_TOTAL } from '@/lib/milestones';

/** Species in the National Dex the user picks from. */
const SPECIES_TOTAL = 1025;
import { Button } from '@/components/ui/button';
import { TYPE_COLORS } from '@/data/type-colors';
import { TYPE_ICONS } from '@/data/type-icons';
import type { TypeName } from '@/types/pokemon';
import { getPokemonById } from '@/hooks/usePokemonData';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { computeViewSort } from '@/hooks/useViewSort';
import { computeShowcaseStages, type ShowcaseStage } from '@/lib/introShowcase';
import {
  buildOutlines,
  computeSectionRuns,
  outlineStrokeW,
  OUTLINE_GAP,
  OUTLINE_PAD,
  OUTLINE_STROKE_FRAC,
} from '@/lib/sectionOutlines';
import { X } from 'lucide-react';
import shot45 from '@/assets/intro/shot-45.webp';
import shot95 from '@/assets/intro/shot-95-outlines.webp';
import shot151 from '@/assets/intro/shot-151-stats.webp';

/**
 * First-visit intro card — the top of the Build page for a brand-new visitor.
 *
 * Job: in a few seconds, communicate (1) what this is, (2) what the payoff
 * artifact looks like (the showcase: the seed dex as a rising staircase of
 * three poster cards — 45 plain → 95 with section outlines → a finished 151
 * with outlines *and* the detailed-stats panel), and (3) the one obvious
 * first action (choose your starters). Inline, not a modal: it should read as
 * part of the page, an invitation rather than an interstitial.
 *
 * Lifecycle: shown only while the dex is empty and the card was never
 * dismissed. The ✕ dismisses it forever; placing the first Pokémon collapses
 * it forever (activation happened — its job is done). Users who already have
 * a dex in progress when this ships are flagged on mount and never see it.
 */

const INTRO_SEEN_KEY = 'p151-intro-seen';

/** Poster-face design under evaluation: live-rendered colored dots, or
 *  pre-rendered View-page screenshots. Overridable per visit via ?intro. */
type FaceVariant = 'dots' | 'shots';
const DEFAULT_FACE: FaceVariant = 'shots';
const FACES = new Set<string>(['dots', 'shots']);

/** Starter-CTA button treatment under evaluation (the colored starter dots
 *  clash with the solid-red default; these are the contrast candidates). */
type BtnVariant = 'type-marks' | 'solid' | 'outline' | 'gradient-border' | 'fade';
const DEFAULT_BTN: BtnVariant = 'type-marks';
const BTNS = new Set<string>(['type-marks', 'solid', 'outline', 'gradient-border', 'fade']);

/** Review overrides. `?intro[=face]` forces the card to show (Vercel previews
 *  auto-seed the demo dex, which would otherwise hide it) and picks the face;
 *  `?btn=<variant>` picks the button treatment. Neither persists a dismissal. */
const { FORCE_INTRO, FACE, BTN } = (() => {
  try {
    const q = new URLSearchParams(window.location.search);
    const intro = q.get('intro');
    const btn = q.get('btn');
    return {
      FORCE_INTRO: intro !== null || btn !== null,
      FACE: (intro && FACES.has(intro) ? intro : DEFAULT_FACE) as FaceVariant,
      BTN: (btn && BTNS.has(btn) ? btn : DEFAULT_BTN) as BtnVariant,
    };
  } catch {
    return { FORCE_INTRO: false, FACE: DEFAULT_FACE, BTN: DEFAULT_BTN };
  }
})();

function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return true; // storage unavailable → can't remember a dismissal, so never show
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // best-effort
  }
}

// ---------- showcase stages ----------

const COLS = 10;
const TOTAL_SLOTS = 151;

// Each stage's face design ramps in richness as the dex fills: plain grid →
// section outlines → outlines + detailed stats. (Stats is genuinely locked
// under 100 Pokémon, so only the finished 151 can show it — the ramp mirrors
// what the app actually unlocks.)
interface StageStyle {
  outlines: boolean;
  stats: boolean;
}
const STAGE_STYLES: [StageStyle, StageStyle, StageStyle] = [
  { outlines: false, stats: false },
  { outlines: true, stats: false },
  { outlines: true, stats: true },
];

const SHOT_SRCS = [shot45, shot95, shot151] as const;

/** Every device loads these originals. Smaller copies drew at about their own
 *  size on a 3x phone and looked soft, for 42 KiB saved; they were removed on
 *  9 October. */

/** Intrinsic pixel sizes of SHOT_SRCS, in the same order. The staircase sizes
 *  each card by height and leaves width to `w-auto`, so without these the
 *  browser has no aspect ratio until the WebP decodes and every card resolves
 *  to ~2px wide — the hero renders as three slivers, then snaps to its real
 *  332px. Width/height attributes give the ratio up front, so the cards hold
 *  their final size from first paint. Keep in sync with the files in
 *  src/assets/intro/ if they are ever re-exported. */
const SHOT_DIMS = [
  { width: 390, height: 620 },
  { width: 348, height: 620 },
  { width: 555, height: 653 },
] as const;

/** Parallel to SHOT_SRCS. These three screenshots show the product's progression
 *  (partial dex, sectioned dex, complete dex plus analytics), so they carry
 *  meaning and need real alt text rather than alt="". Bing Webmaster Tools
 *  reported all three as missing alt attributes.
 *
 *  Each string carries one target search phrase — "custom Pokédex", "region
 *  template", "generated Pokédex image" — but only because each phrase accurately
 *  describes that image. Do not add phrases the screenshot does not show, and do
 *  not list phrases: Google treats keyword-filled alt attributes as keyword
 *  stuffing.
 *
 *  "Template" is accurate: BUILD_GROUPS in src/data/slot-template.ts is a
 *  pre-structured set of region sections that each pre-filter the browser.
 *  "Generated image" is accurate: shot-151 is itself an export produced by
 *  generateExportImage, and carries the "made with my151.app" footer. Prefer
 *  "generate your Pokédex image" over a bare "generator" — the app has no
 *  randomiser, so the bare term invites visitors expecting one. The words are
 *  catalog keys, so each language describes the images in its own terms. */
const SHOT_ALTS = ['intro.shot.partial', 'intro.shot.sections', 'intro.shot.complete'] as const;

// ---------- dots face ----------

/** Live miniature of the View-page poster from the seed dex: one dot per
 *  Pokémon (its primary-type color) in exact View sort order, 10 columns,
 *  151st slot centered on the last row, unfilled slots as faint rings. The
 *  outlined variant reuses the real View outline geometry at dot scale. */
function DotsGrid({ stage, outlines }: { stage: ShowcaseStage; outlines: boolean }) {
  const { dots, shapes, viewBox, strokeW } = useMemo(() => {
    const sorted = computeViewSort(stage.sections, 'build-order', true, null);
    const tile = 10;
    const gap = outlines ? OUTLINE_GAP * tile : tile * 0.12;
    const pad = outlines ? OUTLINE_PAD * tile : 0;
    const pitch = tile + gap;
    const rows = Math.ceil(TOTAL_SLOTS / COLS);
    const lastRowCount = TOTAL_SLOTS % COLS || COLS;
    const lastRowOffsetCols = (COLS - lastRowCount) / 2;
    const lastRowIndex = rows - 1;

    const slotCenter = (i: number) => {
      const row = Math.floor(i / COLS);
      const col = row === lastRowIndex ? lastRowOffsetCols + (i - lastRowIndex * COLS) : i % COLS;
      return { x: col * pitch + tile / 2, y: row * pitch + tile / 2 };
    };

    const dots = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
      const { x, y } = slotCenter(i);
      const p = sorted[i];
      return p
        ? { key: i, x, y, color: TYPE_COLORS[p.types[0]] ?? '#a8a77a', filled: true }
        : { key: i, x, y, color: '#d4d4d4', filled: false };
    });

    let shapes: ReturnType<typeof buildOutlines>['shapes'] = [];
    if (outlines) {
      const runs = computeSectionRuns(sorted, stage.sections, COLS);
      const lastRowGeom =
        lastRowOffsetCols > 0
          ? { index: lastRowIndex, count: lastRowCount, offsetCols: lastRowOffsetCols }
          : null;
      shapes = buildOutlines(
        runs, COLS, tile, new Set<number>(), 0, gap, pad, 0.5, lastRowGeom, OUTLINE_STROKE_FRAC,
      ).shapes;
    }

    const strokeW = outlineStrokeW(tile, OUTLINE_STROKE_FRAC);
    const margin = pad + strokeW + 1;
    const gridW = COLS * tile + (COLS - 1) * gap;
    const gridH = rows * tile + (rows - 1) * gap;
    const viewBox = `${-margin} ${-margin} ${gridW + 2 * margin} ${gridH + 2 * margin}`;
    return { dots, shapes, viewBox, strokeW };
  }, [stage, outlines]);

  const tile = 10;
  return (
    <svg viewBox={viewBox} className="h-full w-auto block bg-white" aria-hidden="true">
      {shapes.map((s) => (
        <path key={`f-${s.key}`} d={s.fill} fill={`${s.fillColor}2a`}
          fillOpacity={s.open ? 0.4 : 1} fillRule="evenodd" stroke="none" />
      ))}
      {shapes.map((s) => (
        <path key={`s-${s.key}`} d={s.stroke} fill="none" stroke={s.strokeColor}
          strokeOpacity={0.5} strokeWidth={strokeW} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {dots.map((d) =>
        d.filled ? (
          <circle key={d.key} cx={d.x} cy={d.y} r={tile * 0.33} fill={d.color} opacity={0.9} />
        ) : (
          <circle key={d.key} cx={d.x} cy={d.y} r={tile * 0.28} fill="none" stroke={d.color} strokeWidth={0.7} />
        ),
      )}
    </svg>
  );
}

/** Abstract stand-in for the detailed-stats panel on the dots hero: a small
 *  card of horizontal bars = the real top type counts of the finished dex,
 *  colored by type. Gives the dots hero the same wide silhouette (and the
 *  same "you get stats too" read) as the screenshot hero. */
function DotsStats({ stage }: { stage: ShowcaseStage }) {
  const bars = useMemo(() => {
    const counts = new Map<TypeName, number>();
    for (const id of Object.values(stage.sections).flat()) {
      const t = getPokemonById(id)?.types[0];
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9);
    const max = top.length ? top[0][1] : 1;
    return top.map(([type, n], i) => ({ key: i, frac: n / max, color: TYPE_COLORS[type] ?? '#a8a77a' }));
  }, [stage]);

  const rowH = 9;
  const gap = 4;
  const h = bars.length * rowH + (bars.length - 1) * gap;
  const labelW = 14;
  const barMax = 46;
  return (
    <svg viewBox={`0 0 ${labelW + barMax + 2} ${h}`} className="h-full w-auto block bg-white" aria-hidden="true">
      {bars.map((b, i) => {
        const y = i * (rowH + gap);
        return (
          <g key={b.key}>
            <rect x={0} y={y} width={labelW - 4} height={rowH} rx={2} fill={b.color} opacity={0.85} />
            <rect x={labelW} y={y + rowH * 0.15} width={Math.max(2, b.frac * barMax)} height={rowH * 0.7} rx={2} fill={b.color} opacity={0.55} />
          </g>
        );
      })}
    </svg>
  );
}

function DotsHero({ stage, outlines, stats }: { stage: ShowcaseStage; outlines: boolean; stats: boolean }) {
  if (!stats) return <DotsGrid stage={stage} outlines={outlines} />;
  return (
    <div className="flex h-full items-stretch gap-[6%] bg-white px-[3%] py-[3%]">
      <DotsGrid stage={stage} outlines={outlines} />
      <div className="flex flex-col justify-center">
        <DotsStats stage={stage} />
      </div>
    </div>
  );
}

// ---------- showcase staircase ----------

const REDUCED_MOTION =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
const FINE_POINTER =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(pointer: fine)')
    : null;

// Rising staircase: left→right the cards grow taller, lift higher, and stack
// on top — reading as the dex progressing toward a richer, fuller finish.
// Heights are in rem; widths follow each face's intrinsic aspect ratio.
const STAIR = [
  { height: '7.5rem', lift: '0.9rem', rotate: '-5deg', z: 'z-10', overlap: '-1.6rem', float: 'intro-float-a' },
  { height: '8.6rem', lift: '0.45rem', rotate: '-2deg', z: 'z-20', overlap: '-1.9rem', float: 'intro-float-c' },
  { height: '9.9rem', lift: '0rem', rotate: '1.5deg', z: 'z-30', overlap: '0', float: 'intro-float-b' },
] as const;

function ShowcaseStaircase() {
  const planeRef = useRef<HTMLDivElement>(null);
  const stages = useMemo(() => computeShowcaseStages(), []);

  // Desktop-only pointer tilt (poke-holo style, restrained). Direct style
  // writes so mousemove never re-renders React.
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const plane = planeRef.current;
    if (!plane || REDUCED_MOTION?.matches || !FINE_POINTER?.matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    plane.style.transform = `rotateX(${(-dy * 6).toFixed(2)}deg) rotateY(${(dx * 8).toFixed(2)}deg)`;
  }, []);
  const handleMouseLeave = useCallback(() => {
    if (planeRef.current) planeRef.current.style.transform = '';
  }, []);

  return (
    <div
      className="relative h-48 flex items-center justify-center [perspective:1000px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={planeRef}
        className="flex items-end justify-center [transform-style:preserve-3d] transition-transform duration-200 ease-out"
      >
        {STAIR.map((s, i) => (
          <div
            key={i}
            className={`relative ${s.z} ${s.float}`}
            style={{ height: s.height, marginLeft: i === 0 ? 0 : s.overlap, transform: `translateY(-${s.lift})` }}
          >
            <div
              className={FACE === 'shots' && i === 2
                ? 'h-full rounded-md border border-transparent shadow-lg'
                : 'h-full rounded-md border border-border/70 bg-white shadow-lg overflow-hidden'}
              style={{ transform: `rotate(${s.rotate})` }}
            >
              {FACE === 'shots' ? (
                <img
                  src={SHOT_SRCS[i]}
                  alt={t(SHOT_ALTS[i])}
                  width={SHOT_DIMS[i].width}
                  height={SHOT_DIMS[i].height}
                  // The card is the first thing a new visitor sees, so these
                  // three beat the sprite sheets and data fetches to the wire.
                  fetchPriority="high"
                  className="h-full w-auto block"
                  draggable={false}
                />
              ) : (
                <DotsHero stage={stages[i]} outlines={STAGE_STYLES[i].outlines} stats={STAGE_STYLES[i].stats} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- starter CTA (contrast variants) ----------

const STARTER_DOTS = ['#7ac74c', '#ee8130', '#6390f0'];

function StarterDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {STARTER_DOTS.map((c) => (
        <span key={c} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
      ))}
    </span>
  );
}

/**
 * The starters' type glyphs, sized so each carries the same ink. The glyph
 * files share one 44-unit frame at in-game proportions (scripts/type-icons/
 * BUILD.md), where Grass has 57% more ink than Fire. With no backing circle the
 * eye compares ink, so each glyph is scaled by sqrt(mean ink / its own ink),
 * from the files' measured ink: Grass 707, Fire 451, Water 515 square units.
 */
const STARTER_MARKS = [
  { type: 'grass', scale: 0.876 },
  { type: 'fire', scale: 1.097 },
  { type: 'water', scale: 1.027 },
] as const;

function StarterMarks() {
  return (
    <span className="flex items-center justify-center gap-[0.45em]" aria-hidden="true">
      {STARTER_MARKS.map(({ type, scale }) => {
        const mask = `url(${TYPE_ICONS[type].glyph}) center / contain no-repeat`;
        return (
          <span key={type} className="flex size-[1.7em] items-center justify-center">
            <span
              className="block"
              style={{ width: `${1.25 * scale}em`, height: `${1.25 * scale}em`, backgroundColor: TYPE_COLORS[type], mask, WebkitMask: mask }}
            />
          </span>
        );
      })}
    </span>
  );
}

function StarterButton({ onClick }: { onClick: () => void }) {
  const label = t('intro.cta');

  if (BTN === 'type-marks') {
    // The starters' type marks in a row above the label, inside a plain
    // theme-red border.
    return (
      <button
        type="button"
        onClick={onClick}
        className="mt-3.5 inline-flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-primary bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-transform duration-150 ease-out hover:bg-primary/5 active:scale-[0.96] cursor-pointer"
      >
        <StarterMarks />
        {label}
      </button>
    );
  }

  if (BTN === 'outline') {
    // White surface, red border + red text: dots keep full saturation on white.
    return (
      <Button
        onClick={onClick}
        variant="outline"
        className="mt-3.5 gap-2 border-2 border-primary text-primary hover:bg-primary/5 hover:text-primary"
      >
        <StarterDots />
        {label}
      </Button>
    );
  }

  if (BTN === 'gradient-border') {
    // White surface inside a 3-stop starter-color gradient border (padding-box
    // fill + border-box gradient), dark text, saturated dots on white.
    return (
      <button
        type="button"
        onClick={onClick}
        className="mt-3.5 inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-foreground transition-transform duration-150 ease-out active:scale-[0.96] cursor-pointer"
        style={{
          border: '2px solid transparent',
          background:
            'linear-gradient(var(--color-card), var(--color-card)) padding-box, ' +
            'linear-gradient(90deg, #7ac74c, #ee8130, #6390f0) border-box',
        }}
      >
        <StarterDots />
        {label}
      </button>
    );
  }

  if (BTN === 'fade') {
    // Red field that fades to a white zone on the left, so the dots sit on
    // white; the label rides the red field in white type.
    return (
      <button
        type="button"
        onClick={onClick}
        className="mt-3.5 inline-flex h-10 items-center justify-center gap-2 rounded-md pl-3 pr-4 text-sm font-medium text-white shadow-sm transition-transform duration-150 ease-out active:scale-[0.96] cursor-pointer"
        style={{
          background:
            'linear-gradient(90deg, #ffffff 0%, #ffffff 14%, var(--color-primary) 34%, var(--color-primary) 100%)',
        }}
      >
        <StarterDots />
        <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]">{label}</span>
      </button>
    );
  }

  // solid (baseline)
  return (
    <Button onClick={onClick} className="mt-3.5 gap-2">
      <StarterDots />
      {label}
    </Button>
  );
}

// ---------- intro card ----------

const COLLAPSE_MS = 450;

export function IntroCard({
  totalPlaced,
  onChooseStarters,
}: {
  totalPlaced: number;
  onChooseStarters: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'shown' | 'collapsing' | 'gone'>(() => {
    if (FORCE_INTRO) return 'shown';
    if (introSeen()) return 'gone';
    if (totalPlaced > 0) {
      // Existing dex predating the intro card — never show it.
      markIntroSeen();
      return 'gone';
    }
    return 'shown';
  });

  const collapse = useCallback(() => {
    setPhase((p) => (p === 'shown' ? 'collapsing' : p));
  }, []);

  const dismiss = useCallback(() => {
    sendEventBeacon('intro-dismiss', { once: true });
    collapse();
  }, [collapse]);

  const chooseStarters = useCallback(() => {
    sendEventBeacon('intro-cta', { once: true });
    onChooseStarters();
  }, [onChooseStarters]);

  // Funnel: the intro was actually seen (fires once per browser).
  useEffect(() => {
    if (phase === 'shown') sendEventBeacon('intro-shown', { once: true });
  }, [phase]);

  // First Pokémon placed → the card's job is done; fold away gracefully.
  // State adjustment during render (not an effect) per react.dev guidance.
  if (!FORCE_INTRO && phase === 'shown' && totalPlaced > 0) setPhase('collapsing');

  useEffect(() => {
    if (phase !== 'collapsing') return;
    if (!FORCE_INTRO) markIntroSeen();
    const t = setTimeout(() => setPhase('gone'), COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  /**
   * Keep the content *below* the card still when the card folds away above the
   * viewport — placing a Pokémon in a section further down does exactly that.
   *
   * No browser gets this right on its own, each in its own way. Safari has no
   * scroll anchoring at all, so the page jumps up by the card's full height
   * (374px measured) and the section the user just filled leaves the screen.
   * Chrome anchors, and that is fine while the card is wholly above the fold,
   * but when the card *straddles* the top edge Chrome's anchor lands inside the
   * shrinking card and it scrolls the wrong way — measured 394px, worse than
   * Safari. So this takes over for the one mutation that matters: switch the
   * scroller's anchoring off, remove the card, correct scrollTop, and hand
   * anchoring back the next frame.
   *
   * The correction is atomic rather than per-frame on purpose. Placing a
   * Pokémon re-renders the whole grid, and that starves the main thread badly
   * enough that the 450ms collapse timer has been measured firing 1342ms late.
   * Anything spread across animation frames simply does not get the frames,
   * and the height disappears in one jump anyway.
   *
   * So decide once, when the collapse starts:
   *
   *   above = scrollTop - (the card's top in content space)
   *
   * `above` is how much of the card sits over the viewport's top edge — the
   * part whose removal moves everything below it. None: the card is on screen,
   * the user is looking at it, it folds away as designed. Some: that fold is
   * off screen and worth nothing, so drop the card in a single step and take
   * `above` off scrollTop before the browser paints. Whatever slice of the card
   * *was* on screen closes, and the content below moves up by that slice and
   * no more — which is what it would have done had the card been on screen and
   * folded in place.
   *
   * One clamp on top of that. The card is the first thing in the list, so
   * `cardTop` is exactly the list's own top padding — nothing else is above it.
   * When the card straddles the viewport's top edge the arithmetic above lands
   * on `cardTop` every time, which parks the scroller *inside* that padding and
   * presses the first section flat against the header. There is nothing up
   * there worth keeping, so go to the top instead and let the padding show.
   */
  useLayoutEffect(() => {
    if (phase !== 'collapsing') return;
    const el = rootRef.current;
    const scroller = el?.closest<HTMLElement>('[data-build-scroll]');
    if (!el || !scroller) return;

    const rect = el.getBoundingClientRect();
    const cardTop = rect.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const above = scroller.scrollTop - cardTop;
    if (above <= 0) return; // card is on screen — let it animate

    const corrected = scroller.scrollTop - Math.min(rect.height, above);
    const anchoring = scroller.style.overflowAnchor;
    scroller.style.overflowAnchor = 'none';
    // Skipping the animation also skips the effect that records the dismissal,
    // so record it here or the card comes back on the next visit.
    if (!FORCE_INTRO) markIntroSeen();
    setPhase('gone');
    scroller.scrollTop = corrected <= cardTop ? 0 : corrected;
    requestAnimationFrame(() => {
      scroller.style.overflowAnchor = anchoring;
    });
  }, [phase]);

  if (phase === 'gone') return null;

  return (
    <div
      ref={rootRef}
      className="grid transition-[grid-template-rows,opacity] ease-in-out"
      style={{
        gridTemplateRows: phase === 'collapsing' ? '0fr' : '1fr',
        opacity: phase === 'collapsing' ? 0 : 1,
        transitionDuration: `${COLLAPSE_MS}ms`,
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="relative rounded-xl border bg-card mb-2 overflow-hidden">
          <button
            type="button"
            aria-label={t('intro.dismiss')}
            onClick={dismiss}
            className="absolute right-1 top-1 z-40 p-2.5 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="pt-4 bg-gradient-to-b from-muted/60 to-transparent">
            <ShowcaseStaircase />
          </div>

          <div className="px-5 pb-5 pt-2 text-center">
            <h2 className="text-xl font-extrabold tracking-tight">
              {/* One sentence with a highlighted slot, rather than a prefix
                  concatenated with a styled number — the emphasis lands in a
                  different place in other languages. */}
              {expandTemplate<React.ReactNode>(raw('intro.headline'), (text) => text, {
                count: () => [<span key="n" className="text-primary">{DEX_TOTAL}</span>],
              })}
            </h2>
            <p className="mt-1.5 mx-auto max-w-[26rem] text-sm text-muted-foreground text-pretty">
              {t('intro.body', { total: formatNumber(SPECIES_TOTAL) })}
            </p>
            <StarterButton onClick={chooseStarters} />
          </div>
        </div>
      </div>
    </div>
  );
}
