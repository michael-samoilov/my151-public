import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PokeballBg } from '@/components/shared/PokeballBg';
import { TYPE_COLORS } from '@/data/type-colors';
import { useNamesVersion, useT } from '@/i18n';
import { labelOf } from './spriteLabel';
import { cn } from '@/lib/utils';
import { PRODUCTION_DEPLOY } from '@/lib/demoMode';
import { coordinateLabel } from './coordinatePresentation';
import type { Pokemon } from '@/types/pokemon';
import {
  GEN_AXIS,
  TYPE_AXIS,
  EXTRA_COLOR,
  cellKey,
  isGenNumber,
  isTypeName,
  type ExtraTypeAxis,
  type GenAxisId,
  type TypeAxisId,
} from '../model/cells';
import { kindFor } from '../model/eligibility';
import { prefetchCell, usePickerSprite } from '../model/spritePreload';
import type { PickerMon } from '../model/catalog';
import { gridSpriteSizePercent } from '../model/gridSpriteSize';
import { minimapViewportX } from '../model/minimap';
import { ExtraMark, EmptyBall, RomanDisc, TypeIcon } from './marks';
import { AxisBadge, GenerationBadge } from './WordBadge';
import { TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { WideBadge } from './WideBadge';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { NameTooltip } from './NameTooltip';

// Preview only: `?badges=wide` stretches each column badge's pill to the
// column past the capped header, `?badges=capped` stops the badge at the
// capped header's size, and `?genbadges=1` puts a badge under each
// generation disc. The default keeps the badge's 5:1 shape at 90% of the
// column, and the header row grows to hold it.
const PREVIEW = new URLSearchParams(!PRODUCTION_DEPLOY && typeof location !== 'undefined' ? location.search : '');
const BADGE_ZOOM = PREVIEW.get('badges') === 'wide' ? 'wide' : PREVIEW.get('badges') === 'capped' ? 'capped' : 'scale';
const GEN_ROW_BADGES = PREVIEW.get('genbadges') === '1';
// A header mark over its badge: the mark keeps its size, and the badge takes
// the room under it.
const HEAD_ICON = 0.72;
const HEAD_GAP = 0.03;
const HEAD_BADGE = 0.18;

/**
 * Height of the header row. Past the header cap, a column badge that keeps
 * its shape grows with the column, so the row grows by the badge's growth.
 * The generation column keeps the capped width.
 */
function headRowPx(cell: number, head: number): number {
  return BADGE_ZOOM === 'scale' ? head + HEAD_BADGE * (cell - head) : head;
}

const ROWS = GEN_AXIS.length + 1;
const COLS = TYPE_AXIS.length + 1;
const DESKTOP_CELL_PX = 96;
// Zoom multiplies the body cell size, so 1 is the unzoomed grid. Mobile
// cells start small and get more headroom than native-size desktop sprites.
const ZOOM_RANGE = { mobile: { min: 1, max: 4 }, desktop: { min: 1, max: 2.5 } };
// The header row and generation column stop growing at this zoom, so a
// zoomed grid keeps most of the frame for body cells.
const HEAD_MAX_ZOOM = 1.25;
// Minimap opacity while it shows. It is opaque while the pointer is on it.
const MINIMAP_SHOWN = '0.95';
const MINIMAP_HOVER = '1';
// The desktop minimap takes the pointer only after the pointer rests on it
// this long, so a quick click on a cell under it still reaches the cell.
const MINIMAP_HOVER_MS = 200;
// A ctrl+wheel zoom lays the grid out once its events pause this long.
const WHEEL_SETTLE_MS = 120;
// Shared idle delay after the last scroll, zoom, or drag.
const MINIMAP_LINGER_MS = 1200;
// The minimap rests on the bottom edge, over the locked Favorite × Gimmick
// and Favorite × Legendary cells next to the bottom-right cell. Its right
// offset leaves the most of every pickable cell clear when the grid is
// scrolled to its corner: the lowest worst-case coverage over every zoom, on
// an empty or a filled grid. `scripts/favorite-minimap-spot.ts` measures that
// spot and checks this rule against it. The offset comes from the unzoomed
// cell, so the minimap holds still through scrolls and pinches.
const MINIMAP_PAD = 3;
function minimapRight(base: number, mapWidth: number): number {
  return Math.max(0, Math.round(2.57 * base - 0.67 * (mapWidth + 2 * MINIMAP_PAD)));
}

/** A length inside a 0.5px-bordered track of size `track`, as a fraction of
 *  it. A container unit would give the same size, but 300 size containers
 *  make every zoom frame run a style pass per cell. */
function trackPart(track: '--cell' | '--head', fraction: number): string {
  return `calc((var(${track}) - 1px) * ${fraction})`;
}

/** The `transform-origin` on the edge of `pane` that faces `cell`. */
function facingEdge(pane: DOMRect, cell: DOMRect): string {
  if (pane.top >= cell.bottom - 1) return 'top';
  if (pane.bottom <= cell.top + 1) return 'bottom';
  return pane.left >= cell.right - 1 ? 'left' : 'right';
}

/** How a column badge scales across and along its column when the tracks
 *  go from (cell0, head0) to (cell, head). It mirrors the badge's CSS size. */
function badgeScale(cell: number, head: number, cell0: number, head0: number): { x: number; y: number } {
  if (BADGE_ZOOM === 'scale') return { x: cell / cell0, y: cell / cell0 };
  const capped = Math.min(cell, head) / Math.min(cell0, head0);
  return BADGE_ZOOM === 'wide' ? { x: cell / cell0, y: capped } : { x: capped, y: capped };
}

/** Minimap size. Body cells are square, so it keeps the body's aspect ratio. */
function minimapBox(desktop: boolean): { width: number; height: number } {
  const width = desktop ? 180 : 100;
  return { width, height: Math.round(width * GEN_AXIS.length / TYPE_AXIS.length) };
}

/** A point in the body grid, in cells from its top-left corner. */
type BodyPoint = { u: number; v: number };
/** The zoom to draw next. `body` stays under the frame point (x, y); without
 *  it, the body point under (x, y) now stays there. */
type ZoomTarget = { zoom: number; x: number; y: number; body?: BodyPoint };
type Pinch = { source: 'touch' | 'gesture'; zoom: number; distance: number; body: BodyPoint };
type GestureEventLike = UIEvent & { scale: number; clientX: number; clientY: number };
/** Track sizes and scroll state, laid out or previewed. */
type View = { cell: number; head: number; headRow: number; left: number; top: number; width: number; height: number };
/** A column header's mark and badge, with their gesture-start boxes in
 *  the header, measured from its top. */
type HeadParts = { icon: HTMLElement; badge: HTMLElement; iconTop: number; iconH: number; badgeTop: number; badgeH: number };
/**
 * A gesture in progress. Transforms show the layout of `zoom` without laying
 * it out: the grid scales from its gesture-start layout, and each sticky
 * header, mark, and badge takes the size and place that layout gives it, so
 * nothing moves when the gesture ends. `view` is the layout shown.
 */
type Preview = {
  zoom: number;
  view: View;
  gridLeft: number;
  focus: { x: number; y: number; body: BodyPoint };
  start: { cell: number; head: number; headRow: number; gridLeft: number; spill: { x: number; y: number } };
  grid: HTMLElement;
  rows: HTMLElement[];
  heads: HeadParts[];
  cols: HTMLElement[];
  marks: HTMLElement[];
  corner: HTMLElement | null;
  pane: HTMLElement | null;
};

export function FavoritesGrid({
  fills,
  resolve,
  selected,
  onSelect,
  desktop,
  pane,
  fitFrame = false,
}: {
  fills: Record<string, number>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId, keyboard?: boolean) => void;
  desktop: boolean;
  /** The desktop selector pane. It scrolls with the grid, under the headers. */
  pane?: ReactNode;
  /** On desktop, shrink cells below their native size until the whole
   *  unzoomed grid fits the frame, and center the grid at any width. Without
   *  it, only a desktop grid centers. A centered grid that scrolls sideways
   *  still starts at the left edge. The admin overview uses it. */
  fitFrame?: boolean;
}) {
  useNamesVersion();
  return (
    <ZoomFrame desktop={desktop} fitFrame={fitFrame} fills={fills} pane={pane}>
      <Corner />
      {TYPE_AXIS.map((id) => (
        <HeaderCell key={`h-${String(id)}`} id={id} />
      ))}
      {GEN_AXIS.map((gen) => (
        <GenRow
          key={String(gen)}
          gen={gen}
          fills={fills}
          resolve={resolve}
          selected={selected}
          onSelect={onSelect}
          desktop={desktop}
        />
      ))}
    </ZoomFrame>
  );
}

/**
 * The visible grid area. It scrolls on both axes, keeps the header row and
 * generation column sticky, and zooms by resizing cells, so scroll extents
 * and sticky offsets stay native at every zoom.
 */
function ZoomFrame({
  children,
  desktop,
  fitFrame,
  fills,
  pane,
}: {
  children: ReactNode;
  desktop: boolean;
  fitFrame: boolean;
  fills: Record<string, number>;
  pane?: ReactNode;
}) {
  const t = useT();
  const frameRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const [showScrollCue, setShowScrollCue] = useState(() => {
    try { return sessionStorage.getItem('favorites-scroll-cue-seen') !== '1'; }
    catch { return true; }
  });
  useZoomFrame({ frameRef, ref, mapRef, windowRef, cueRef }, desktop, fitFrame, () => {
    setShowScrollCue(false);
    try { sessionStorage.setItem('favorites-scroll-cue-seen', '1'); }
    catch { /* Storage can be unavailable in private browsing. */ }
  });

  return (
    <div ref={frameRef} className="relative h-full min-h-0 w-full">
      <div
        ref={ref}
        // A sideways swipe stops at the grid's edge, so a trackpad cannot
        // swipe the page back. Vertical scroll past the grid's top or bottom
        // moves the page, so the footer stays reachable.
        className="isolate h-full w-full overflow-auto overscroll-x-contain bg-background"
        style={{ touchAction: 'pan-x pan-y', scrollPaddingTop: 'var(--head-row, var(--head))', scrollPaddingLeft: 'var(--head)' }}
        data-testid="favorites-grid-scroll"
        data-zoom="1"
      >
        <div
          // Auto margins center a grid that fits and resolve to 0 for one that overflows.
          className={desktop || fitFrame ? 'relative mx-auto grid' : 'relative grid'}
          style={{
            width: `calc(var(--head) + var(--cell) * ${COLS - 1})`,
            height: `calc(var(--head-row, var(--head)) + var(--cell) * ${ROWS - 1})`,
            gridTemplateRows: `var(--head-row, var(--head)) repeat(${ROWS - 1}, var(--cell))`,
            gridTemplateColumns: `var(--head) repeat(${COLS - 1}, var(--cell))`,
          }}
          data-testid="favorites-grid"
          data-axis="gen-major"
        >
          {children}
          {pane}
        </div>
      </div>
      <ChartMinimap fills={fills} mapRef={mapRef} windowRef={windowRef} box={minimapBox(desktop)} />
      {showScrollCue ? (
        <div ref={cueRef} data-testid="favorites-scroll-cue" className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full bg-card/95 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          <span>{t('favorites.scrollMore')}</span><span aria-hidden>→</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sizes cells, applies pinch and ctrl+wheel zoom, and paints the minimap.
 * A drag on the minimap scrolls the grid.
 *
 * A gesture writes transforms once per animation frame, so a pinch frame
 * needs no style or layout pass over the cells. When the gesture ends, the
 * track sizes and scroll offsets take its zoom in one layout. React renders
 * none of it, so a pinch never waits on a render.
 */
function useZoomFrame(
  refs: {
    frameRef: RefObject<HTMLDivElement | null>;
    ref: RefObject<HTMLDivElement | null>;
    mapRef: RefObject<HTMLDivElement | null>;
    windowRef: RefObject<HTMLDivElement | null>;
    cueRef: RefObject<HTMLDivElement | null>;
  },
  desktop: boolean,
  fitFrame: boolean,
  onFirstScroll: () => void,
) {
  const { frameRef, ref, mapRef, windowRef, cueRef } = refs;
  const zoomRef = useRef(1);
  const firstScrollRef = useRef(onFirstScroll);
  useLayoutEffect(() => { firstScrollRef.current = onFirstScroll; });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const range = desktop ? ZOOM_RANGE.desktop : ZOOM_RANGE.mobile;
    const clampZoom = (value: number) => Math.max(range.min, Math.min(range.max, value));
    // A fitted grid floors its cell, so it never adds the scrollbar that
    // would shrink the frame it was fitted to.
    const baseCell = () => !desktop ? el.clientHeight / ROWS
      : fitFrame ? Math.min(DESKTOP_CELL_PX, Math.floor(Math.min(el.clientHeight / ROWS, el.clientWidth / COLS)))
        : DESKTOP_CELL_PX;
    const box = minimapBox(desktop);
    let base = baseCell();
    let zoom = clampZoom(zoomRef.current);
    let target: ZoomTarget | null = null;
    let preview: Preview | null = null;
    let settleTimer = 0;
    let pinch: Pinch | null = null;
    // A run of ctrl+wheel events at one pointer spot keeps one body point
    // under the pointer, so per-event rounding cannot drift it.
    let wheel: { x: number; y: number; time: number; body: BodyPoint } | null = null;
    let frame = 0;
    let fadeTimer = 0;
    let scrolled = false;
    // Minimap pointer state: a pending desktop hover, whether the desktop
    // minimap takes the pointer, and an active drag.
    let hoverTimer = 0;
    let armed = false;
    let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;

    // Body cells scale with the zoom. Headers scale up to HEAD_MAX_ZOOM, and
    // the header row also holds the column badges' growth past it.
    const tracksAt = (z: number) => {
      const cell = base * z;
      const head = base * Math.min(z, HEAD_MAX_ZOOM);
      return { cell, head, headRow: headRowPx(cell, head) };
    };
    const tracks = () => tracksAt(zoom);
    const writeTracks = () => {
      zoomRef.current = zoom;
      const { cell, head, headRow } = tracks();
      el.style.setProperty('--cell', `${cell}px`);
      el.style.setProperty('--head', `${head}px`);
      el.style.setProperty('--head-row', `${headRow}px`);
      el.dataset.zoom = String(Math.round(zoom * 1000) / 1000);
    };
    /** How far a centered grid sits right of the scroll origin. Measured from
     *  layout: Chrome reports this grid's auto margin as 0px. */
    const gridLeft = () => {
      const grid = desktop || fitFrame ? el.firstElementChild : null;
      if (!grid) return 0;
      return grid.getBoundingClientRect().left - el.getBoundingClientRect().left - el.clientLeft + el.scrollLeft;
    };
    /** What the frame shows: the previewed layout during a gesture. */
    const shown = (): View => preview?.view
      ?? { ...tracks(), left: el.scrollLeft, top: el.scrollTop, width: el.scrollWidth, height: el.scrollHeight };
    /** The body point under a frame-local point. */
    const bodyAt = (x: number, y: number): BodyPoint => {
      const { cell, head, headRow, left, top } = shown();
      return { u: (left + x - (preview?.gridLeft ?? gridLeft()) - head) / cell, v: (top + y - headRow) / cell };
    };
    const paint = (show: boolean) => {
      const map = mapRef.current;
      const view = windowRef.current;
      const { cell, head, headRow, left, top, width: contentWidth, height: contentHeight } = shown();
      const overflows = contentWidth > el.clientWidth + 1 || contentHeight > el.clientHeight + 1;
      if (cueRef.current) cueRef.current.style.display = overflows ? '' : 'none';
      if (!map || !view) return;
      map.style.display = overflows ? '' : 'none';
      if (!overflows) return;
      // Clear of classic scrollbars.
      map.style.right = `${el.offsetWidth - el.clientWidth - el.clientLeft + minimapRight(base, box.width)}px`;
      map.style.bottom = `${el.offsetHeight - el.clientHeight - el.clientTop}px`;
      // The sticky headers cover the first track on each axis, so the
      // visible body starts at the scroll offset and is one header short.
      const sx = box.width / (TYPE_AXIS.length * cell);
      const sy = box.height / (GEN_AXIS.length * cell);
      const width = Math.min(box.width, Math.max(2, (el.clientWidth - head) * sx));
      const height = Math.min(box.height, Math.max(2, (el.clientHeight - headRow) * sy));
      view.style.left = `${minimapViewportX(left, sx, box.width, width)}px`;
      view.style.top = `${Math.max(0, Math.min(box.height - height, top * sy))}px`;
      view.style.width = `${width}px`;
      view.style.height = `${height}px`;
      if (!show) return;
      showMap();
    };
    /**
     * Shows the minimap, then fades it after idle unless the pointer is on it.
     * The phone minimap takes touches only while it shows, so a faded one
     * never takes a tap meant for a cell.
     */
    const showMap = () => {
      const map = mapRef.current;
      if (!map) return;
      map.style.opacity = armed || drag ? MINIMAP_HOVER : MINIMAP_SHOWN;
      if (!desktop) map.style.pointerEvents = 'auto';
      window.clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(() => {
        if (armed || drag) return;
        map.style.opacity = '0';
        if (!desktop) map.style.pointerEvents = '';
      }, MINIMAP_LINGER_MS);
    };
    const beginPreview = (): Preview => {
      const grid = el.firstElementChild as HTMLElement;
      const all = (selector: string) => [...grid.querySelectorAll<HTMLElement>(selector)];
      const { cell, head, headRow } = tracks();
      // Sprites in the last column and row spill past the grid. The spill
      // scales with the cells and counts toward the scroll range.
      const spill = { x: Math.max(0, grid.scrollWidth - grid.clientWidth), y: Math.max(0, grid.scrollHeight - grid.clientHeight) };
      const start = { cell, head, headRow, gridLeft: gridLeft(), spill };
      const rows = all(':scope > [data-head="row"]');
      const heads = rows.flatMap((row): HeadParts[] => {
        const icon = row.querySelector<HTMLElement>('[data-head-icon]');
        const badge = row.querySelector<HTMLElement>('[data-testid^="favorites-header-badge-"]');
        if (!icon || !badge) return [];
        const top = row.getBoundingClientRect().top;
        const i = icon.getBoundingClientRect();
        const b = badge.getBoundingClientRect();
        return [{ icon, badge, iconTop: i.top - top, iconH: i.height, badgeTop: b.top - top, badgeH: b.height }];
      });
      const next: Preview = {
        zoom,
        view: shown(),
        gridLeft: start.gridLeft,
        focus: { x: 0, y: 0, body: { u: 0, v: 0 } },
        start,
        grid,
        rows,
        heads,
        cols: all(':scope > [data-head="col"]'),
        marks: all(':scope > [data-head="col"] > [data-head-mark]'),
        corner: grid.querySelector<HTMLElement>(':scope > [data-head="corner"]'),
        pane: grid.querySelector<HTMLElement>(':scope > [data-testid="favorites-picker"]'),
      };
      for (const node of [grid, ...next.rows, ...next.cols, next.corner]) {
        if (!node) continue;
        node.style.transformOrigin = '0 0';
        node.style.willChange = 'transform';
      }
      // The pane keeps its size, and its edge that faces its cell moves with
      // the cell, so a zoom out cannot slide the pane over the cell.
      const selected = grid.querySelector('button[aria-expanded="true"]');
      if (next.pane && selected) next.pane.style.transformOrigin = facingEdge(next.pane.getBoundingClientRect(), selected.getBoundingClientRect());
      return next;
    };
    const endPreview = (p: Preview) => {
      for (const node of [p.grid, ...p.rows, ...p.cols, p.corner]) {
        if (!node) continue;
        node.style.transform = '';
        node.style.transformOrigin = '';
        node.style.willChange = '';
      }
      for (const { icon, badge } of p.heads) {
        icon.style.transform = '';
        badge.style.transform = '';
      }
      for (const node of p.marks) node.style.scale = '';
      if (p.pane) {
        p.pane.style.scale = '';
        p.pane.style.transformOrigin = '';
      }
    };
    const draw = () => {
      frame = 0;
      if (!target) return;
      const body = target.body ?? bodyAt(target.x, target.y);
      const p = preview ??= beginPreview();
      const { start } = p;
      // The layout of this zoom.
      const { cell, head, headRow } = tracksAt(target.zoom);
      const width = head + cell * (COLS - 1);
      const height = headRow + cell * (ROWS - 1);
      const s = cell / start.cell;
      const gl = desktop || fitFrame ? Math.max(0, (el.clientWidth - width) / 2) : 0;
      const contentWidth = Math.max(el.clientWidth, gl + width + start.spill.x * s);
      const contentHeight = Math.max(el.clientHeight, height + start.spill.y * s);
      const left = Math.max(0, Math.min(contentWidth - el.clientWidth, body.u * cell + head + gl - target.x));
      const top = Math.max(0, Math.min(contentHeight - el.clientHeight, body.v * cell + headRow - target.y));
      p.zoom = target.zoom;
      p.gridLeft = gl;
      p.focus = { x: target.x, y: target.y, body };
      p.view = { cell, head, headRow, left, top, width: contentWidth, height: contentHeight };
      target = null;
      // Scale the grid so every body point lands where that layout puts it.
      // The transformed grid then reaches exactly as far past the current
      // scroll offsets as that layout does, so the browser never clamps them.
      const tx = gl + head - start.head * s - start.gridLeft + el.scrollLeft - left;
      const ty = headRow - start.headRow * s + el.scrollTop - top;
      p.grid.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      // Each sticky header replaces the grid's transform across its axis with
      // its own size and sticky place in that layout. The header row is
      // `headRow` tall at the frame top; the generation column is `head` wide.
      const kHead = head / start.head;
      const kRow = headRow / start.headRow;
      const ax = (Math.max(0, gl - left) - start.gridLeft + el.scrollLeft - Math.max(0, el.scrollLeft - start.gridLeft) * s - tx) / s;
      const ay = (el.scrollTop * (1 - s) - ty) / s;
      for (const node of p.rows) node.style.transform = `translateY(${ay}px) scaleY(${kRow / s})`;
      for (const node of p.cols) node.style.transform = `translateX(${ax}px) scaleX(${kHead / s})`;
      if (p.corner) p.corner.style.transform = `translate(${ax}px, ${ay}px) scale(${kHead / s}, ${kRow / s})`;
      // A generation mark sizes from the column width alone.
      for (const node of p.marks) node.style.scale = `1 ${kHead / s}`;
      // A column header centers its mark, sized from the column width, over
      // its badge, sized from the column. Place each where that layout does.
      const k = badgeScale(cell, head, start.cell, start.head);
      for (const part of p.heads) {
        const iconH = part.iconH * kHead;
        const gap = (part.badgeTop - part.iconTop - part.iconH) * kHead;
        const badgeH = part.badgeH * k.y;
        const y = (headRow - iconH - gap - badgeH) / 2;
        part.icon.style.transform = `translateY(${(y + iconH / 2) / kRow - part.iconTop - part.iconH / 2}px) scale(${kHead / s}, ${kHead / kRow})`;
        part.badge.style.transform = `translateY(${(y + iconH + gap + badgeH / 2) / kRow - part.badgeTop - part.badgeH / 2}px) scale(${k.x / s}, ${k.y / kRow})`;
      }
      if (p.pane) p.pane.style.scale = String(1 / s);
      paint(true);
    };
    const zoomTo = (next: ZoomTarget) => {
      target = next;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    /** Lays the grid out at the previewed zoom, with the focus point held. */
    const commit = () => {
      window.clearTimeout(settleTimer);
      cancelAnimationFrame(frame);
      draw();
      const p = preview;
      if (!p) return;
      preview = null;
      endPreview(p);
      zoom = p.zoom;
      writeTracks();
      const { cell, head, headRow } = tracks();
      el.scrollLeft = p.focus.body.u * cell + head + gridLeft() - p.focus.x;
      el.scrollTop = p.focus.body.v * cell + headRow - p.focus.y;
      paint(true);
    };
    const local = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      return { x: clientX - rect.left - el.clientLeft, y: clientY - rect.top - el.clientTop };
    };
    const startPinch = (source: Pinch['source'], clientX: number, clientY: number, distance: number): Pinch => {
      commit();
      const point = local(clientX, clientY);
      pinch = { source, zoom, distance, body: bodyAt(point.x, point.y) };
      return pinch;
    };
    const touchPair = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
        distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
      };
    };

    // Two fingers zoom around their midpoint and pan with it. Cancelling
    // the touches keeps the browser from scrolling or zooming the page.
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      if (event.cancelable) event.preventDefault();
      const pair = touchPair(event.touches);
      startPinch('touch', pair.x, pair.y, pair.distance);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      if (event.cancelable) event.preventDefault();
      const pair = touchPair(event.touches);
      const start = pinch?.source === 'touch' ? pinch : startPinch('touch', pair.x, pair.y, pair.distance);
      zoomTo({ zoom: clampZoom(start.zoom * pair.distance / start.distance), ...local(pair.x, pair.y), body: start.body });
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2 || pinch?.source !== 'touch') return;
      pinch = null;
      commit();
    };
    // Safari reports trackpad and touch pinches as gesture events too. Touch
    // events already drive a touch pinch, so these drive only a trackpad
    // pinch. Cancelling them keeps Safari from zooming the page.
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      const gesture = event as GestureEventLike;
      if (!pinch) startPinch('gesture', gesture.clientX, gesture.clientY, 1);
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as GestureEventLike;
      if (pinch?.source !== 'gesture') return;
      zoomTo({ zoom: clampZoom(pinch.zoom * gesture.scale), ...local(gesture.clientX, gesture.clientY), body: pinch.body });
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      if (pinch?.source !== 'gesture') return;
      pinch = null;
      commit();
    };
    // Chromium and Firefox report a trackpad pinch as a ctrl+wheel event.
    // Chromium sets deltaY to -100 * ln(scale). A mouse wheel step is larger,
    // so cap each event. The grid lays out once the events pause.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      // A Safari trackpad pinch already zooms through gesture events.
      if (pinch?.source === 'gesture') return;
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * 33;
      const factor = Math.exp(-Math.max(-50, Math.min(50, delta)) / 100);
      const point = local(event.clientX, event.clientY);
      if (!wheel || event.timeStamp - wheel.time > 300 || Math.hypot(point.x - wheel.x, point.y - wheel.y) > 2) {
        wheel = { ...point, time: 0, body: bodyAt(point.x, point.y) };
      }
      wheel.time = event.timeStamp;
      zoomTo({ zoom: clampZoom((target?.zoom ?? preview?.zoom ?? zoom) * factor), ...point, body: wheel.body });
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(commit, WHEEL_SETTLE_MS);
    };
    const onScroll = () => {
      // A scroll under a gesture redraws its preview from the new offsets.
      if (preview) zoomTo({ ...preview.focus, zoom: preview.zoom });
      paint(true);
      if (scrolled) return;
      scrolled = true;
      firstScrollRef.current();
    };

    // Desktop minimap. It ignores the pointer until the pointer rests on it,
    // then shows and takes the pointer until the pointer leaves it.
    const overMap = (x: number, y: number) => {
      const map = mapRef.current;
      if (!map || map.style.display === 'none') return false;
      const rect = map.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };
    const arm = (on: boolean) => {
      window.clearTimeout(hoverTimer);
      hoverTimer = 0;
      if (armed === on) return;
      armed = on;
      if (mapRef.current) mapRef.current.style.pointerEvents = on ? 'auto' : '';
      showMap();
    };
    const onFrameMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || drag) return;
      if (!overMap(event.clientX, event.clientY)) arm(false);
      else if (!armed && !hoverTimer) hoverTimer = window.setTimeout(() => arm(true), MINIMAP_HOVER_MS);
    };
    const onFrameLeave = () => {
      if (!drag) arm(false);
    };
    // A minimap drag moves the window with the pointer and scrolls the grid
    // by the same share of the body. The desktop minimap drags only from its
    // window. The phone minimap is small, so a press off the window first
    // centers the window under the finger.
    const onDragMove = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      const { cell } = tracks();
      el.scrollLeft = drag.left + (event.clientX - drag.x) * TYPE_AXIS.length * cell / box.width;
      el.scrollTop = drag.top + (event.clientY - drag.y) * GEN_AXIS.length * cell / box.height;
    };
    const onDragStart = (event: PointerEvent) => {
      const view = windowRef.current;
      if (!view || drag || event.button !== 0) return;
      const rect = view.getBoundingClientRect();
      const onWindow = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (desktop && (!armed || !onWindow)) return;
      event.preventDefault();
      view.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
      if (!onWindow) {
        drag.x = rect.left + rect.width / 2;
        drag.y = rect.top + rect.height / 2;
        onDragMove(event);
      }
      showMap();
    };
    const onDragEnd = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      drag = null;
      if (desktop && !overMap(event.clientX, event.clientY)) arm(false);
      else showMap();
    };
    // The minimap sits outside the scroller, so it passes wheel scrolling on.
    const onMapWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        onWheel(event);
        return;
      }
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? el.clientHeight : 1;
      const [dx, dy] = event.shiftKey && !event.deltaX ? [event.deltaY, 0] : [event.deltaX, event.deltaY];
      el.scrollBy({ left: dx * unit, top: dy * unit, behavior: 'instant' });
    };
    // Keep the first visible body point in place when the base size changes.
    const onResize = () => {
      const next = baseCell();
      if (next > 0 && Math.abs(next - base) > 0.01) {
        commit();
        const ratio = next / base;
        const left = el.scrollLeft * ratio;
        const top = el.scrollTop * ratio;
        base = next;
        writeTracks();
        el.scrollLeft = left;
        el.scrollTop = top;
      }
      paint(false);
    };

    writeTracks();
    paint(false);
    const observer = new ResizeObserver(onResize);
    observer.observe(el);
    const active = { passive: false };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('touchstart', onTouchStart, active);
    el.addEventListener('touchmove', onTouchMove, active);
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('gesturestart', onGestureStart, active);
    el.addEventListener('gesturechange', onGestureChange, active);
    el.addEventListener('gestureend', onGestureEnd, active);
    el.addEventListener('wheel', onWheel, active);
    const frameEl = desktop ? frameRef.current : null;
    frameEl?.addEventListener('pointermove', onFrameMove);
    frameEl?.addEventListener('pointerleave', onFrameLeave);
    const map = mapRef.current;
    map?.addEventListener('wheel', onMapWheel, active);
    map?.addEventListener('pointerdown', onDragStart);
    map?.addEventListener('pointermove', onDragMove);
    map?.addEventListener('pointerup', onDragEnd);
    map?.addEventListener('pointercancel', onDragEnd);
    return () => {
      frameEl?.removeEventListener('pointermove', onFrameMove);
      frameEl?.removeEventListener('pointerleave', onFrameLeave);
      if (map) {
        map.removeEventListener('wheel', onMapWheel);
        map.removeEventListener('pointerdown', onDragStart);
        map.removeEventListener('pointermove', onDragMove);
        map.removeEventListener('pointerup', onDragEnd);
        map.removeEventListener('pointercancel', onDragEnd);
        map.style.pointerEvents = '';
      }
      observer.disconnect();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
      el.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(frame);
      if (preview) endPreview(preview);
      window.clearTimeout(settleTimer);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hoverTimer);
    };
  }, [frameRef, ref, mapRef, windowRef, cueRef, desktop, fitFrame]);
}

function GenRow({
  gen,
  fills,
  resolve,
  selected,
  onSelect,
  desktop,
}: {
  gen: GenAxisId;
  fills: Record<string, number>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId, keyboard?: boolean) => void;
  desktop: boolean;
}) {
  const banded = gen !== 'favorite' && GEN_AXIS.indexOf(gen) % 2 === 1;
  return (
    <>
      <HeaderCell id={gen} pin banded={banded} />
      {TYPE_AXIS.map((type) => (
        <BodyCell
          key={cellKey(type, gen)}
          type={type}
          gen={gen}
          banded={banded}
          fills={fills}
          resolve={resolve}
          selected={selected}
          onSelect={onSelect}
          desktop={desktop}
        />
      ))}
    </>
  );
}

function Corner() {
  return <div data-head="corner" className="sticky left-0 top-0 z-40 border-[0.5px] border-neutral-200 bg-background" />;
}

function HeaderCell({ id, pin = false, banded = false }: { id: TypeAxisId | GenAxisId; pin?: boolean; banded?: boolean }) {
  const iconSize = isGenNumber(id) ? 87 : 72;
  const mark = isTypeName(id) ? (
    <TypeIcon type={id} size={32} />
  ) : isGenNumber(id) ? (
    <RomanDisc gen={id} size={32} />
  ) : (
    <ExtraMark id={id} size={32} />
  );
  const badge = isTypeName(id) ? (
    <TypeBadge type={id} className="block w-full overflow-visible" />
  ) : isGenNumber(id) ? (
    <GenerationBadge gen={id} maxUnits={TYPE_BADGE_W} className="block w-full" />
  ) : (
    <AxisBadge id={id as ExtraTypeAxis} className="block w-full" />
  );
  const badgeTestId = `favorites-header-badge-${String(id)}`;
  return (
    <div
      data-row-banded={pin ? banded : undefined}
      data-head={pin ? 'col' : 'row'}
      className={cn(
        'min-h-0 min-w-0 overflow-hidden border-[0.5px] border-neutral-200 bg-card',
        // Sprites paint above body cells at z-10. Headers stay above them,
        // and the type row stays above the generation column.
        pin ? 'sticky left-0 z-20' : 'sticky top-0 z-30',
      )}
    >
      {banded ? <span className="pointer-events-none absolute inset-0 bg-foreground/[0.026]" /> : null}
      {isGenNumber(id) && !GEN_ROW_BADGES ? (
        <div
          data-head-mark
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_span]:!h-full [&_span]:!w-full [&_span]:!text-[0.62em]"
          style={{ width: trackPart('--head', iconSize / 100), height: trackPart('--head', iconSize / 100), fontSize: trackPart('--head', iconSize / 100) }}
        >
          {mark}
        </div>
      ) : (
        // The mark sits over its badge. The badge spans the header across
        // the axis, and in a column that a zoom widened past the capped
        // header height, it stops at the header's own width.
        <div data-head-mark className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: trackPart('--head', HEAD_GAP) }}>
          <div
            data-head-icon
            className="flex items-center justify-center [&_img]:h-full [&_img]:w-full [&_img]:object-contain"
            style={{ width: trackPart('--head', HEAD_ICON), height: trackPart('--head', HEAD_ICON) }}
          >
            {mark}
          </div>
          {pin ? (
            <div data-testid={badgeTestId} style={{ width: trackPart('--head', HEAD_BADGE * 5) }}>{badge}</div>
          ) : BADGE_ZOOM === 'wide' ? (
            <div
              data-testid={badgeTestId}
              style={{ width: 'calc(var(--cell) * 0.9)', height: `min(calc(var(--cell) * ${HEAD_BADGE}), calc(var(--head) * ${HEAD_BADGE}))` }}
            >
              <WideBadge id={id as TypeAxisId} />
            </div>
          ) : (
            <div
              data-testid={badgeTestId}
              style={{ width: BADGE_ZOOM === 'scale' ? 'calc(var(--cell) * 0.9)' : `min(calc(var(--cell) * 0.9), calc(var(--head) * ${HEAD_BADGE * 5}))` }}
            >
              {badge}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BodyCell({
  type,
  gen,
  banded,
  fills,
  resolve,
  selected,
  onSelect,
  desktop,
}: {
  type: TypeAxisId;
  gen: GenAxisId;
  banded: boolean;
  fills: Record<string, number>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId, keyboard?: boolean) => void;
  desktop: boolean;
}) {
  const kind = kindFor(type, gen);
  const dwell = useRef(0);
  const id = fills[cellKey(type, gen)];
  const mon = id == null ? undefined : resolve(id);
  const isSel = selected?.type === type && selected?.gen === gen;
  const tint = isTypeName(type) ? TYPE_COLORS[type] : undefined;
  const locked = kind === 'disabled' || kind === 'null';
  // Pointer cells show an Ultra Ball, and the last pointer cell a Master Ball.
  const ball = kind !== 'pointer' ? 'poke' : type === 'favorite' && gen === 'favorite' ? 'master' : 'ultra';

  const cell = (
    <button
      type="button"
      disabled={locked}
      onClick={(event) => onSelect(type, gen, event.detail === 0)}
      // The selector's sprites start loading before the click lands. A mouse
      // crossing the grid passes many cells, so it must rest on one first.
      onPointerEnter={locked ? undefined : (event) => {
        if (event.pointerType === 'mouse') dwell.current = window.setTimeout(() => prefetchCell(type, gen), 80);
        else prefetchCell(type, gen);
      }}
      onPointerLeave={() => window.clearTimeout(dwell.current)}
      onPointerDown={locked ? undefined : () => prefetchCell(type, gen)}
      onFocus={locked ? undefined : () => prefetchCell(type, gen)}
      aria-label={`${coordinateLabel(type, gen)}${mon ? ` · ${labelOf(mon)}` : ''}`}
      aria-expanded={locked ? undefined : isSel}
      aria-controls={isSel ? 'favorites-selector' : undefined}
      aria-haspopup={locked ? undefined : 'dialog'}
      data-testid={`favorites-cell-${type}-${gen}`}
      data-cell={locked ? undefined : cellKey(type, gen)}
      data-kind={kind}
      data-row-banded={banded}
      className={cn(
        'relative min-h-0 min-w-0 overflow-visible border-[0.5px] border-neutral-200 p-0',
        // Off-screen empty cells skip layout while a zoom resizes every
        // cell. Filled cells cannot, because skipping clips their sprites.
        !mon && !locked && '[content-visibility:auto]',
        locked
          // A browser sends no click from a disabled button, so a locked cell
          // lets clicks through to the grid, where they close an open selector.
          ? 'pointer-events-none bg-[repeating-linear-gradient(-45deg,#f4f4f5,#f4f4f5_3px,#ececee_3px,#ececee_6px)]'
          : mon ? 'cursor-pointer bg-transparent' : 'cursor-pointer bg-card',
        !locked && kind === 'pointer' && (mon ? 'bg-amber-50/50' : 'bg-amber-50'),
        // A mouse hover greys the cell. The grey layers over the cell's own
        // background, so the amber, banding, and type tint show through.
        !locked && 'hover:bg-linear-to-b hover:from-foreground/5 hover:to-foreground/5',
      )}
    >
      {banded && !locked ? <span className="pointer-events-none absolute inset-0 bg-foreground/[0.026]" /> : null}
      {mon ? (
        <Filled mon={mon} desktop={desktop} />
      ) : locked ? null : (
        <span
          data-testid="favorites-empty-ball"
          data-ball={ball}
          className="pointer-events-none absolute left-[5%] top-[5%] h-[90%] w-[90%]"
        >
          <EmptyBall kind={ball} className="block h-full w-full overflow-visible text-muted-foreground/20" />
        </span>
      )}
      {tint && !mon && !locked ? (
        <span className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ background: tint }} />
      ) : null}
      {isSel ? (
        <span
          data-testid="favorites-focus-ring"
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{ boxShadow: 'inset 0 0 0 2px var(--color-primary)' }}
        />
      ) : null}
    </button>
  );
  return mon && !locked ? <NameTooltip mon={mon}>{cell}</NameTooltip> : cell;
}

function ChartMinimap({
  fills,
  mapRef,
  windowRef,
  box,
}: {
  fills: Record<string, number>;
  mapRef: RefObject<HTMLDivElement | null>;
  windowRef: RefObject<HTMLDivElement | null>;
  box: { width: number; height: number };
}) {
  const cells: ReactNode[] = [];
  for (const gen of GEN_AXIS) {
    for (const type of TYPE_AXIS) {
      const kind = kindFor(type, gen);
      const filled = fills[cellKey(type, gen)] != null;
      const tint = type === 'favorite' || gen === 'favorite' ? EXTRA_COLOR.favorite
        : !isTypeName(type) || !isGenNumber(gen) ? TYPE_COLORS.normal
          : TYPE_COLORS[type];
      let background = `color-mix(in srgb, ${tint} ${filled ? 45 : 18}%, white)`;
      if (kind === 'disabled' || kind === 'null') background = 'transparent';
      cells.push(
        <div
          key={cellKey(type, gen)}
          data-type={type}
          data-kind={kind}
          data-filled={String(filled)}
          style={{ background }}
        />,
      );
    }
  }
  // useZoomFrame paints the position, viewport window, and opacity, and
  // turns on pointer input while the minimap can take a drag. A finger on it
  // neither scrolls nor zooms the page.
  return (
    <div
      ref={mapRef}
      data-testid="favorites-minimap"
      aria-hidden
      className="pointer-events-none absolute bottom-2 right-2 z-10 touch-none select-none rounded-sm bg-background/85 shadow-sm transition-opacity duration-200"
      style={{ opacity: 0, padding: MINIMAP_PAD }}
    >
      <div className="relative" style={box}>
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: `repeat(${TYPE_AXIS.length}, 1fr)`,
            gridTemplateRows: `repeat(${GEN_AXIS.length}, 1fr)`,
            gap: 1,
          }}
        >
          {cells}
        </div>
        <div
          ref={windowRef}
          data-testid="favorites-minimap-viewport"
          className="absolute cursor-grab bg-primary/10 active:cursor-grabbing"
          style={{ outline: '1px solid var(--color-primary)', outlineOffset: 1 }}
        />
      </div>
    </div>
  );
}

function Filled({ mon, desktop }: { mon: PickerMon; desktop: boolean }) {
  const pokemon = { types: mon.types } as Pokemon;
  const size = gridSpriteSizePercent(mon.sprite);
  const src = usePickerSprite(mon.sprite, true);
  // The ball behind the sprite skips layout off screen during a zoom. The
  // sprite stays outside it, because skipping clips overflow.
  return (
    <>
      <span className="pointer-events-none absolute inset-0 [content-visibility:auto]">
        <PokeballBg pokemon={pokemon} />
      </span>
      <img
        src={src}
        alt={labelOf(mon)}
        className="absolute left-1/2 top-1/2 z-10 h-auto max-w-none -translate-x-1/2 -translate-y-1/2"
        style={{ imageRendering: 'pixelated', width: desktop ? 'var(--cell)' : trackPart('--cell', size / 100) }}
        data-grid-sprite-size={desktop ? DESKTOP_CELL_PX : size}
        draggable={false}
      />
    </>
  );
}
