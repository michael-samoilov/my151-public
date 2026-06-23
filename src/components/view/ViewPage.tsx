import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Settings, Download, Loader2 } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useViewSort, buildIdToSection } from '@/hooks/useViewSort';
import { BUILD_GROUPS } from '@/data/slot-template';
import { TYPE_COLORS } from '@/data/type-colors';
import type { Pokemon, TypeName } from '@/types/pokemon';
import { PageFooter } from '@/components/shared/PageFooter';
import { EffectiveCursorMarker } from '@/components/shared/EffectiveCursorMarker';
import { DragMeasureKicker } from '@/components/shared/DragMeasureKicker';
import { generateExportImage, shareOrDownload } from '@/lib/exportImage';
import { sendExportBeacon } from '@/hooks/useCompletionBeacon';
import { getEvolutionChainIds, getPokemonById } from '@/hooks/usePokemonData';
import { ViewSettingsPane } from '@/components/view/ViewSettingsPane';
import { createEffectiveCursorCollision, createSnapCenterToPointer, dragInputIsTouch, dragPointerRef } from '@/lib/dragCollision';
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

/** Measure container and compute square tile size that fits all items. */
function useTileSize(totalSlots: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tileSize, setTileSize] = useState(0);
  const slotsRef = useRef(totalSlots);
  slotsRef.current = totalSlots;

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
    const rows = Math.ceil(slotsRef.current / COLS);
    const size = Math.floor(Math.min(w / COLS, h / Math.max(rows, 1)));
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

  useEffect(() => {
    measure();
  }, [totalSlots, measure]);

  return { containerRef, tileSize };
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

// ---------- Section outlines ----------

const SHORT_NAMES: Record<string, string> = {
  'early-bug': 'Early Bug',
  'early-bird': 'Early Bird',
  'early-rodent': 'Early Mammal',
  'early-normal': 'Domestic',
  'other': 'Other Areas',
  'cave-pokemon': 'Cave',
  'fishing-pokemon': 'Fishing',
  'pseudo-legendary': 'Pseudo-Leg.',
  'rivalry-pair': 'Rivalry',
  'evil-team': 'Evil Team',
  'pikachu-clone': 'Pikaclone',
  'mimic': 'Mimic',
  'ruins': 'Ruins',
};

function getSectionLabel(groupId: string): string {
  return SHORT_NAMES[groupId] ?? BUILD_GROUPS.find(g => g.id === groupId)?.name ?? groupId;
}

const BUILD_GROUP_MAP = new Map(BUILD_GROUPS.map(g => [g.id, g]));

interface SectionSpan {
  sectionId: string;
  label: string;
  color: string;
  row: number;
  colStart: number;
  colEnd: number;
  openLeft: boolean;
  openRight: boolean;
  openTop: boolean;
  openBottom: boolean;
  showLabel: boolean;
}

function computeSectionSpans(
  sorted: Pokemon[],
  sections: Record<string, number[]>,
  cols: number,
): SectionSpan[] {
  const idToSection = buildIdToSection(sections);

  // First pass: collect raw per-row spans for each contiguous section run
  const rawSpans: {
    sectionId: string;
    label: string;
    color: string;
    row: number;
    colStart: number;
    colEnd: number;
    runIndex: number;
    spanInRun: number;
  }[] = [];

  let i = 0;
  let runIndex = 0;
  while (i < sorted.length) {
    const sectionId = idToSection.get(sorted[i].id);
    if (!sectionId) { i++; continue; }

    let end = i + 1;
    while (end < sorted.length && idToSection.get(sorted[end].id) === sectionId) {
      end++;
    }

    const group = BUILD_GROUP_MAP.get(sectionId);
    const color = group?.color ?? '#888888';
    const label = getSectionLabel(sectionId);

    let pos = i;
    let spanInRun = 0;
    while (pos < end) {
      const row = Math.floor(pos / cols);
      const colStart = pos % cols;
      const rowEnd = Math.min(end, (row + 1) * cols);
      const colEnd = (rowEnd - 1) % cols;

      rawSpans.push({ sectionId, label, color, row, colStart, colEnd, runIndex, spanInRun });
      spanInRun++;
      pos = rowEnd;
    }

    runIndex++;
    i = end;
  }

  // Second pass: determine open edges by checking neighbors in the same run
  const spans: SectionSpan[] = [];
  for (let s = 0; s < rawSpans.length; s++) {
    const raw = rawSpans[s];
    const prev = s > 0 && rawSpans[s - 1].runIndex === raw.runIndex ? rawSpans[s - 1] : null;
    const next = s < rawSpans.length - 1 && rawSpans[s + 1].runIndex === raw.runIndex ? rawSpans[s + 1] : null;

    // Wrapping: open left/right when the section continues across a row break
    const openRight = !!next && raw.colEnd === cols - 1 && next.colStart === 0;
    const openLeft = !!prev && raw.colStart === 0 && prev.colEnd === cols - 1;

    // Vertical: open top if prev span covers the same column range on the row above
    // (full-width continuation). Open bottom if next span does the same.
    const openTop = openLeft && !!prev && prev.row === raw.row - 1
      && prev.colStart <= raw.colStart && prev.colEnd >= raw.colEnd;
    const openBottom = openRight && !!next && next.row === raw.row + 1
      && next.colStart <= raw.colStart && next.colEnd >= raw.colEnd;

    spans.push({
      sectionId: raw.sectionId,
      label: raw.label,
      color: raw.color,
      row: raw.row,
      colStart: raw.colStart,
      colEnd: raw.colEnd,
      openLeft,
      openRight,
      openTop,
      openBottom,
      showLabel: raw.spanInRun === 0 || openLeft,
    });
  }

  return spans;
}

function SectionOverlays({
  spans,
  tileSize,
  offsetLeft = 0,
  labelHeight,
  sectionStartRows,
}: {
  spans: SectionSpan[];
  tileSize: number;
  offsetLeft?: number;
  labelHeight: number;
  sectionStartRows: Set<number>;
}) {
  const fontSize = tileSize * 0.12;
  const inset = 2;

  // Compute the Y position of the tile area for a given row.
  // Section-start rows have an extra labelHeight at top; tiles sit at the bottom.
  const tileTop = (row: number) => {
    let y = 0;
    for (let r = 0; r < row; r++) {
      y += tileSize + (sectionStartRows.has(r) ? labelHeight : 0);
    }
    // For the current row, tiles start after the label gap
    y += sectionStartRows.has(row) ? labelHeight : 0;
    return y;
  };

  const labelTop = (row: number) => {
    let y = 0;
    for (let r = 0; r < row; r++) {
      y += tileSize + (sectionStartRows.has(r) ? labelHeight : 0);
    }
    return y;
  };

  return (
    <>
      {spans.map((span) => {
        const left = offsetLeft + span.colStart * tileSize;
        const top = tileTop(span.row);
        const width = (span.colEnd - span.colStart + 1) * tileSize;
        const height = tileSize;
        const hasLabel = span.showLabel && !span.openTop;

        return (
          <div key={`${span.sectionId}-${span.row}-${span.colStart}`}>
            {hasLabel && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: left + (span.openLeft ? 0 : inset),
                  top: labelTop(span.row),
                  width: width - (span.openLeft ? 0 : inset) - (span.openRight ? 0 : inset),
                  height: labelHeight,
                  display: 'flex',
                  alignItems: 'flex-end',
                  paddingBottom: 1,
                }}
              >
                <span
                  className="leading-none font-semibold select-none truncate"
                  style={{
                    fontSize,
                    paddingLeft: span.openLeft ? 2 : 1,
                    color: `${span.color}A0`,
                  }}
                >
                  {span.label}
                </span>
              </div>
            )}
            <div
              className="absolute pointer-events-none"
              style={{
                left: left + (span.openLeft ? 0 : inset),
                top: top + (span.openTop ? 0 : inset),
                width: width - (span.openLeft ? 0 : inset) - (span.openRight ? 0 : inset),
                height: height - (span.openTop ? 0 : inset) - (span.openBottom ? 0 : inset),
                borderTop: span.openTop ? 'none' : `1.5px solid ${span.color}50`,
                borderBottom: span.openBottom ? 'none' : `1.5px solid ${span.color}50`,
                borderLeft: span.openLeft ? 'none' : `1.5px solid ${span.color}50`,
                borderRight: span.openRight ? 'none' : `1.5px solid ${span.color}50`,
                borderRadius: `${span.openLeft || span.openTop ? '0' : '4px'} ${span.openRight || span.openTop ? '0' : '4px'} ${span.openRight || span.openBottom ? '0' : '4px'} ${span.openLeft || span.openBottom ? '0' : '4px'}`,
                backgroundColor: `${span.color}08`,
              }}
            />
          </div>
        );
      })}
    </>
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

  const showSections = usePokedexStore((s) => s.viewShowSections);

  const sorted = useViewSort(sections, sortOption, groupSpecialAtEnd, customOrder);
  const count = sorted.length;
  const totalSlots = Math.max(count, 151);
  const { containerRef, tileSize } = useTileSize(totalSlots);
  const [exporting, setExporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hasCustom = customOrder !== null;

  const showSectionOverlays = showSections && sortOption === 'build-order';

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

    setCustomOrder(withoutDragged);
    if (sortOption !== 'custom') setSortOption('custom');

    resetDragState();
  }, [dragLineIds, visibleIds, bundleVisible, dropSide, sortOption, setCustomOrder, setSortOption, resetDragState]);

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
    sendExportBeacon(sorted.map((p) => p.id));
    try {
      const blob = await generateExportImage(sorted);
      await shareOrDownload(blob, `my151.png`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [sorted, exporting]);

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

        <div ref={containerRef} className="flex-1 min-h-0 flex items-start justify-center p-2 overflow-y-auto">
          {tileSize > 0 && (() => {
            const lastRowCount = totalSlots % COLS || COLS;
            const gridSlots = totalSlots - lastRowCount;
            const gridPokemon = sorted.slice(0, gridSlots);
            const lastRowPokemon = sorted.slice(gridSlots);
            const gridEmpties = Math.max(0, gridSlots - gridPokemon.length);
            const lastRowEmpties = Math.max(0, lastRowCount - lastRowPokemon.length);

            const gridSpans = showSectionOverlays
              ? computeSectionSpans(gridPokemon, sections, COLS)
              : [];
            const lastRowSpans = showSectionOverlays
              ? computeSectionSpans(lastRowPokemon, sections, lastRowCount)
              : [];

            const labelHeight = Math.round(tileSize * 0.18);
            // Rows that start a new section (first span with showLabel and no openTop)
            const sectionStartRows = new Set<number>();
            for (const span of gridSpans) {
              if (span.showLabel && !span.openTop) {
                sectionStartRows.add(span.row);
              }
            }
            const lastRowSectionStarts = new Set<number>();
            for (const span of lastRowSpans) {
              if (span.showLabel && !span.openTop) {
                lastRowSectionStarts.add(span.row);
              }
            }

            const totalGridRows = Math.ceil(gridSlots / COLS);
            const gridRowTemplate = showSectionOverlays
              ? Array.from({ length: totalGridRows }, (_, r) =>
                  sectionStartRows.has(r) ? `${labelHeight + tileSize}px` : `${tileSize}px`
                ).join(' ')
              : undefined;

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
                <div style={{ width: COLS * tileSize }}>
                  <div className="relative">
                    <div
                      className="grid items-end"
                      style={{
                        gridTemplateColumns: `repeat(${COLS}, ${tileSize}px)`,
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
                    {gridSpans.length > 0 && (
                      <SectionOverlays
                        spans={gridSpans}
                        tileSize={tileSize}
                        labelHeight={labelHeight}
                        sectionStartRows={sectionStartRows}
                      />
                    )}
                  </div>
                  <div className="flex justify-center items-end relative" style={{ height: tileSize + (lastRowSectionStarts.size > 0 ? labelHeight : 0) }}>
                    {lastRowPokemon.map((p, i) => renderTile(p, gridSlots + i + 1))}
                    {lastRowEmpties > 0 &&
                      Array.from({ length: lastRowEmpties }, (_, i) => (
                        <EmptyPlaceholder key={`empty-last-${i}`} tileSize={tileSize} num={gridSlots + lastRowPokemon.length + i + 1} />
                      ))}
                    {lastRowSpans.length > 0 && (
                      <SectionOverlays
                        spans={lastRowSpans}
                        tileSize={tileSize}
                        offsetLeft={(COLS - lastRowCount) * tileSize / 2}
                        labelHeight={labelHeight}
                        sectionStartRows={lastRowSectionStarts}
                      />
                    )}
                  </div>
                  <PageFooter />
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
        </div>
      </div>

      {/* Settings pane — docked right on desktop */}
      {settingsOpen && (
        <div className="hidden md:block md:relative md:w-[min(50vw,380px)] md:h-full md:flex-shrink-0 border-l bg-background">
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
