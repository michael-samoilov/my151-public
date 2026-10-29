import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { expandTemplate } from '@/lib/richTemplate';
import { raw, t } from '@/i18n';
import { DEX_TOTAL } from '@/lib/milestones';
import { TYPE_COLORS } from '@/data/type-colors';
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
import shot45Avif from '@/assets/intro/shot-45.avif';
import shot95Avif from '@/assets/intro/shot-95-outlines.avif';
import shot151Avif from '@/assets/intro/shot-151-stats.avif';

const INTRO_SEEN_KEY = 'p151-intro-seen';

type FaceVariant = 'dots' | 'shots';
const DEFAULT_FACE: FaceVariant = 'shots';
const FACES = new Set<string>(['dots', 'shots']);

const { FORCE_INTRO, FACE } = (() => {
  try {
    const intro = new URLSearchParams(window.location.search).get('intro');
    return {
      FORCE_INTRO: intro !== null,
      FACE: (intro && FACES.has(intro) ? intro : DEFAULT_FACE) as FaceVariant,
    };
  } catch {
    return { FORCE_INTRO: false, FACE: DEFAULT_FACE };
  }
})();

function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    return;
  }
}

const COLS = 10;
const TOTAL_SLOTS = 151;

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
const SHOT_AVIFS = [shot45Avif, shot95Avif, shot151Avif] as const;

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

/** The export shot is two framed panels with rounded corners, transparent
 *  outside the frame and in the notches where the panels meet. A box shadow
 *  stops at the card's box, so those notches showed as white wedges inside the
 *  shadow. A drop shadow follows the image's own outline. Tuned by eye to
 *  match `shadow-lg` on the other two cards. */
const EXPORT_SHOT_SHADOW = 'drop-shadow(0 8px 8px rgb(0 0 0 / 0.1)) drop-shadow(0 2px 3px rgb(0 0 0 / 0.08))';

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

const REDUCED_MOTION =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
const FINE_POINTER =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(pointer: fine)')
    : null;

// Each card floats at half the speed of its index.css class, as Michael asked
// on 13 October. The classes keep the keyframes and the reduced-motion rule;
// the timing lives here because index.css is an input of the pre-rendered
// homepage artwork, and any edit to it means regenerating that artwork.
const STAIR = [
  { height: '7.5rem', lift: '0.9rem', rotate: '-5deg', z: 'z-10', overlap: '-1.6rem', float: 'intro-float-a', floatTiming: { animationDuration: '13s' } },
  { height: '8.6rem', lift: '0.45rem', rotate: '-2deg', z: 'z-20', overlap: '-1.9rem', float: 'intro-float-c', floatTiming: { animationDuration: '17s', animationDelay: '-10s' } },
  { height: '9.9rem', lift: '0rem', rotate: '1.5deg', z: 'z-30', overlap: '0', float: 'intro-float-b', floatTiming: { animationDuration: '15s', animationDelay: '-5s' } },
] as const;

function ShowcaseStaircase() {
  const planeRef = useRef<HTMLDivElement>(null);
  const stages = useMemo(() => computeShowcaseStages(), []);

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
            style={{ height: s.height, marginLeft: i === 0 ? 0 : s.overlap, transform: `translateY(-${s.lift})`, ...s.floatTiming }}
          >
            <div
              className={FACE === 'dots'
                ? 'h-full rounded-md border border-border/70 bg-white shadow-lg overflow-hidden'
                : i === 2
                  ? 'h-full'
                  : 'h-full rounded-md bg-white shadow-lg overflow-hidden'}
              style={{
                transform: `rotate(${s.rotate})`,
                filter: FACE === 'shots' && i === 2 ? EXPORT_SHOT_SHADOW : undefined,
              }}
            >
              {FACE === 'shots' ? (
                <picture className="contents">
                <source srcSet={SHOT_AVIFS[i]} type="image/avif" />
                <img
                  src={SHOT_SRCS[i]}
                  alt={t(SHOT_ALTS[i])}
                  width={SHOT_DIMS[i].width}
                  height={SHOT_DIMS[i].height}
                  fetchPriority="high"
                  className="h-full w-auto block"
                  draggable={false}
                />
                </picture>
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

const COLLAPSE_MS = 450;

export function IntroCard({ totalPlaced }: { totalPlaced: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'shown' | 'collapsing' | 'gone'>(() => {
    if (FORCE_INTRO) return 'shown';
    if (introSeen()) return 'gone';
    if (totalPlaced > 0) {
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

  useEffect(() => {
    if (phase === 'shown') sendEventBeacon('intro-shown', { once: true });
  }, [phase]);

  if (!FORCE_INTRO && phase === 'shown' && totalPlaced > 0) setPhase('collapsing');

  useEffect(() => {
    if (phase !== 'collapsing') return;
    if (!FORCE_INTRO) markIntroSeen();
    const t = setTimeout(() => setPhase('gone'), COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useLayoutEffect(() => {
    if (phase !== 'collapsing') return;
    const el = rootRef.current;
    const scroller = el?.closest<HTMLElement>('[data-build-scroll]');
    if (!el || !scroller) return;

    const rect = el.getBoundingClientRect();
    const cardTop = rect.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const above = scroller.scrollTop - cardTop;
    if (above <= 0) return;

    const corrected = scroller.scrollTop - Math.min(rect.height, above);
    const anchoring = scroller.style.overflowAnchor;
    scroller.style.overflowAnchor = 'none';
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
              {expandTemplate<React.ReactNode>(raw('intro.headline'), (text) => text, {
                count: () => [<span key="n" className="text-primary">{DEX_TOTAL}</span>],
              })}
            </h2>
            <p className="mt-1.5 mx-auto max-w-[26rem] text-sm text-muted-foreground text-balance">
              {t('intro.body')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
