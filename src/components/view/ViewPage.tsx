import { sectionGlyphMask } from '@/lib/sectionGlyph';
import { HeaderActionButton } from '@/components/ui/HeaderActionButton';
import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { useDragSensors } from '@/lib/dragSensors';
import { useDndAccessibility } from '@/lib/dndAccessibility';
import { createPortal } from 'react-dom';
import { useToolbarSlot } from '@/components/layout/toolbarSlot';
import { spriteAlt, useNamesVersion, useT } from '@/i18n';
import { Settings, Download } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useViewSort, computeViewSort, buildIdToSection } from '@/hooks/useViewSort';
import type { Pokemon } from '@/types/pokemon';
import { PageFooter } from '@/components/shared/PageFooter';
import { PokeballBg } from '@/components/shared/PokeballBg';
import { EffectiveCursorMarker } from '@/components/shared/EffectiveCursorMarker';
import { DragMeasureKicker } from '@/components/shared/DragMeasureKicker';
import { DexExportOverlay } from '@/components/export/DexExportOverlay';
import { getEvolutionChainIds, getPokemonById } from '@/hooks/usePokemonData';
import { ViewSettingsPane } from '@/components/view/ViewSettingsPane';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FollowUpHint } from '@/components/milestone/FollowUpHint';
import { DetailedStatsPanel, STATS_MIN_POKEMON } from '@/components/view/DetailedStatsPanel';
import { createEffectiveCursorCollision, createSnapCenterToPointer, dragInputIsTouch, dragPointerRef } from '@/lib/dragCollision';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
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
  DragOverlay,
  useDroppable,
  useDraggable,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import { DRAG_SOURCE_OPACITY, HeldItems } from '@/components/shared/dragHold';

const DND_MEASURING = {
  droppable: { strategy: MeasuringStrategy.Always },
} as const;

const COLS = 10;

const STATS_NATURAL_REM = 19.7;

function parseDragId(id: string): number | null {
  if (!id.startsWith('view::')) return null;
  return Number(id.slice(6));
}

const OVERLAY_LIFT_PX = 45;
const TOUCH_HIT_LIFT_PX = 90;
const CURSOR_MARKER_HEIGHT = 24;
const effectiveCursorCollision = createEffectiveCursorCollision(TOUCH_HIT_LIFT_PX);
const snapCenterToPointer = createSnapCenterToPointer(OVERLAY_LIFT_PX);

function useTileSize(colFactor: number, rowFactor: number, reserveH: number = 0) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tileSize, setTileSize] = useState(0);
  const factorRef = useRef({ colFactor, rowFactor, reserveH });
  factorRef.current = { colFactor, rowFactor, reserveH };

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    const style = getComputedStyle(el);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const w = el.clientWidth - padX;
    const { colFactor: cf, rowFactor: rf, reserveH: rh } = factorRef.current;
    const h = el.clientHeight - padY - Math.max(0, rh);
    const size = Math.max(0, Math.min(w / Math.max(cf, 1), h / Math.max(rf, 1)));
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

  useLayoutEffect(() => {
    measure();
  }, [colFactor, rowFactor, reserveH, measure]);

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
  const t = useT();
  useNamesVersion();
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: `view::${pokemon.id}`, attributes: { roleDescription: t('dnd.roleDescription') } });

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
      data-view-tile={pokemon.id}
      className="relative overflow-visible cursor-grab active:cursor-grabbing select-none"
      style={{
        width: tileSize,
        height: tileSize,
        opacity: isDragging || isDraggedLine ? DRAG_SOURCE_OPACITY : 1,
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
        alt={spriteAlt(pokemon.name, pokemon.id)}
        className="absolute z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ imageRendering: 'pixelated', width: tileSize * 1.2 }}
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}

export function EmptyPlaceholder({ tileSize, num }: { tileSize: number; num: number }) {
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

export function StaticViewTile({ pokemon, tileSize }: { pokemon: Pokemon; tileSize: number }) {
  useNamesVersion();
  return (
    <div className="relative overflow-visible" style={{ width: tileSize, height: tileSize }}>
      <PokeballBg pokemon={pokemon} />
      <img
        src={pokemon.sprite}
        alt={spriteAlt(pokemon.name, pokemon.id)}
        className="absolute z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ imageRendering: 'pixelated', width: tileSize * 1.2 }}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </div>
  );
}

export function SectionOverlays({
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
            strokeLinecap="round"
          />
        ))}
        {shapes.map((s) => {
          const open = s.open;
          if (!open) return null;
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
        {spandrels.map((sp) =>
          sectionGlyphMask(sp.sectionId) ? null : (
            <path key={sp.key} d={starPath(sp.cx, sp.cy, sp.r)} fill={sp.color} fillOpacity={0.2} stroke="none" />
          ),
        )}
      </svg>
      {spandrels.map((sp) => {
        const mask = sectionGlyphMask(sp.sectionId);
        if (!mask) return null;
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
              WebkitMaskImage: `url("${mask}")`,
              maskImage: `url("${mask}")`,
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
          if (!OUTLINE_REPEAT_TITLES && s.isContinuation) return null;
          const alts = OUTLINE_SHORTEN_TITLES ? s.labelAlts : [s.labelAlts[0]];
          const fit = fontsReady
            ? fitLabel(alts, s.labelMaxW, fontSize)
            : { text: alts[0], scaleX: 1 };
          return (
            <div
              key={`label-${s.key}`}
              data-outline-label={s.sectionId}
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

type DexBox = { left: number; top: number; width: number; height: number };

export function ViewPage() {
  const sections = usePokedexStore((s) => s.sections);
  const sortOption = usePokedexStore((s) => s.viewSortOption);
  const groupSpecialAtEnd = usePokedexStore((s) => s.viewGroupSpecialAtEnd);
  const customOrder = usePokedexStore((s) => s.viewCustomOrder);
  const setCustomOrder = usePokedexStore((s) => s.setViewCustomOrder);
  const setSortOption = usePokedexStore((s) => s.setViewSortOption);
  const reorderSection = usePokedexStore((s) => s.reorderSection);

  const showSections = usePokedexStore((s) => s.viewShowSections);
  const showStats = false;

  const sorted = useViewSort(sections, sortOption, groupSpecialAtEnd, customOrder);
  const count = sorted.length;
  const toolbarSlot = useToolbarSlot('view');
  const t = useT();
  const dndAccessibility = useDndAccessibility();
  const totalSlots = Math.max(count, 151);

  const showSectionOverlays = showSections && sortOption === 'build-order';

  const showStatsPanel = showStats && count >= STATS_MIN_POKEMON;

  const layout = useMemo(() => {
    const lastRowCount = totalSlots % COLS || COLS;
    const gridSlots = totalSlots - lastRowCount;
    const gridPokemon = sorted.slice(0, gridSlots);
    const lastRowPokemon = sorted.slice(gridSlots);
    const totalRows = Math.ceil(totalSlots / COLS);
    const lastRowIndex = totalRows - 1;
    const lastRowOffsetCols = (COLS - lastRowCount) / 2;
    const lastRowGeom = showSectionOverlays && lastRowOffsetCols > 0
      ? { index: lastRowIndex, count: lastRowCount, offsetCols: lastRowOffsetCols }
      : null;
    // The runs carry the section names in the active language. `t` changes
    // with the catalog, so a language switch rebuilds them.
    void t;
    const allRuns = showSectionOverlays ? computeSectionRuns(sorted, sections, COLS) : [];

    const lastConnects = (r: SectionRun) => {
      const topLeftCol = r.firstRow === lastRowIndex - 1 ? r.firstCol : 0;
      return lastRowOffsetCols + r.lastCol + 1 >= topLeftCol;
    };
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
  }, [sorted, totalSlots, showSectionOverlays, sections, t]);

  const [statsNatural, setStatsNatural] = useState({ w: 0, h: 0 });
  const [tilePx, setTilePx] = useState(0);
  const [statsRevealed, setStatsRevealed] = useState(false);
  const statsContentRef = useRef<HTMLDivElement>(null);
  const statsOuterRef = useRef<HTMLDivElement>(null);
  const dexCardRef = useRef<HTMLDivElement>(null);
  const frozenBoxRef = useRef<{ top: number; left: number; width: number; height: number; scale: number } | null>(null);

  const isDesktop = useViewportAtLeast(1024);
  const STATS_EXIT_FALLBACK_MS = 400;
  const isDesktopRef = useRef(isDesktop);
  isDesktopRef.current = isDesktop;
  const [statsMounted, setStatsMounted] = useState(showStatsPanel);
  useEffect(() => {
    if (showStatsPanel) {
      setStatsMounted(true);
      return;
    }
    if (!isDesktopRef.current) {
      setStatsMounted(false);
      return;
    }
    const t = setTimeout(() => setStatsMounted(false), STATS_EXIT_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [showStatsPanel]);

  const statsBesideGrid = showStatsPanel || statsMounted;
  const statsExiting = isDesktop && statsMounted && !showStatsPanel;
  const statsFreeze = statsExiting && !statsRevealed;
  const statsAsCards = statsBesideGrid;

  const dexRefRowsFactor = useMemo(() => {
    const rows = layout.totalRows;
    const allStart = new Set<number>([...layout.gridStartRows, ...layout.lastRowStartRows]);
    const bands = [...allStart].filter((r) => r < rows).length;
    return rows + (showSectionOverlays ? bands * OUTLINE_HEAD + Math.max(rows - 1, 0) * OUTLINE_GAP : 0);
  }, [showSectionOverlays, layout.totalRows, layout.gridStartRows, layout.lastRowStartRows]);

  const rootFontPx = statsNatural.w > 0 ? statsNatural.w / STATS_NATURAL_REM : 0;
  const cardPadPx = statsAsCards ? 1.5 * rootFontPx : 0;
  const cardPadCols = statsAsCards && tilePx > 0 ? cardPadPx / tilePx : 0;

  const statsAspect = statsNatural.h > 0 ? statsNatural.w / statsNatural.h : 0.4;
  const statsTileCols = statsBesideGrid ? statsAspect * (dexRefRowsFactor + cardPadCols) : 0;
  const statsGapCols = statsBesideGrid ? statsTileCols / STATS_NATURAL_REM : 0;
  const dexCardCols = statsAsCards ? cardPadCols : 0;
  const statsColFactor = statsBesideGrid ? statsGapCols + statsTileCols : 0;

  const reserveStats = statsRevealed ? dexCardCols + statsColFactor : 0;
  const { containerRef, tileSize } = useTileSize(
    layout.colFactor + reserveStats,
    layout.rowFactor,
    statsRevealed ? cardPadPx : 0,
  );

  useLayoutEffect(() => {
    if (tileSize !== tilePx) setTilePx(tileSize);
  }, [tileSize, tilePx]);

  const dexRefHeight = statsBesideGrid && tileSize > 0 ? dexRefRowsFactor * tileSize : 0;
  const statsTargetHeight = dexRefHeight > 0 ? dexRefHeight + cardPadPx : 0;
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
    if (wasShown) return;
    setStatsRevealed(false);
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

  useLayoutEffect(() => {
    if (showStatsPanel || !isDesktop) return;
    const el = statsOuterRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    frozenBoxRef.current = { top: r.top, left: r.left, width: r.width, height: r.height, scale: statsScale };
  }, [showStatsPanel, isDesktop, statsScale]);

  const measureDex = (): DexBox | null => {
    const el = dexCardRef.current;
    return el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null;
  };
  const dexFlipPending = useRef<{ from: DexBox; entering: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!isDesktop) {
      dexFlipPending.current = null;
      return;
    }
    const from = measureDex();
    if (from) dexFlipPending.current = { from, entering: showStatsPanel };
  }, [showStatsPanel, isDesktop]);
  const dexFlipRaf = useRef(0);
  useLayoutEffect(() => {
    const pending = dexFlipPending.current;
    if (!pending || !isDesktop) return;
    dexFlipPending.current = null;
    cancelAnimationFrame(dexFlipRaf.current);
    dexFlipRaf.current = requestAnimationFrame(() => {
      const el = dexCardRef.current;
      const to = measureDex();
      if (!el || !to) return;
      const dx = pending.from.left - to.left;
      const dy = pending.from.top - to.top;
      const sx = to.width ? pending.from.width / to.width : 1;
      const sy = to.height ? pending.from.height / to.height : 1;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) return;
      el.style.transformOrigin = 'top left';
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      void el.offsetWidth;
      dexFlipRaf.current = requestAnimationFrame(() => {
        const e2 = dexCardRef.current;
        if (!e2) return;
        e2.style.transition = pending.entering
          ? 'transform 280ms ease-out'
          : 'transform 220ms ease-in';
        e2.style.transform = 'translate(0px, 0px) scale(1, 1)';
        const clear = (ev: TransitionEvent) => {
          if (ev.propertyName !== 'transform') return;
          e2.style.transition = '';
          e2.style.transform = '';
          e2.style.transformOrigin = '';
          e2.removeEventListener('transitionend', clear);
        };
        e2.addEventListener('transitionend', clear);
      });
    });
  }, [statsRevealed, isDesktop]);

  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const statsHintArmed = usePokedexStore((s) => s.statsHintArmed);
  const dismissStatsHint = usePokedexStore((s) => s.dismissStatsHint);
  const exportHintArmed = usePokedexStore((s) => s.exportHintArmed);
  const dismissExportHint = usePokedexStore((s) => s.dismissExportHint);

  const hasCustom = customOrder !== null;

  const [dragLineIds, setDragLineIds] = useState<number[] | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'left' | 'right'>('left');
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const sensors = useDragSensors();

  const resetDragState = useCallback(() => {
    setDragLineIds(null);
    setOverId(null);
    setDropSide('left');
    dragInputIsTouch.current = false;
    dragPointerRef.current = null;
    setCursorPos(null);
  }, []);

  const visibleIds = useMemo(() => sorted.map((p) => p.id), [sorted]);

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
    const rawPtr = dragPointerRef.current;
    if (rawPtr) {
      setCursorPos({
        x: rawPtr.x,
        y: rawPtr.y - (dragInputIsTouch.current ? TOUCH_HIT_LIFT_PX : 0),
      });
    }

    setOverId(event.over ? (event.over.id as string) : null);

    if (!event.over) return;
    const targetPid = parseDragId(event.over.id as string);
    if (targetPid === null) return;
    if (dragLineIds && dragLineIds.includes(targetPid)) return;

    const target = getPokemonById(targetPid);
    if (!target) return;

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
      const targetIdx = visibleIds.indexOf(targetPid);
      const targetRow = Math.floor(targetIdx / COLS);
      const tw = targetRect.width;
      const targetCol = targetIdx % COLS;

      const bundleIdxSet = new Set(
        bundle.map((id) => visibleIds.indexOf(id)).filter((idx) => idx >= 0),
      );

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

    const base = [...visibleIds];
    const dragSet = new Set(dragLineIds);

    const withoutDragged = base.filter((id) => !dragSet.has(id));

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

  const openExport = useCallback(() => {
    if (sorted.length === 0) return;
    setSettingsOpen(false);
    setExportOpen(true);
  }, [sorted.length]);

  const dragOverlayPokemon = dragLineIds
    ? dragLineIds.map((id) => sorted.find((p) => p.id === id)).filter((p): p is Pokemon => !!p)
    : [];

  const dragSet = useMemo(() => new Set(dragLineIds ?? []), [dragLineIds]);

  return (
    <div className="h-full flex relative">
      <div className="flex-1 min-w-0 flex flex-col">
        {toolbarSlot && createPortal(
          <>
            <HeaderActionButton type="button"
              ref={settingsBtnRef}
              onClick={() => setSettingsOpen(true)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label={t('view.settings')}
            >
              <Settings className="w-4 h-4" />
              {hasCustom && (
                <span
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary"
                  aria-label={t('view.customOrderActive')}
                />
              )}
            </HeaderActionButton>
            <HeaderActionButton type="button"
              ref={exportBtnRef}
              onClick={openExport}
              disabled={count === 0}
              data-dex-export
              aria-label={t('export.title')}
              className="text-primary hover:bg-primary hover:text-primary-foreground disabled:hover:bg-card disabled:hover:text-primary"
            >
              <Download className="w-4 h-4" />
            </HeaderActionButton>
          </>,
          toolbarSlot,
        )}

        <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-2">
          <div className={statsBesideGrid ? 'flex flex-row items-start justify-center' : 'flex flex-col items-center'}>
          {tileSize > 0 && (() => {
            const {
              lastRowCount, gridSlots, gridPokemon, lastRowPokemon,
              allRuns, lastRowGeom, gridStartRows, lastRowStartRows,
            } = layout;
            const allStartRows = new Set<number>([...gridStartRows, ...lastRowStartRows]);
            const gridEmpties = Math.max(0, gridSlots - gridPokemon.length);
            const lastRowEmpties = Math.max(0, lastRowCount - lastRowPokemon.length);

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
                accessibility={dndAccessibility}
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
                  ref={dexCardRef}
                  style={{
                    width: gridWidth,
                    boxSizing: statsRevealed ? 'content-box' : undefined,
                    borderRadius: statsRevealed ? `calc(var(--radius) * ${statsScale})` : undefined,
                  }}
                  className={statsRevealed ? 'bg-card shadow-elevated p-3' : ''}
                >
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
                    <HeldItems>
                      {dragOverlayPokemon.map((p) => (
                        <StaticViewTile key={p.id} pokemon={p} tileSize={tileSize} />
                      ))}
                    </HeldItems>
                  )}
                </DragOverlay>
                {cursorPos && dragLineIds && (
                  <EffectiveCursorMarker x={cursorPos.x} y={cursorPos.y} height={CURSOR_MARKER_HEIGHT} />
                )}
                <DragMeasureKicker />
              </DndContext>
            );
          })()}
          {(showStatsPanel || statsMounted) && tileSize > 0 && (
            statsBesideGrid ? (() => {
              const fb = statsFreeze ? frozenBoxRef.current : null;
              return (
              <div
                ref={statsOuterRef}
                style={{
                  width: fb ? fb.width : statsDisplayW || undefined,
                  height: fb ? fb.height : statsTargetHeight || undefined,
                  marginLeft: fb ? 0 : statsGapCols * tileSize,
                  position: fb ? 'fixed' : statsRevealed ? undefined : 'absolute',
                  ...(fb ? { top: fb.top, left: fb.left, zIndex: 20 } : null),
                  ...(isDesktop
                    ? {
                        opacity: statsRevealed ? 1 : 0,
                        transform: statsRevealed ? 'translateX(0)' : 'translateX(1rem)',
                        transition: statsRevealed
                          ? 'opacity 280ms ease-out, transform 280ms ease-out'
                          : 'opacity 180ms ease-in, transform 180ms ease-in',
                      }
                    : null),
                }}
                className="shrink-0 overflow-visible"
                onTransitionEnd={(e) => {
                  if (e.propertyName === 'opacity' && !showStatsPanel) setStatsMounted(false);
                }}
              >
                <div
                  ref={statsContentRef}
                  style={{
                    width: `${STATS_NATURAL_REM}rem`,
                    transform: `scale(${fb ? fb.scale : statsScale})`,
                    transformOrigin: 'top left',
                    visibility: isDesktop ? undefined : statsRevealed ? undefined : 'hidden',
                  }}
                >
                  <DetailedStatsPanel />
                </div>
              </div>
              );
            })() : (
              <div className="w-full max-w-md mt-5 px-1">
                <DetailedStatsPanel />
              </div>
            )
          )}
          </div>
          <PageFooter />
        </div>
      </div>

      {settingsOpen && (
        <div className="hidden md:block md:relative md:w-[min(50%,380px)] md:h-full md:flex-shrink-0 border-l bg-background">
          <ViewSettingsPane onClose={() => setSettingsOpen(false)} />
        </div>
      )}

      {settingsOpen && <ViewSettingsSheet onClose={() => setSettingsOpen(false)} />}

      {exportOpen && <DexExportOverlay onClose={() => setExportOpen(false)} />}

      <FollowUpHint
        armed={statsHintArmed}
        dismiss={dismissStatsHint}
        fulfilled={exportOpen}
        anchorRef={exportBtnRef}
        title={t('view.hint.stats.title')}
        body={t('view.hint.stats.body')}
      />
      <FollowUpHint
        armed={exportHintArmed}
        dismiss={dismissExportHint}
        fulfilled={exportOpen}
        anchorRef={exportBtnRef}
        title={t('view.hint.export.title')}
        body={t('view.hint.export.body')}
      />
    </div>
  );
}

function ViewSettingsSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <BottomSheet onClose={onClose} closeLabel={t('viewSettings.close')} title={t('viewSettings.title')}>
      <ViewSettingsPane onClose={onClose} mobileSheet />
    </BottomSheet>
  );
}
