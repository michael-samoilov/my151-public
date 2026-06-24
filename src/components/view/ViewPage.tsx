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

// Outline-mode spacing, as multiples of tileSize. In outline mode the grid gains
// a single uniform gap (OUTLINE_GAP) between every cell in both directions, and
// each section outline is drawn a fixed inset (OUTLINE_PAD) outside its tiles on
// all sides — so the gap between any two neighbouring outlines is uniformly
// OUTLINE_GAP - 2*OUTLINE_PAD, top/bottom and left/right alike. OUTLINE_HEAD is
// the label band reserved above each section's first row. useTileSize folds all
// of these into its fit calculation so the spaced grid still fits on screen.
const OUTLINE_GAP = 0.24;
const OUTLINE_PAD = 0.07;
const OUTLINE_HEAD = 0.28;

// Outline border stroke width (CSS px). The open side of a ≤9 wrap ends in a
// dotted tail: three dots of diameter = stroke width, separated by equal
// (dot-width) spaces. The outermost dot's edge sits on the old border line, and
// the solid stroke resumes one space past the innermost dot — so the tail is
// 3 dots + 3 spaces = 6× the stroke width, and the fill fades across that span.
const OUTLINE_STROKE_W = 1.5;
const OUTLINE_DOT_TAIL = 6 * OUTLINE_STROKE_W;

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

  useEffect(() => {
    measure();
  }, [colFactor, rowFactor, measure]);

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

interface SectionRun {
  sectionId: string;
  label: string;
  color: string;
  firstRow: number;
  firstCol: number;
  lastRow: number;
  lastCol: number;
}

/** Break the sorted list into contiguous reading-order runs of a single
 *  section. Each run becomes exactly one outline (and one label). */
function computeSectionRuns(
  sorted: Pokemon[],
  sections: Record<string, number[]>,
  cols: number,
): SectionRun[] {
  const idToSection = buildIdToSection(sections);
  const runs: SectionRun[] = [];

  let i = 0;
  while (i < sorted.length) {
    const sectionId = idToSection.get(sorted[i].id);
    if (!sectionId) { i++; continue; }

    let end = i + 1;
    while (end < sorted.length && idToSection.get(sorted[end].id) === sectionId) {
      end++;
    }

    const group = BUILD_GROUP_MAP.get(sectionId);
    runs.push({
      sectionId,
      label: getSectionLabel(sectionId),
      color: group?.color ?? '#888888',
      firstRow: Math.floor(i / cols),
      firstCol: i % cols,
      lastRow: Math.floor((end - 1) / cols),
      lastCol: (end - 1) % cols,
    });

    i = end;
  }

  return runs;
}

type Pt = { x: number; y: number };

/** Build an SVG path that traces an ordered (clockwise) rectilinear polygon with
 *  rounded corners. Convex corners use `radius`; concave corners use
 *  `radius + concaveExtra`. Passing concaveExtra = the inter-outline gap makes a
 *  concave "big spoon" corner share a centre with the convex "little spoon"
 *  corner that nests inside it, so the gap stays uniform around the bend. */
function roundedPath(pts: Pt[], radius: number, concaveExtra = 0): string {
  // Drop consecutive coincident points (collapsed edges from flush columns).
  const p: Pt[] = [];
  for (const pt of pts) {
    const last = p[p.length - 1];
    if (!last || Math.abs(last.x - pt.x) > 0.01 || Math.abs(last.y - pt.y) > 0.01) p.push(pt);
  }
  if (p.length > 1) {
    const a = p[0], b = p[p.length - 1];
    if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) p.pop();
  }
  const n = p.length;
  if (n < 3) return '';

  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const prev = p[(i - 1 + n) % n];
    const curr = p[i];
    const next = p[(i + 1) % n];
    const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;
    const d1 = Math.hypot(v1x, v1y) || 1;
    const d2 = Math.hypot(v2x, v2y) || 1;
    // Cross product < 0 is a left turn = concave corner on a clockwise polygon.
    const concave = v1x * v2y - v1y * v2x < 0;
    const r = Math.min(radius + (concave ? concaveExtra : 0), d1 / 2, d2 / 2);
    const t1 = { x: curr.x + (prev.x - curr.x) * (r / d1), y: curr.y + (prev.y - curr.y) * (r / d1) };
    const t2 = { x: curr.x + (next.x - curr.x) * (r / d2), y: curr.y + (next.y - curr.y) * (r / d2) };
    parts.push(`${i === 0 ? 'M' : 'L'} ${t1.x.toFixed(2)} ${t1.y.toFixed(2)}`);
    parts.push(`Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${t2.x.toFixed(2)} ${t2.y.toFixed(2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Closed rounded-rect path. The open side (left or right) gets square corners
 *  so the fill reads as continuing off that edge. */
function roundRectFill(x0: number, y0: number, x1: number, y1: number, r: number, openLeft: boolean, openRight: boolean): string {
  const rTL = openLeft ? 0 : r, rBL = openLeft ? 0 : r;
  const rTR = openRight ? 0 : r, rBR = openRight ? 0 : r;
  const f = (n: number) => n.toFixed(2);
  return [
    `M ${f(x0 + rTL)} ${f(y0)}`,
    `L ${f(x1 - rTR)} ${f(y0)}`,
    rTR ? `Q ${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + rTR)}` : `L ${f(x1)} ${f(y0)}`,
    `L ${f(x1)} ${f(y1 - rBR)}`,
    rBR ? `Q ${f(x1)} ${f(y1)} ${f(x1 - rBR)} ${f(y1)}` : `L ${f(x1)} ${f(y1)}`,
    `L ${f(x0 + rBL)} ${f(y1)}`,
    rBL ? `Q ${f(x0)} ${f(y1)} ${f(x0)} ${f(y1 - rBL)}` : `L ${f(x0)} ${f(y1)}`,
    `L ${f(x0)} ${f(y0 + rTL)}`,
    rTL ? `Q ${f(x0)} ${f(y0)} ${f(x0 + rTL)} ${f(y0)}` : `L ${f(x0)} ${f(y0)}`,
    'Z',
  ].join(' ');
}

/** Open stroke for a rounded rect: the open side is left undrawn so the border
 *  continues off that edge. `openInset` pulls the top/bottom borders back from
 *  the open edge by that much, leaving room for the trailing dots. */
function roundRectStroke(x0: number, y0: number, x1: number, y1: number, r: number, openLeft: boolean, openRight: boolean, openInset = 0): string {
  const f = (n: number) => n.toFixed(2);
  if (openRight) {
    const xe = x1 - openInset;
    return [
      `M ${f(xe)} ${f(y0)}`,
      `L ${f(x0 + r)} ${f(y0)}`,
      `Q ${f(x0)} ${f(y0)} ${f(x0)} ${f(y0 + r)}`,
      `L ${f(x0)} ${f(y1 - r)}`,
      `Q ${f(x0)} ${f(y1)} ${f(x0 + r)} ${f(y1)}`,
      `L ${f(xe)} ${f(y1)}`,
    ].join(' ');
  }
  if (openLeft) {
    const xe = x0 + openInset;
    return [
      `M ${f(xe)} ${f(y0)}`,
      `L ${f(x1 - r)} ${f(y0)}`,
      `Q ${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + r)}`,
      `L ${f(x1)} ${f(y1 - r)}`,
      `Q ${f(x1)} ${f(y1)} ${f(x1 - r)} ${f(y1)}`,
      `L ${f(xe)} ${f(y1)}`,
    ].join(' ');
  }
  return roundRectFill(x0, y0, x1, y1, r, false, false);
}

interface OutlineShape {
  key: string;
  fill: string;
  stroke: string;
  color: string;
  label: string | null;
  labelX: number;
  labelY: number;
  labelMaxW: number;
  // Set on the open side of a ≤9-pokemon wrap piece: the fill fades out toward
  // the open edge and the top/bottom borders trail off into three dots.
  open?: { side: 'left' | 'right'; x0: number; x1: number; topY: number; botY: number };
}

/** Turn section runs into outline shapes. A run that wraps across rows and
 *  stays column-contiguous becomes a single enclosing outline; the rare wrap
 *  with no column overlap falls back to two rectangles. Every border — sides,
 *  top/bottom, ribbon steps and the label band — sits a uniform `pad` outside
 *  the section's own tiles, so any two neighbouring outlines are separated by
 *  exactly `gap - 2*pad` in every direction. */
function buildOutlines(
  runs: SectionRun[],
  cols: number,
  tileSize: number,
  startRows: Set<number>,
  headroom: number,
  gap: number,
  pad: number,
): OutlineShape[] {
  const pitch = tileSize + gap;
  const maxRow = runs.reduce((m, r) => Math.max(m, r.lastRow), 0);
  // Cumulative top of each row block. A block = optional label band + tile, and
  // rows are separated by `gap`. Tiles bottom-align, so a start row's tile sits
  // below its band.
  const blockTop: number[] = new Array(maxRow + 2).fill(0);
  for (let r = 1; r <= maxRow + 1; r++) {
    blockTop[r] = blockTop[r - 1] + (startRows.has(r - 1) ? headroom : 0) + tileSize + gap;
  }
  const tileTop = (r: number) => blockTop[r] + (startRows.has(r) ? headroom : 0);

  const radius = Math.max(4, tileSize * 0.26);

  // A border for column c sits `pad` outside the tile, into the surrounding gap.
  const colLeft = (c: number) => c * pitch - pad;
  const colRight = (c: number) => c * pitch + tileSize + pad;

  const shapes: OutlineShape[] = [];

  // Uniform gap between neighbouring outlines — concave corners are widened by
  // this so a convex corner nesting inside keeps the gap constant round the bend.
  const outlineGap = gap - 2 * pad;

  let run: SectionRun;
  const pushPoly = (suffix: string, pts: Pt[], lbl: string | null, lx: number, ly: number, lw: number) => {
    const d = roundedPath(pts, radius, outlineGap);
    shapes.push({ key: `${run.sectionId}-${suffix}`, fill: d, stroke: d, color: run.color, label: lbl, labelX: lx, labelY: ly, labelMaxW: lw });
  };

  for (run of runs) {
    const { firstRow, firstCol, lastRow, lastCol, color, label } = run;
    const xL = colLeft(0);
    const xR = colRight(cols - 1);
    const xFirstL = colLeft(firstCol);
    const xLastR = colRight(lastCol);

    const firstRowRight = firstRow === lastRow ? colRight(lastCol) : xR;
    const labelX = firstCol * pitch + tileSize * 0.07;
    const labelY = blockTop[firstRow] + headroom * 0.45;
    const labelMaxW = Math.max(tileSize, firstRowRight - labelX - tileSize * 0.06);

    // The top border sits `pad` above the label band (the band is part of the
    // section's content box, so its top counts as the section's top edge).
    const yTop = blockTop[firstRow] - pad;

    if (firstRow === lastRow) {
      const yBottom = tileTop(firstRow) + tileSize + pad;
      pushPoly(`${firstRow}-${firstCol}`, [
        { x: xFirstL, y: yTop },
        { x: xLastR, y: yTop },
        { x: xLastR, y: yBottom },
        { x: xFirstL, y: yBottom },
      ], label, labelX, labelY, labelMaxW);
      continue;
    }

    // Two-row wrap with no column overlap (≤9 pokemon): two pieces with their
    // inner edges left open to read as continuation, name re-shown on row two.
    if (lastRow - firstRow === 1 && firstCol > lastCol + 1) {
      const yBotA = tileTop(firstRow) + tileSize + pad;
      shapes.push({
        key: `${run.sectionId}-a`,
        fill: roundRectFill(xFirstL, yTop, xR, yBotA, radius, false, true),
        stroke: roundRectStroke(xFirstL, yTop, xR, yBotA, radius, false, true, OUTLINE_DOT_TAIL),
        color, label, labelX, labelY, labelMaxW,
        open: { side: 'right', x0: xFirstL, x1: xR, topY: yTop, botY: yBotA },
      });
      // lastRow is guaranteed a band row (see layout memo), so the re-shown
      // label has band space and the piece tops out uniformly.
      const yTopB = blockTop[lastRow] - pad;
      const yBotB = tileTop(lastRow) + tileSize + pad;
      const labelBX = tileSize * 0.07;
      const labelBY = blockTop[lastRow] + headroom * 0.45;
      const labelBW = Math.max(tileSize, xLastR - labelBX - tileSize * 0.06);
      shapes.push({
        key: `${run.sectionId}-b`,
        fill: roundRectFill(xL, yTopB, xLastR, yBotB, radius, true, false),
        stroke: roundRectStroke(xL, yTopB, xLastR, yBotB, radius, true, false, OUTLINE_DOT_TAIL),
        color, label, labelX: labelBX, labelY: labelBY, labelMaxW: labelBW,
        open: { side: 'left', x0: xL, x1: xLastR, topY: yTopB, botY: yBotB },
      });
      continue;
    }

    // Exactly-10 wrap (firstCol === lastCol + 1) is left to the contiguous-ribbon
    // path below: its staircase vertices "cross" at the two diagonally-adjacent
    // corners, and the spoon rounding (concave radius = convex + gap) pulls those
    // corners apart into a smooth diagonal join automatically. The name is not
    // re-shown (single ribbon outline).

    // Contiguous multi-row ribbon — one enclosing outline. The left step rises
    // to the band of the row below (so a last row sharing a band row reaches the
    // same height as the new section); the right step sits below the row above.
    const yLeftStep = blockTop[firstRow + 1] - pad;
    const yRightStep = tileTop(lastRow - 1) + tileSize + pad;
    const yBottom = tileTop(lastRow) + tileSize + pad;
    pushPoly(`${firstRow}-${firstCol}`, [
      { x: xFirstL, y: yTop },
      { x: xR, y: yTop },
      { x: xR, y: yRightStep },
      { x: xLastR, y: yRightStep },
      { x: xLastR, y: yBottom },
      { x: xL, y: yBottom },
      { x: xL, y: yLeftStep },
      { x: xFirstL, y: yLeftStep },
    ], label, labelX, labelY, labelMaxW);
  }

  return shapes;
}

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
}) {
  const shapes = buildOutlines(runs, cols, tileSize, startRows, headroom, gap, pad);
  const width = cols * tileSize + (cols - 1) * gap;
  const fontSize = tileSize * 0.13;

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
            const fadeW = OUTLINE_DOT_TAIL;
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
                <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        {shapes.map((s) => (
          <path
            key={`fill-${s.key}`}
            d={s.fill}
            fill={s.open ? `url(#outline-fade-${s.key})` : `${s.color}12`}
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
            stroke={s.color}
            strokeOpacity={0.5}
            strokeWidth={OUTLINE_STROKE_W}
            strokeLinejoin="round"
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
                cx={edge + dir * (0.5 + 2 * i) * OUTLINE_STROKE_W}
                cy={cy}
                r={OUTLINE_STROKE_W / 2}
                fill={s.color}
                fillOpacity={0.5}
              />
            )),
          );
        })}
      </svg>
      {shapes.map((s) =>
        s.label ? (
          <div
            key={`label-${s.key}`}
            className="absolute leading-none font-semibold select-none truncate"
            style={{
              left: s.labelX,
              top: s.labelY,
              maxWidth: s.labelMaxW,
              fontSize,
              color: s.color,
              opacity: 0.9,
            }}
          >
            {s.label}
          </div>
        ) : null,
      )}
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

  const showSections = usePokedexStore((s) => s.viewShowSections);

  const sorted = useViewSort(sections, sortOption, groupSpecialAtEnd, customOrder);
  const count = sorted.length;
  const totalSlots = Math.max(count, 151);

  const showSectionOverlays = showSections && sortOption === 'build-order';

  // Section geometry + the effective grid sizing factors. In outline mode the
  // grid gains inter-cell gaps and per-section label bands; folding those into
  // colFactor/rowFactor lets useTileSize shrink the tiles so the whole spaced
  // grid (outlines included) still fits on screen.
  const layout = useMemo(() => {
    const lastRowCount = totalSlots % COLS || COLS;
    const gridSlots = totalSlots - lastRowCount;
    const gridPokemon = sorted.slice(0, gridSlots);
    const lastRowPokemon = sorted.slice(gridSlots);
    const gridRuns = showSectionOverlays ? computeSectionRuns(gridPokemon, sections, COLS) : [];
    const lastRowRuns = showSectionOverlays ? computeSectionRuns(lastRowPokemon, sections, lastRowCount) : [];
    // Rows that carry a label band: every section's first row, plus the second
    // row of a ≤9-pokemon open wrap (whose name re-appears and needs band space).
    const bandRowsFor = (rs: SectionRun[]) => {
      const set = new Set<number>();
      for (const r of rs) {
        set.add(r.firstRow);
        if (r.lastRow - r.firstRow === 1 && r.firstCol > r.lastCol + 1) set.add(r.lastRow);
      }
      return set;
    };
    const gridStartRows = bandRowsFor(gridRuns);
    const lastRowStartRows = bandRowsFor(lastRowRuns);
    const totalRows = Math.ceil(totalSlots / COLS);
    const numStartRows = gridStartRows.size + lastRowStartRows.size;
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
      gridRuns, lastRowRuns, gridStartRows, lastRowStartRows,
      colFactor, rowFactor,
    };
  }, [sorted, totalSlots, showSectionOverlays, sections]);

  const { containerRef, tileSize } = useTileSize(layout.colFactor, layout.rowFactor);
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
            const {
              lastRowCount, gridSlots, gridPokemon, lastRowPokemon,
              gridRuns, lastRowRuns, gridStartRows, lastRowStartRows,
            } = layout;
            const gridEmpties = Math.max(0, gridSlots - gridPokemon.length);
            const lastRowEmpties = Math.max(0, lastRowCount - lastRowPokemon.length);

            // Outline mode adds a single uniform gap between cells and a label
            // band above each section's first row (tiles bottom-align, so the
            // band sits on top). All zero when overlays are off.
            const gap = showSectionOverlays ? tileSize * OUTLINE_GAP : 0;
            const pad = showSectionOverlays ? tileSize * OUTLINE_PAD : 0;
            const headroom = showSectionOverlays ? tileSize * OUTLINE_HEAD : 0;
            const pitch = tileSize + gap;
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
            const lastRowOffset = (COLS - lastRowCount) * pitch / 2;

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
                <div style={{ width: gridWidth }}>
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
                    {gridRuns.length > 0 && (
                      <SectionOverlays
                        runs={gridRuns}
                        cols={COLS}
                        tileSize={tileSize}
                        startRows={gridStartRows}
                        headroom={headroom}
                        gap={gap}
                        pad={pad}
                        totalHeight={gridBlockHeight}
                      />
                    )}
                  </div>
                  <div
                    className="flex justify-center items-end relative"
                    style={{ height: lastRowHeight, columnGap: gap, marginTop: gap }}
                  >
                    {lastRowPokemon.map((p, i) => renderTile(p, gridSlots + i + 1))}
                    {lastRowEmpties > 0 &&
                      Array.from({ length: lastRowEmpties }, (_, i) => (
                        <EmptyPlaceholder key={`empty-last-${i}`} tileSize={tileSize} num={gridSlots + lastRowPokemon.length + i + 1} />
                      ))}
                    {lastRowRuns.length > 0 && (
                      <SectionOverlays
                        runs={lastRowRuns}
                        cols={lastRowCount}
                        tileSize={tileSize}
                        startRows={lastRowStartRows}
                        headroom={headroom}
                        gap={gap}
                        pad={pad}
                        totalHeight={lastRowHeight}
                        offsetLeft={lastRowOffset}
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
