import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { Settings, Download, Loader2 } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useViewSort, computeViewSort, buildIdToSection } from '@/hooks/useViewSort';
import { TYPE_COLORS } from '@/data/type-colors';
import type { Pokemon, TypeName } from '@/types/pokemon';
import { PageFooter } from '@/components/shared/PageFooter';
import { EffectiveCursorMarker } from '@/components/shared/EffectiveCursorMarker';
import { DragMeasureKicker } from '@/components/shared/DragMeasureKicker';
import { generateExportImage, shareOrDownload } from '@/lib/exportImage';
import { sendExportBeacon } from '@/hooks/useCompletionBeacon';
import { getEvolutionChainIds, getPokemonById } from '@/hooks/usePokemonData';
import { ViewSettingsPane } from '@/components/view/ViewSettingsPane';
import { DetailedStatsPanel, STATS_MIN_POKEMON, DEFAULT_STATS_HEIGHTS } from '@/components/view/DetailedStatsPanel';
import { useDetailedStatsData } from '@/components/view/useDetailedStatsData';
import { createEffectiveCursorCollision, createSnapCenterToPointer, dragInputIsTouch, dragPointerRef } from '@/lib/dragCollision';
import { getTypeMask, ensureTypeMask } from '@/lib/typeSymbol';
import {
  type SectionRun,
  computeSectionRuns,
  buildOutlines,
  fitLabel,
  starPath,
  outlineStrokeW,
  OUTLINE_GAP,
  OUTLINE_PAD,
  OUTLINE_HEAD,
  OUTLINE_STROKE_FRAC,
  OUTLINE_TITLE_OPACITY,
  OUTLINE_REPEAT_TITLES,
  OUTLINE_TITLE_VBIAS,
  OUTLINE_SHORTEN_TITLES,
} from '@/lib/sectionOutlines';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';

/**
 * Re-measure droppable rects on every frame during a drag. The default
 * ("WhileDragging") measures once at drag-start, which is stale the
 * moment layout shifts underneath the drag — the big offender is iOS
 * Safari collapsing its URL bar on the first touch after a page load,
 * which shifts every tile up a few px. With stale rects the snap
 * indicator pins to the pre-shift tile while the faint cursor
 * (viewport-fixed on raw pointer) keeps pointing at the actual visual
 * tile, so the two diverge on the first drag only. MeasuringStrategy
 * .Always keeps them in sync.
 */
const DND_MEASURING = {
  droppable: { strategy: MeasuringStrategy.Always },
} as const;

const COLS = 10;

// Detailed-stats column geometry, used when the stats sit to the right of the grid
// on the same canvas (at any width). The grid reflows narrower so the whole
// [grid · gap · stats] composition fits the viewport width. The gutter between dex
// and stats is derived (= one card gap), not a fixed constant — see statsGapCols.
// Width the charts are *rendered* at, in rem, before the uniform height-match scale.
// A fixed rem width (not a multiple of the tile size) keeps the chart internals at
// the width they're tuned for — ButterflyChart's chartScale floors at 1 below ~360px,
// so a tile-coupled width on mobile (tiles ≈ 21px → ~190px) squashes the deviation
// chart until its headers overlap and the "OVER-INDEXED →" header overflows. The
// value scales up with the root font on desktop, so the chart geometry tracks its
// rem-based text on every device. The block is then scaled down to the dex height.
// 19.7rem (≈315px): the type/gen charts drop their per-row label text (icon only),
// freeing the ~45px label column, so the chart bodies keep the ~295px width that was
// overlap-free at the old 360px-with-labels render while the column reads narrower.
const STATS_NATURAL_REM = 19.7;

/** Parse a `view::<id>` draggable id into its numeric pokemon id, or null. */
function parseDragId(id: string): number | null {
  if (!id.startsWith('view::')) return null;
  return Number(id.slice(6));
}

// Page-specific drag geometry. View page tiles are ~40px (10-col grid),
// roughly half the build page's ~60-80px tiles, so the overlay and
// hit-test lift are halved to match — otherwise the held line sits too
// far above the thumb. The faint cursor marker is also shortened to
// CURSOR_MARKER_HEIGHT since the view page's snap indicator (tileSize
// minus 8px padding) is likewise ~half the build page's.
const OVERLAY_LIFT_PX = 45;
const TOUCH_HIT_LIFT_PX = 90;
const CURSOR_MARKER_HEIGHT = 24;
const effectiveCursorCollision = createEffectiveCursorCollision(TOUCH_HIT_LIFT_PX);
const snapCenterToPointer = createSnapCenterToPointer(OVERLAY_LIFT_PX);

/** Pokeball SVG background with top/bottom halves colored by type, gap between halves. */
function PokeballBg({ pokemon }: { pokemon: Pokemon }) {
  const primary = TYPE_COLORS[pokemon.types[0] as TypeName];
  const secondary = TYPE_COLORS[(pokemon.types[1] ?? pokemon.types[0]) as TypeName];

  return (
    <>
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 w-full h-full opacity-[0.33] -rotate-[30deg]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 2 C10.06 2 2 10.06 2 20 L15 20 A5 5 0 0 1 25 20 L38 20 C38 10.06 29.94 2 20 2 Z"
          fill={primary}
        />
        <path
          d="M15 20 A5 5 0 0 0 25 20 L38 20 C38 29.94 29.94 38 20 38 C10.06 38 2 29.94 2 20 L15 20 Z"
          fill={secondary}
        />
      </svg>
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 w-full h-full -rotate-[30deg]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 2 C10.06 2 2 10.06 2 20 L15 20 A5 5 0 0 1 25 20 L38 20 C38 10.06 29.94 2 20 2 Z"
          fill="none"
          stroke="var(--color-background)"
          strokeWidth="3"
        />
        <path
          d="M15 20 A5 5 0 0 0 25 20 L38 20 C38 29.94 29.94 38 20 38 C10.06 38 2 29.94 2 20 L15 20 Z"
          fill="none"
          stroke="var(--color-background)"
          strokeWidth="3"
        />
        <circle cx="20" cy="20" r="4" fill="var(--color-background)" stroke="var(--color-background)" strokeWidth="3" />
      </svg>
    </>
  );
}

/** Measure container and compute square tile size that fits all items.
 *  `colFactor` / `rowFactor` are the effective column / row counts in tileSize
 *  units — they fold in inter-cell gaps and section label bands (outline mode)
 *  so the whole grid, outlines included, fits on screen without cropping. */
function useTileSize(colFactor: number, rowFactor: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tileSize, setTileSize] = useState(0);
  const factorRef = useRef({ colFactor, rowFactor });
  factorRef.current = { colFactor, rowFactor };

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // When the View tab is hidden (display:none via App's `hidden` class),
    // clientWidth/clientHeight report 0. Writing tileSize=0 on hide makes
    // every sprite shrink to nothing and then pop back on return — the
    // characteristic "white flash". Retain the last good tileSize instead.
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    const style = getComputedStyle(el);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const w = el.clientWidth - padX;
    const h = el.clientHeight - padY;
    const { colFactor: cf, rowFactor: rf } = factorRef.current;
    const size = Math.floor(Math.min(w / Math.max(cf, 1), h / Math.max(rf, 1)));
    setTileSize(size);
  }, []);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Re-fit BEFORE paint when the fit factors change (e.g. toggling section
  // outlines flips colFactor/rowFactor). A plain useEffect runs after paint, so
  // the grid would paint one frame with the new outline template (gaps + label
  // bands) at the OLD tile size — a visible jank between the two layouts.
  // useLayoutEffect applies the new tile size in the same commit, before paint.
  useLayoutEffect(() => {
    measure();
  }, [colFactor, rowFactor, measure]);

  return { containerRef, tileSize };
}

/** True once web fonts have finished loading, so canvas text measurement (used
 *  to fit section names) reflects the real Inter metrics rather than a fallback.
 *  Flips state on load to trigger a re-measure/re-render. */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(
    () => typeof document !== 'undefined' && (document as Document).fonts?.status === 'loaded',
  );
  useEffect(() => {
    if (ready || typeof document === 'undefined' || !document.fonts) return;
    let alive = true;
    document.fonts.ready.then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [ready]);
  return ready;
}

/** Generate (once) the alpha masks for the given type symbols and re-render when
 *  they're ready. Returns the set of types whose mask is now available. */
function useTypeMasks(types: TypeName[]): Set<TypeName> {
  const [, force] = useState(0);
  const keyStr = types.slice().sort().join(',');
  useEffect(() => {
    if (types.length === 0) return;
    let alive = true;
    const missing = types.filter((t) => !getTypeMask(t));
    if (missing.length === 0) return;
    Promise.all(missing.map((t) => ensureTypeMask(t).catch(() => null))).then(() => {
      if (alive) force((n) => n + 1);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr]);
  return new Set(types.filter((t) => getTypeMask(t)));
}

// ---------- Draggable tile ----------

function DraggableViewTile({
  pokemon,
  tileSize,
  positionNum,
  isDraggedLine,
  showInsertBefore,
  showInsertAfter,
}: {
  pokemon: Pokemon;
  tileSize: number;
  positionNum: number;
  isDraggedLine: boolean;
  showInsertBefore: boolean;
  showInsertAfter: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: `view::${pokemon.id}` });

  const { setNodeRef: setDropRef } = useDroppable({ id: `view::${pokemon.id}` });

  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef]
  );

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="relative overflow-visible cursor-grab active:cursor-grabbing select-none"
      style={{
        width: tileSize,
        height: tileSize,
        opacity: isDragging || isDraggedLine ? 0.25 : 1,
        // Intentionally NOT setting `touchAction: 'none'` here. The touch
        // sensor uses delay-based activation (250ms hold), which does not
        // require disabling native touch behaviours — and disabling them
        // blocks the user from vertical-scrolling the page on mobile
        // (tiles fill the entire visible area, so the only surfaces to
        // touch *are* draggable tiles). Press-and-hold still activates
        // drag; a quick finger-drag scrolls the page as expected.
        // `pinch-zoom` keeps two-finger zoom working over the grid.
        touchAction: 'pan-y pinch-zoom',
      }}
    >
      {showInsertBefore && (
        <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-full z-20 -translate-x-1/2" />
      )}
      {showInsertAfter && (
        <div className="absolute right-0 top-1 bottom-1 w-[3px] bg-primary rounded-full z-20 translate-x-1/2" />
      )}
      <PokeballBg pokemon={pokemon} />
      <span
        className="absolute top-[3px] left-[2px] z-20 leading-none font-semibold text-foreground/40 select-none"
        style={{ fontSize: tileSize * 0.12 }}
      >
        {positionNum}.
      </span>
      <img
        src={pokemon.sprite}
        alt={pokemon.name}
        className="absolute z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ imageRendering: 'pixelated', width: tileSize * 1.2 }}
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}

/** Empty grid slot: position number + faint pokeball outline. */
function EmptyPlaceholder({ tileSize, num }: { tileSize: number; num: number }) {
  return (
    <div className="relative" style={{ width: tileSize, height: tileSize }}>
      <span
        className="absolute top-[3px] left-[2px] z-20 leading-none font-semibold text-foreground/30 select-none"
        style={{ fontSize: tileSize * 0.12 }}
      >
        {num}.
      </span>
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-[10%] w-[80%] h-[80%] text-muted-foreground/15 -rotate-[30deg]"
      >
        <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="1" y1="12" x2="8.5" y2="12" stroke="currentColor" strokeWidth="1.5" />
        <line x1="15.5" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
    </div>
  );
}

function StaticViewTile({ pokemon, tileSize }: { pokemon: Pokemon; tileSize: number }) {
  return (
    <div className="relative overflow-visible" style={{ width: tileSize, height: tileSize }}>
      <PokeballBg pokemon={pokemon} />
      <img
        src={pokemon.sprite}
        alt={pokemon.name}
        className="absolute z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ imageRendering: 'pixelated', width: tileSize * 1.2 }}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </div>
  );
}

// ---------- Section outlines (geometry in src/lib/sectionOutlines.ts) ----------

function SectionOverlays({
  runs,
  cols,
  tileSize,
  startRows,
  headroom,
  gap,
  pad,
  totalHeight,
  offsetLeft = 0,
  lastRow = null,
}: {
  runs: SectionRun[];
  cols: number;
  tileSize: number;
  startRows: Set<number>;
  headroom: number;
  gap: number;
  pad: number;
  totalHeight: number;
  offsetLeft?: number;
  lastRow?: { index: number; count: number; offsetCols: number } | null;
}) {
  const { shapes, spandrels } = buildOutlines(runs, cols, tileSize, startRows, headroom, gap, pad, OUTLINE_TITLE_VBIAS, lastRow, OUTLINE_STROKE_FRAC);
  const width = cols * tileSize + (cols - 1) * gap;
  const fontSize = tileSize * 0.26;
  const strokeW = outlineStrokeW(tileSize, OUTLINE_STROKE_FRAC);
  const dotTail = 6 * strokeW;
  // Generate the type-symbol masks the visible spandrels need; until a mask is
  // ready that spandrel falls back to the 4-point star.
  const spandrelTypes = useMemo(
    () => [...new Set(spandrels.map((s) => s.type).filter((t): t is TypeName => t !== null))],
    [spandrels],
  );
  const readyTypes = useTypeMasks(spandrelTypes);
  // Re-measure labels once the real font is loaded (canvas metrics depend on it).
  const fontsReady = useFontsReady();

  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{ left: offsetLeft, width, height: totalHeight }}
    >
      <svg width={width} height={totalHeight} style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          {shapes.map((s) => {
            if (!s.open) return null;
            // Fill fades over the same horizontal span the three dots cover.
            const fadeW = dotTail;
            const right = s.open.side === 'right';
            const gx1 = right ? s.open.x1 - fadeW : s.open.x0 + fadeW;
            const gx2 = right ? s.open.x1 : s.open.x0;
            return (
              <linearGradient
                key={`g-${s.key}`}
                id={`outline-fade-${s.key}`}
                gradientUnits="userSpaceOnUse"
                x1={gx1} y1={0} x2={gx2} y2={0}
              >
                <stop offset="0%" stopColor={s.fillColor} stopOpacity={1} />
                <stop offset="100%" stopColor={s.fillColor} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        {shapes.map((s) => (
          <path
            key={`fill-${s.key}`}
            d={s.fill}
            fill={s.open ? `url(#outline-fade-${s.key})` : `${s.fillColor}12`}
            fillOpacity={s.open ? 0.07 : 1}
            fillRule="evenodd"
            stroke="none"
          />
        ))}
        {shapes.map((s) => (
          <path
            key={`stroke-${s.key}`}
            d={s.stroke}
            fill="none"
            stroke={s.strokeColor}
            strokeOpacity={0.2}
            strokeWidth={strokeW}
            strokeLinejoin="round"
            // Round caps. The open stroke's path is lengthened by half a stroke
            // width (see roundRectStroke calls) so the rounded cap's tip lands
            // exactly at the intended edge — extending the end, not past it —
            // keeping the three dot gaps even.
            strokeLinecap="round"
          />
        ))}
        {shapes.map((s) => {
          const open = s.open;
          if (!open) return null;
          // Dotted tail: dot/space rhythm of one stroke-width each. Centre i sits
          // (0.5 + 2i)·W inward, so dot 0's outer edge lands on the old border and
          // a full space separates dot 2 from the resumed solid stroke (at 6·W).
          const edge = open.side === 'right' ? open.x1 : open.x0;
          const dir = open.side === 'right' ? -1 : 1;
          return [0, 1, 2].flatMap((i) =>
            [open.topY, open.botY].map((cy, j) => (
              <circle
                key={`dot-${s.key}-${i}-${j}`}
                cx={edge + dir * (0.5 + 2 * i) * strokeW}
                cy={cy}
                r={strokeW / 2}
                fill={s.strokeColor}
                fillOpacity={0.2}
              />
            )),
          );
        })}
        {/* Spandrels: a type symbol where its mask is ready, else a 4-point star.
            Both use the section's stroke colour at the outline-border opacity. */}
        {spandrels.map((sp) =>
          sp.type && readyTypes.has(sp.type) ? null : (
            <path key={sp.key} d={starPath(sp.cx, sp.cy, sp.r)} fill={sp.color} fillOpacity={0.2} stroke="none" />
          ),
        )}
      </svg>
      {spandrels.map((sp) => {
        if (!sp.type || !readyTypes.has(sp.type)) return null;
        const mask = getTypeMask(sp.type)!;
        // Cropped mask fills its box, so match the star's bounding box (2·r).
        const size = sp.r * 2;
        return (
          <div
            key={`icon-${sp.key}`}
            className="absolute pointer-events-none"
            style={{
              left: sp.cx - size / 2,
              top: sp.cy - size / 2,
              width: size,
              height: size,
              backgroundColor: sp.color,
              opacity: 0.2,
              WebkitMaskImage: `url(${mask})`,
              maskImage: `url(${mask})`,
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
        );
      })}
      {shapes.map((s) => {
          if (!s.label) return null;
          // "Show once" mode (repeatTitles off): suppress only the re-shown title
          // on the continuation half of a single wrapped run. Separate runs of a
          // section — recurring because of ordering — each keep their own title.
          if (!OUTLINE_REPEAT_TITLES && s.isContinuation) return null;
          // Fit the name to its outline: stretch/squash, fall back to shorter
          // names, else squash to fit exactly.
          // (fontsReady is read so the result re-measures once the font loads.)
          const alts = OUTLINE_SHORTEN_TITLES ? s.labelAlts : [s.labelAlts[0]];
          const fit = fontsReady
            ? fitLabel(alts, s.labelMaxW, fontSize)
            : { text: alts[0], scaleX: 1 };
          return (
            <div
              key={`label-${s.key}`}
              className="absolute leading-none font-black uppercase select-none whitespace-nowrap"
              style={{
                left: s.labelX,
                top: s.labelY,
                transform: `translateY(-50%) scaleX(${fit.scaleX})`,
                transformOrigin: 'left center',
                fontSize,
                color: s.strokeColor,
                opacity: OUTLINE_TITLE_OPACITY,
              }}
            >
              {fit.text}
            </div>
          );
        })}
    </div>
  );
}

// ---------- Main page ----------

export function ViewPage() {
  const sections = usePokedexStore((s) => s.sections);
  const sortOption = usePokedexStore((s) => s.viewSortOption);
  const groupSpecialAtEnd = usePokedexStore((s) => s.viewGroupSpecialAtEnd);
  const customOrder = usePokedexStore((s) => s.viewCustomOrder);
  const setCustomOrder = usePokedexStore((s) => s.setViewCustomOrder);
  const setSortOption = usePokedexStore((s) => s.setViewSortOption);
  const reorderSection = usePokedexStore((s) => s.reorderSection);

  const showSections = usePokedexStore((s) => s.viewShowSections);
  const showStats = usePokedexStore((s) => s.viewShowStats);

  const sorted = useViewSort(sections, sortOption, groupSpecialAtEnd, customOrder);
  const count = sorted.length;
  const totalSlots = Math.max(count, 151);

  // Build-section outlines overlay: shown when the user enables it, in build order.
  const showSectionOverlays = showSections && sortOption === 'build-order';

  // Detailed-stats side panel: needs enough Pokémon to be useful. Locked
  // presentation: the grid on a raised card and each chart on its own card with
  // the title inside ('card-title-in'), with type-name badges.
  const showStatsPanel = showStats && count >= STATS_MIN_POKEMON;
  const statsAsCards = showStatsPanel;
  // Stats data (single source of truth shared with the native export renderer).
  const statsData = useDetailedStatsData();

  // Section geometry + the effective grid sizing factors. In outline mode the
  // grid gains inter-cell gaps and per-section label bands; folding those into
  // colFactor/rowFactor lets useTileSize shrink the tiles so the whole spaced
  // grid (outlines included) still fits on screen.
  const layout = useMemo(() => {
    const lastRowCount = totalSlots % COLS || COLS;
    const gridSlots = totalSlots - lastRowCount;
    const gridPokemon = sorted.slice(0, gridSlots);
    const lastRowPokemon = sorted.slice(gridSlots);
    const totalRows = Math.ceil(totalSlots / COLS);
    const lastRowIndex = totalRows - 1;
    const lastRowOffsetCols = (COLS - lastRowCount) / 2;
    // The centered overflow row only needs special junction handling when it is
    // actually narrower than the grid (offset > 0); a full last row is uniform.
    const lastRowGeom = showSectionOverlays && lastRowOffsetCols > 0
      ? { index: lastRowIndex, count: lastRowCount, offsetCols: lastRowOffsetCols }
      : null;
    // One run list across the whole grid, so a section reaching into the centered
    // last row is a single run that can connect to the cells above it.
    const allRuns = showSectionOverlays ? computeSectionRuns(sorted, sections, COLS) : [];

    // Does a centered-last-row run's bottom x-overlap the cells above it? (Mirror
    // of buildOutlines.lastRowConnects — drives band reservation below.)
    const lastConnects = (r: SectionRun) => {
      const topLeftCol = r.firstRow === lastRowIndex - 1 ? r.firstCol : 0;
      return lastRowOffsetCols + r.lastCol + 1 >= topLeftCol;
    };
    // Rows carrying a label band: each section's first row always (its title is
    // always drawn). A *continuation* row — the re-shown row of a ≤9 grid
    // open-wrap, or a disconnected centered continuation — only earns a band when
    // its title is actually re-drawn (repeatTitles); otherwise the band would be
    // empty wasted space. (A connected junction never has a band — it flows as
    // one shape.)
    const bandRows = new Set<number>();
    for (const r of allRuns) {
      bandRows.add(r.firstRow);
      if (!OUTLINE_REPEAT_TITLES) continue;
      if (r.lastRow !== lastRowIndex) {
        if (r.lastRow - r.firstRow === 1 && r.firstCol > r.lastCol + 1) bandRows.add(r.lastRow);
      } else if (lastRowGeom && r.firstRow < lastRowIndex && !lastConnects(r)) {
        bandRows.add(lastRowIndex);
      }
    }
    const gridStartRows = new Set([...bandRows].filter((r) => r < lastRowIndex));
    const lastRowStartRows = new Set([...bandRows].filter((r) => r === lastRowIndex));
    const numStartRows = bandRows.size;
    // Fold the uniform gaps, label bands, and the outline's outer `pad` overhang
    // (it sticks `pad` past the grid edges on every side) into the fit factors.
    const colFactor = showSectionOverlays
      ? COLS + (COLS - 1) * OUTLINE_GAP + 2 * OUTLINE_PAD
      : COLS;
    const rowFactor = showSectionOverlays
      ? totalRows + Math.max(totalRows - 1, 0) * OUTLINE_GAP + numStartRows * OUTLINE_HEAD + 2 * OUTLINE_PAD
      : totalRows;
    return {
      lastRowCount, gridSlots, gridPokemon, lastRowPokemon,
      allRuns, lastRowGeom, gridStartRows, lastRowStartRows,
      colFactor, rowFactor, totalRows,
    };
  }, [sorted, totalSlots, showSectionOverlays, sections]);

  // The detailed-stats column always sits to the right of the grid on the same
  // canvas (at any width). Its width is folded into the tile-fit, so the whole
  // [grid | gap | stats] composition scales to fit the viewport at once. The
  // charts are rendered at a fixed rem width (STATS_NATURAL_REM) then uniformly
  // scaled down to the dex's reference height. Only the *scaled* footprint is
  // reserved — and that footprint, in grid columns, is just the stats' aspect
  // ratio × the reference-row height (both tileSize-independent), so the layout
  // settles without the old scale↔tileSize feedback loop.
  const [statsNatural, setStatsNatural] = useState({ w: 0, h: 0 });
  // Prior frame's tile size — used only to express the cards' rem-based padding in
  // grid-column units (rem and tiles are independent scales, so this can't be done
  // analytically). Only matters in card mode; the container is stable, so it settles
  // in one extra frame.
  const [tilePx, setTilePx] = useState(0);
  // Gate the stats panel's visibility until its size has settled after being
  // toggled on. On enable, tileSize jumps from its stats-off value down to the
  // stats-on value as the fit loop converges; revealing before then flashes the
  // panel oversized. We only ever set this TRUE (reset to false when the panel is
  // off), so window resizes — which keep it true — never re-hide / blink it.
  const [statsRevealed, setStatsRevealed] = useState(false);
  const statsContentRef = useRef<HTMLDivElement>(null);
  const statsBesideGrid = showStatsPanel;

  // Height of the dex grid in *tile units* (tileSize-independent), folding in the
  // outline gaps/label bands when overlays are on. Matches the actual rendered row
  // count (totalRows = max(count,151)/COLS, so ≥16) — not a fixed constant — so the
  // stats stay height-matched to the dex card even past 151.
  const dexRefRowsFactor = useMemo(() => {
    const rows = layout.totalRows;
    const allStart = new Set<number>([...layout.gridStartRows, ...layout.lastRowStartRows]);
    const bands = [...allStart].filter((r) => r < rows).length;
    return rows + (showSectionOverlays ? bands * OUTLINE_HEAD + Math.max(rows - 1, 0) * OUTLINE_GAP : 0);
  }, [showSectionOverlays, layout.totalRows, layout.gridStartRows, layout.lastRowStartRows]);

  // In card mode the stats are matched to the dex *card* (grid + p-3 top/bottom
  // padding), not the bare grid, so the card edges line up top and bottom. p-3 =
  // 0.75rem, so the card adds 1.5rem on each axis. Root font px is recovered from the
  // fixed-rem natural-width measurement; the per-axis padding in columns needs the
  // tile size (rem↔tile), taken from the prior frame.
  const rootFontPx = statsNatural.w > 0 ? statsNatural.w / STATS_NATURAL_REM : 0;
  const cardPadPx = statsAsCards ? 1.5 * rootFontPx : 0;
  const cardPadCols = statsAsCards && tilePx > 0 ? cardPadPx / tilePx : 0;

  // Stats footprint in grid columns: aspect (w/h) × target-height-in-tiles. Aspect is
  // rootFont-independent (both natural w and h scale with the root font), so this is
  // stable across zoom/device. Falls back to a typical aspect until first measured.
  const statsAspect = statsNatural.h > 0 ? statsNatural.w / statsNatural.h : 0.4;
  const statsTileCols = statsBesideGrid ? statsAspect * (dexRefRowsFactor + cardPadCols) : 0;
  // Gutter between dex and stats = one card gap (gap-4 = 1rem, scaled), so it equals
  // the vertical gap between the stacked stats cards: (1rem / STATS_NATURAL_REM rem)
  // of the stats' displayed width = statsTileCols / STATS_NATURAL_REM columns.
  const statsGapCols = statsBesideGrid ? statsTileCols / STATS_NATURAL_REM : 0;
  // The dex card's own left/right padding (content-box) also needs reserving.
  const dexCardCols = statsAsCards ? cardPadCols : 0;
  const statsColFactor = statsBesideGrid ? statsGapCols + statsTileCols : 0;

  // The stats column is folded into the grid fit ONLY once the panel is revealed
  // (settled). During the settle the grid fits alone (the hidden panel is taken
  // out of flow), so the grid keeps a stable size instead of wobbling as the fit
  // converges; when revealed, the reservation applies and the dex shifts left as
  // the stats slide in — one clean transition.
  const reserveStats = statsRevealed ? dexCardCols + statsColFactor : 0;
  const { containerRef, tileSize } = useTileSize(layout.colFactor + reserveStats, layout.rowFactor);

  // useLayoutEffect (not useEffect): tilePx feeds cardPadCols → statsColFactor →
  // tileSize, a small fixed-point loop. Running it before paint lets the whole
  // stats fit (incl. statsScale) converge in one pre-paint pass when the panel is
  // toggled on — otherwise tileSize jumps from its stats-off (large) value to the
  // stats-on value across a few painted frames, flashing the panel huge first.
  useLayoutEffect(() => {
    if (tileSize !== tilePx) setTilePx(tileSize);
  }, [tileSize, tilePx]);

  // The target height the stats stack is scaled to match: the dex card in card mode
  // (so top/bottom edges align), or the bare 16-row grid otherwise. The display width
  // follows from the uniform scale (capped at 1 — only ever shrink).
  const dexRefHeight = statsBesideGrid && tileSize > 0 ? dexRefRowsFactor * tileSize : 0;
  const statsTargetHeight = dexRefHeight > 0 ? dexRefHeight + cardPadPx : 0;
  // Uniform scale to fit the panel's natural height to the dex card height. NOT
  // capped at 1 — the panel must scale UP as well as down so its cards reach the
  // full dex-card height (the natural 3-card stack is shorter than a 16-row dex).
  // The charts are SVG/text, so scaling up stays crisp.
  const statsScale = statsNatural.h > 0 ? statsTargetHeight / statsNatural.h : 1;
  const statsDisplayW = statsNatural.w > 0 ? statsNatural.w * statsScale : statsTileCols * tileSize;

  // Measure the stats' natural (unscaled) box; ResizeObserver reports the layout
  // box, which a CSS transform does not affect — so this is stable. The natural
  // width is a fixed rem value, so its height (hence the aspect) settles at once.
  //
  // useLayoutEffect (not useEffect) so the first measurement + scale are applied
  // BEFORE the browser paints — otherwise the panel briefly paints at scale 1
  // (full natural size, oversized text) for one frame before shrinking, which
  // reads as a flicker when arriving on the View page.
  useLayoutEffect(() => {
    const el = statsContentRef.current;
    if (!el) return;
    const measure = () =>
      setStatsNatural((prev) =>
        prev.w === el.offsetWidth && prev.h === el.offsetHeight
          ? prev
          : { w: el.offsetWidth, h: el.offsetHeight },
      );
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [statsBesideGrid, showStatsPanel]);

  // Hide-until-settled gate for the stats panel (prevents the toggle-on size
  // flash). When the panel is toggled on, tileSize jumps from its stats-off value
  // down to the stats-on value over a few frames as the fit loop converges; the
  // panel mirrors tileSize, so revealing before then flashes it oversized. We
  // can't use "tilePx === tileSize" — both already match (at the stale stats-off
  // value) on the enable frame. Instead, on each enable, stay hidden and reveal
  // only once tileSize has held steady for two consecutive animation frames
  // (i.e. the fit has actually converged to the stats-on value). The off-reset
  // (init false + reset whenever the panel is off) guarantees the first painted
  // frame after an enable is already hidden. Reveal-only, so resizes don't blink.
  const tileSizeRef = useRef(tileSize);
  tileSizeRef.current = tileSize;
  const statsShownRef = useRef(false);
  useEffect(() => {
    const wasShown = statsShownRef.current;
    statsShownRef.current = showStatsPanel;
    if (!showStatsPanel) {
      setStatsRevealed(false);
      return;
    }
    if (wasShown) return; // already shown (e.g. a resize-driven re-run); leave revealed
    setStatsRevealed(false);
    // Reveal once tileSize has CHANGED from its value at enable-time and then held
    // steady for two frames. The oversized scale comes from the stale (stats-off)
    // tileSize, which can sit "stable" for several frames before the fit recomputes
    // — so plain stability isn't enough; we must wait for it to move off that stale
    // value first. A frame cap reveals anyway if the size legitimately never
    // changes (e.g. a height-constrained viewport, where there's no flash).
    let raf = 0;
    let baseline = -1;
    let last = -1;
    let stable = 0;
    let frames = 0;
    const tick = () => {
      const t = tileSizeRef.current;
      if (baseline < 0) baseline = t;
      stable = t > 0 && t === last ? stable + 1 : 0;
      last = t;
      frames += 1;
      if ((t > 0 && t !== baseline && stable >= 2) || frames >= 10) {
        setStatsRevealed(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [showStatsPanel]);

  const [exporting, setExporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hasCustom = customOrder !== null;

  // Drag state
  const [dragLineIds, setDragLineIds] = useState<number[] | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'left' | 'right'>('left');
  // Effective cursor position — raw mouse on desktop, or
  // (thumb.x, thumb.y − TOUCH_HIT_LIFT_PX) on touch. Rendered as a faint
  // marker during drag so the user can see where the hit-test actually
  // lives, distinct from the strong red indicator that shows where the
  // drop will land if released.
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } });
  const sensors = useSensors(mouseSensor, touchSensor);

  const resetDragState = useCallback(() => {
    setDragLineIds(null);
    setOverId(null);
    setDropSide('left');
    dragInputIsTouch.current = false;
    dragPointerRef.current = null;
    setCursorPos(null);
  }, []);

  // Current visible order (flat list of IDs) — our source of truth for drag ops.
  const visibleIds = useMemo(() => sorted.map((p) => p.id), [sorted]);

  /** Full evolution-chain bundle members for a pokemon, restricted to those
   *  currently visible, ordered by their on-screen position. Includes all
   *  branches of the chain (Wurmple → Silcoon, Cascoon, Beautifly, Dustox),
   *  so a branched family is treated as one atomic unit. */
  const bundleVisible = useCallback(
    (pokemonId: number): number[] => {
      const chainSet = new Set(getEvolutionChainIds(pokemonId));
      return visibleIds.filter((id) => chainSet.has(id));
    },
    [visibleIds],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const pid = parseDragId(event.active.id as string);
    if (pid === null) return;
    setDragLineIds(bundleVisible(pid));
    dragInputIsTouch.current = event.activatorEvent instanceof TouchEvent;
  }, [bundleVisible]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    // Update the faint effective-cursor marker — the hit-test point on
    // touch is lifted above the thumb by TOUCH_HIT_LIFT_PX; on desktop
    // it's the raw mouse.
    const rawPtr = dragPointerRef.current;
    if (rawPtr) {
      setCursorPos({
        x: rawPtr.x,
        y: rawPtr.y - (dragInputIsTouch.current ? TOUCH_HIT_LIFT_PX : 0),
      });
    }

    // Update overId atomically with dropSide. If we split this across
    // onDragOver (setOverId) and onDragMove (setDropSide), React renders
    // once with the NEW overId but STALE dropSide — causing the indicator
    // to flash at the wrong edge of the new bundle before correcting.
    setOverId(event.over ? (event.over.id as string) : null);

    if (!event.over) return;
    const targetPid = parseDragId(event.over.id as string);
    if (targetPid === null) return;
    if (dragLineIds && dragLineIds.includes(targetPid)) return;

    const target = getPokemonById(targetPid);
    if (!target) return;

    // dropSide is computed every move from raw pointer X vs the bundle's
    // full horizontal extent. The pointer X comes from dragPointerRef
    // (stashed by the collision detector — the authoritative source dnd-kit
    // uses to resolve event.over). The bundle extent is computed from the
    // full contiguous row span of bundle members, so hovering any tile in
    // a 3-, 4-, or N-chain splits cleanly at the bundle's true midpoint.
    const ptr = dragPointerRef.current;
    if (!ptr) return;
    const px = ptr.x;

    const targetRect = event.over.rect;
    const bundle = bundleVisible(targetPid);
    let bundleLeft: number;
    let bundleRight: number;

    if (bundle.length <= 1) {
      bundleLeft = targetRect.left;
      bundleRight = targetRect.left + targetRect.width;
    } else {
      // Find the contiguous run of bundle members on the target's row.
      // If the chain wraps to a second row, we want the run containing the
      // target — not a shorter prefix/suffix that would bias the midpoint.
      const targetIdx = visibleIds.indexOf(targetPid);
      const targetRow = Math.floor(targetIdx / COLS);
      const tw = targetRect.width;
      const targetCol = targetIdx % COLS;

      const bundleIdxSet = new Set(
        bundle.map((id) => visibleIds.indexOf(id)).filter((idx) => idx >= 0),
      );

      // Walk left from target while each successive column still contains
      // a bundle member. Same going right.
      let leftCol = targetCol;
      while (leftCol > 0 && bundleIdxSet.has(targetRow * COLS + (leftCol - 1))) {
        leftCol--;
      }
      let rightCol = targetCol;
      while (
        rightCol < COLS - 1 &&
        bundleIdxSet.has(targetRow * COLS + (rightCol + 1))
      ) {
        rightCol++;
      }

      bundleLeft = targetRect.left - (targetCol - leftCol) * tw;
      bundleRight = targetRect.left + tw + (rightCol - targetCol) * tw;
    }

    const bundleCenterX = (bundleLeft + bundleRight) / 2;
    setDropSide(px < bundleCenterX ? 'left' : 'right');
  }, [dragLineIds, bundleVisible, visibleIds]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { over } = event;

    if (!over || !dragLineIds) { resetDragState(); return; }

    const targetPid = parseDragId(over.id as string);
    if (targetPid === null || dragLineIds.includes(targetPid)) { resetDragState(); return; }

    // Build the base array we're mutating: the current visible order.
    const base = [...visibleIds];
    const dragSet = new Set(dragLineIds);

    // Remove the dragged bundle from the base; track positions for insertion.
    const withoutDragged = base.filter((id) => !dragSet.has(id));

    // Resolve target bundle within the base (pre-removal). Full chain —
    // all branches — so inserting "after" goes after the last branch
    // member, not inside the chain.
    const targetBundle = bundleVisible(targetPid);
    const targetFirst = targetBundle[0];
    const targetLast = targetBundle[targetBundle.length - 1];

    let insertIdx: number;
    if (dropSide === 'right') {
      const lastIdx = withoutDragged.indexOf(targetLast);
      insertIdx = lastIdx >= 0 ? lastIdx + 1 : withoutDragged.length;
    } else {
      const firstIdx = withoutDragged.indexOf(targetFirst);
      insertIdx = firstIdx >= 0 ? firstIdx : withoutDragged.length;
    }

    withoutDragged.splice(insertIdx, 0, ...dragLineIds);
    const newOrder = withoutDragged;

    // In build order, a drag that stays within a single section occurrence keeps
    // build order (it just reorders that build group); anything else falls
    // through to custom. We detect "stays within the occurrence" by construction:
    // reorder only the dragged bundle's own build group to match the new visual
    // order, then re-run the build-order sort. If it reproduces `newOrder`
    // exactly, the move was representable in build order (same section, same
    // occurrence) and we apply it as a section reorder. If not — a cross-section
    // drop, or a jump to a *different* occurrence of the same section (e.g.
    // tundra-1 → tundra-2, which build order can't express because the dragged
    // pokemon's bucket is fixed by its category) — we break to custom as before.
    if (sortOption === 'build-order') {
      const idToSection = buildIdToSection(sections);
      const groupId = idToSection.get(dragLineIds[0]);
      const allSameSection =
        groupId !== undefined && dragLineIds.every((id) => idToSection.get(id) === groupId);
      if (groupId && allSameSection) {
        const newGroupOrder = newOrder.filter((id) => idToSection.get(id) === groupId);
        const candidate = { ...sections, [groupId]: newGroupOrder };
        const predicted = computeViewSort(candidate, 'build-order', groupSpecialAtEnd, null).map((p) => p.id);
        if (predicted.length === newOrder.length && predicted.every((id, i) => id === newOrder[i])) {
          reorderSection(groupId, newGroupOrder);
          resetDragState();
          return;
        }
      }
    }

    setCustomOrder(newOrder);
    if (sortOption !== 'custom') setSortOption('custom');

    resetDragState();
  }, [dragLineIds, visibleIds, bundleVisible, dropSide, sortOption, sections, groupSpecialAtEnd, reorderSection, setCustomOrder, setSortOption, resetDragState]);

  const handleDragCancel = useCallback(resetDragState, [resetDragState]);

  const insertIndicator = useMemo<{ pokemonId: number | null; side: 'left' | 'right' }>(() => {
    if (!overId || !dragLineIds) return { pokemonId: null, side: 'left' };
    const targetPid = parseDragId(overId);
    if (targetPid === null || dragLineIds.includes(targetPid)) return { pokemonId: null, side: 'left' };

    const bundle = bundleVisible(targetPid);
    if (bundle.length === 0) return { pokemonId: null, side: 'left' };

    if (dropSide === 'right') {
      return { pokemonId: bundle[bundle.length - 1], side: 'right' };
    }
    return { pokemonId: bundle[0], side: 'left' };
  }, [overId, dragLineIds, bundleVisible, dropSide]);

  const handleExport = useCallback(async () => {
    if (exporting || sorted.length === 0) return;
    setExporting(true);
    // Fire the export beacon up front. On iOS the share sheet ("Save Image")
    // suspends the page, and a sendBeacon issued after navigator.share resolves
    // often never leaves the device — so record the export before opening it.
    sendExportBeacon(sorted.map((p) => p.id), {
      sort: sortOption,
      outlines: showSectionOverlays,
      groupSpecial: groupSpecialAtEnd,
      showStats: showStatsPanel,
    });
    try {
      // The detailed-stats panel is redrawn natively onto the export canvas (see
      // exportStats.ts) — NOT rasterized from the DOM. html-to-image relies on an
      // SVG <foreignObject>, which hangs/poisons the export on iOS WebKit; native
      // canvas drawing is the same reliable mechanism the grid uses.
      const blob = await generateExportImage(sorted, {
        sections: showSectionOverlays ? sections : null,
        stats: showStatsPanel ? { data: statsData, heights: DEFAULT_STATS_HEIGHTS } : null,
      });
      await shareOrDownload(blob, `my151.png`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [sorted, exporting, showSectionOverlays, sections, sortOption, groupSpecialAtEnd, showStatsPanel, statsData]);

  const dragOverlayPokemon = dragLineIds
    ? dragLineIds.map((id) => sorted.find((p) => p.id === id)).filter((p): p is Pokemon => !!p)
    : [];

  const dragSet = useMemo(() => new Set(dragLineIds ?? []), [dragLineIds]);

  return (
    <div className="h-full flex relative">
      {/* Main grid column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-3 sm:px-6 py-2 border-b h-11">
          <h2 className="text-2xl font-extrabold tracking-tight leading-none">
            <span className="text-primary">{count}</span>
            <span className="text-foreground">/151</span>
          </h2>
          <div className="flex items-center gap-1">
            <button type="button"
              onClick={handleExport}
              disabled={exporting || count === 0}
              className="p-1.5 rounded-md border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-primary"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
            <button type="button"
              onClick={() => setSettingsOpen(true)}
              className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              aria-label="View settings"
            >
              <Settings className="w-4 h-4" />
              {hasCustom && (
                <span
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary"
                  aria-label="Custom order active"
                />
              )}
            </button>
          </div>
        </div>

        {/* px-4 (not p-2): overflow-y-auto forces overflow-x to clip, so the extra
            horizontal padding gives the cards' soft shadows room before that clip.
            pb-8: comfortable breathing room below the footer/cards at the bottom of
            the scroll (py-2 alone left it jammed against the page edge). */}
        <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-8">
          <div className={statsBesideGrid ? 'flex flex-row items-start justify-center' : 'flex flex-col items-center'}>
          {tileSize > 0 && (() => {
            const {
              lastRowCount, gridSlots, gridPokemon, lastRowPokemon,
              allRuns, lastRowGeom, gridStartRows, lastRowStartRows,
            } = layout;
            const allStartRows = new Set<number>([...gridStartRows, ...lastRowStartRows]);
            const gridEmpties = Math.max(0, gridSlots - gridPokemon.length);
            const lastRowEmpties = Math.max(0, lastRowCount - lastRowPokemon.length);

            // Outline mode adds a single uniform gap between cells and a label
            // band above each section's first row (tiles bottom-align, so the
            // band sits on top). All zero when overlays are off.
            const gap = showSectionOverlays ? tileSize * OUTLINE_GAP : 0;
            const pad = showSectionOverlays ? tileSize * OUTLINE_PAD : 0;
            const headroom = showSectionOverlays ? tileSize * OUTLINE_HEAD : 0;
            const gridWidth = COLS * tileSize + (COLS - 1) * gap;

            const totalGridRows = Math.ceil(gridSlots / COLS);
            const gridRowTemplate = showSectionOverlays
              ? Array.from({ length: totalGridRows }, (_, r) =>
                  gridStartRows.has(r) ? `${headroom + tileSize}px` : `${tileSize}px`
                ).join(' ')
              : undefined;
            const gridBlockHeight =
              totalGridRows * tileSize + gridStartRows.size * headroom + Math.max(totalGridRows - 1, 0) * gap;
            const lastRowHeight = tileSize + (lastRowStartRows.size > 0 ? headroom : 0);

            const renderTile = (pokemon: Pokemon, positionNum: number) => (
              <DraggableViewTile
                key={pokemon.id}
                pokemon={pokemon}
                tileSize={tileSize}
                positionNum={positionNum}
                isDraggedLine={dragSet.has(pokemon.id)}
                showInsertBefore={insertIndicator.pokemonId === pokemon.id && insertIndicator.side === 'left'}
                showInsertAfter={insertIndicator.pokemonId === pokemon.id && insertIndicator.side === 'right'}
              />
            );

            return (
              <DndContext
                sensors={sensors}
                collisionDetection={effectiveCursorCollision}
                modifiers={[snapCenterToPointer]}
                measuring={DND_MEASURING}
                autoScroll={{ layoutShiftCompensation: false }}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <div
                  style={{
                    width: gridWidth,
                    // Gate the dex-card chrome on statsRevealed (not showStatsPanel)
                    // so the card appears in the SAME step as the stats cards, not a
                    // frame earlier — one transition instead of two.
                    boxSizing: statsRevealed ? 'content-box' : undefined,
                    // Match the stats cards' *visual* corner radius: they use
                    // rounded-lg (var(--radius)) but are scaled by statsScale, so
                    // the unscaled dex card needs the same radius pre-multiplied.
                    borderRadius: statsRevealed ? `calc(var(--radius) * ${statsScale})` : undefined,
                  }}
                  className={statsRevealed ? 'bg-card shadow-elevated p-3' : ''}
                >
                  {/* Grid + centered overflow row share one relative box so a
                      single overlay can draw outlines that span the boundary.
                      In card mode the box is content-box so the card's padding
                      sits OUTSIDE the grid — otherwise it would shrink gridWidth
                      and the centered last row would mis-align with its outline. */}
                  <div className="relative">
                    <div
                      className="grid items-end"
                      style={{
                        gridTemplateColumns: `repeat(${COLS}, ${tileSize}px)`,
                        columnGap: gap,
                        rowGap: gap,
                        ...(gridRowTemplate
                          ? { gridTemplateRows: gridRowTemplate }
                          : { gridAutoRows: `${tileSize}px` }),
                      }}
                    >
                      {gridPokemon.map((p, i) => renderTile(p, i + 1))}
                      {gridEmpties > 0 &&
                        Array.from({ length: gridEmpties }, (_, i) => (
                          <EmptyPlaceholder key={`empty-${i}`} tileSize={tileSize} num={gridPokemon.length + i + 1} />
                        ))}
                    </div>
                    {lastRowPokemon.length + lastRowEmpties > 0 && (
                      <div
                        className="flex justify-center items-end"
                        style={{ height: lastRowHeight, columnGap: gap, marginTop: gap }}
                      >
                        {lastRowPokemon.map((p, i) => renderTile(p, gridSlots + i + 1))}
                        {lastRowEmpties > 0 &&
                          Array.from({ length: lastRowEmpties }, (_, i) => (
                            <EmptyPlaceholder key={`empty-last-${i}`} tileSize={tileSize} num={gridSlots + lastRowPokemon.length + i + 1} />
                          ))}
                      </div>
                    )}
                    {allRuns.length > 0 && (
                      <SectionOverlays
                        runs={allRuns}
                        cols={COLS}
                        tileSize={tileSize}
                        startRows={allStartRows}
                        headroom={headroom}
                        gap={gap}
                        pad={pad}
                        totalHeight={gridBlockHeight + (lastRowPokemon.length + lastRowEmpties > 0 ? gap + lastRowHeight : 0)}
                        lastRow={lastRowGeom}
                      />
                    )}
                  </div>
                </div>

                <DragOverlay dropAnimation={null}>
                  {dragOverlayPokemon.length > 0 && (
                    <div
                      className="flex absolute top-1/2 left-1/2"
                      style={{ transform: 'translate(-50%, -50%)' }}
                    >
                      {dragOverlayPokemon.map((p) => (
                        <StaticViewTile key={p.id} pokemon={p} tileSize={tileSize} />
                      ))}
                    </div>
                  )}
                </DragOverlay>
                {cursorPos && dragLineIds && (
                  <EffectiveCursorMarker x={cursorPos.x} y={cursorPos.y} height={CURSOR_MARKER_HEIGHT} />
                )}
                <DragMeasureKicker />
              </DndContext>
            );
          })()}
          {/* Detailed stats — part of the same canvas: a column to the right of
              the grid on desktop, stacked below it on mobile (no panel chrome,
              so it reads like the export). */}
          {showStatsPanel && tileSize > 0 && (
            statsBesideGrid ? (
              // Rendered at natural width, then uniformly scaled to the dex height.
              // The outer box reserves only the scaled footprint; the inner box's
              // layout size (what ResizeObserver reads) is unaffected by the scale.
              <div
                style={{
                  width: statsDisplayW || undefined,
                  height: statsTargetHeight || undefined,
                  marginLeft: statsGapCols * tileSize,
                  // Until revealed, sit out of flow (absolute) so the hidden panel
                  // doesn't reserve flex width and shift/re-fit the grid mid-settle.
                  // Its natural box is still measurable while absolute.
                  position: statsRevealed ? undefined : 'absolute',
                }}
                className="shrink-0 overflow-visible"
              >
                <div
                  ref={statsContentRef}
                  style={{
                    width: `${STATS_NATURAL_REM}rem`,
                    transform: `scale(${statsScale})`,
                    transformOrigin: 'top left',
                    // Stay hidden until the fit has settled (statsRevealed), so the
                    // panel never paints at the transient oversized scale while
                    // tileSize converges after the toggle. The layout box is still
                    // present (visibility, not display) so it can be measured.
                    visibility: statsRevealed ? undefined : 'hidden',
                  }}
                >
                  <DetailedStatsPanel />
                </div>
              </div>
            ) : (
              <div className="w-full max-w-md mt-5 px-1">
                <DetailedStatsPanel />
              </div>
            )
          )}
          </div>
          {/* Footer stays centered on the full page width — it sits outside the
              dex+stats composition so it doesn't shift left when stats slide in. */}
          <PageFooter />
        </div>
      </div>

      {/* Settings pane — docked right on desktop */}
      {settingsOpen && (
        <div className="hidden md:block md:relative md:w-[min(50%,380px)] md:h-full md:flex-shrink-0 border-l bg-background">
          <ViewSettingsPane onClose={() => setSettingsOpen(false)} />
        </div>
      )}

      {/* Settings sheet — bottom sheet on mobile (mirrors MobileSheet) */}
      {settingsOpen && <ViewSettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// ---------- Mobile bottom sheet for settings ----------

const DISMISS_THRESHOLD = 120;

function ViewSettingsSheet({ onClose }: { onClose: () => void }) {
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) {
      isDragging.current = true;
      setDragY(dy);
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > DISMISS_THRESHOLD) {
      onClose();
    } else {
      setDragY(0);
    }
    dragStartY.current = null;
    isDragging.current = false;
  }, [dragY, onClose]);

  const handleTabTap = useCallback(() => {
    if (!isDragging.current) onClose();
  }, [onClose]);

  // Keyboard dismissal for the dialog (the backdrop tap and the grab-handle
  // button cover pointer input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        style={{ opacity: Math.max(0, 1 - dragY / (DISMISS_THRESHOLD * 3)) }}
      />
      {/* Content-sized, capped to the dynamic viewport (minus a top gap) so the
          grab handle / "View Settings" header always stays on-screen and the
          sheet can be dismissed. A fixed 85vh height anchored to the bottom
          pushed the header up behind the mobile browser chrome. Matches the
          build-page filter sheet and analytics drilldown, which leave the top
          app header reachable. */}
      <div
        className="relative bg-background rounded-t-2xl shadow-2xl flex flex-col max-h-[calc(100dvh-56px)]"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
      >
        <button
          type="button"
          aria-label="Close settings"
          className="w-full flex flex-col items-center justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleTabTap}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-1" />
          <span className="text-sm font-semibold text-foreground">View Settings</span>
        </button>
        <div className="border-b" />
        <div className="flex-1 min-h-0">
          <ViewSettingsPane onClose={onClose} mobileSheet />
        </div>
      </div>
    </div>
  );
}
