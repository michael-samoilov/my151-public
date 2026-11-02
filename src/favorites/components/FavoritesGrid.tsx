import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { RedXIcon } from '@/components/browser/EvoLineCard';
import { PokeballBg } from '@/components/shared/PokeballBg';
import { TILE_ACTION_BUTTON_CLASS } from '@/components/shared/PokemonTile';
import { ShinyDisc } from '@/components/shiny/ShinyMarks';
import type { ShinyMark } from '@/components/shiny/shinyMarks';
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
import { isShinyCell, pickerShinySprite } from '../model/shiny';
import { minimapViewportX } from '../model/minimap';
import { ExtraMark, EmptyBall, RomanDisc, TypeIcon } from './marks';
import { AxisBadge, GenerationBadge } from './WordBadge';
import { TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { WideBadge } from './WideBadge';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { NameTooltip } from './NameTooltip';

const PREVIEW = new URLSearchParams(!PRODUCTION_DEPLOY && typeof location !== 'undefined' ? location.search : '');
const BADGE_ZOOM = PREVIEW.get('badges') === 'wide' ? 'wide' : PREVIEW.get('badges') === 'capped' ? 'capped' : 'scale';
const GEN_ROW_BADGES = PREVIEW.get('genbadges') === '1';
const HEAD_ICON = 0.72;
const HEAD_GAP = 0.03;
const HEAD_BADGE = 0.18;

function headRowPx(cell: number, head: number): number {
  return BADGE_ZOOM === 'scale' ? head + HEAD_BADGE * (cell - head) : head;
}

const ROWS = GEN_AXIS.length + 1;
const COLS = TYPE_AXIS.length + 1;
const DESKTOP_CELL_PX = 96;
const ZOOM_RANGE = { mobile: { min: 1, max: 4 }, desktop: { min: 1, max: 2.5 } };
const HEAD_MAX_ZOOM = 1.25;
const MINIMAP_SHOWN = '0.95';
const MINIMAP_HOVER = '1';
const MINIMAP_HOVER_MS = 200;
const WHEEL_SETTLE_MS = 120;
const MINIMAP_LINGER_MS = 1200;
const MINIMAP_PAD = 3;
// On desktop, the minimap centers on favorite × legendary and favorite ×
// gimmick, the two disabled cells beside favorite × favorite.
function minimapRight(base: number, mapWidth: number, desktop: boolean): number {
  const outer = mapWidth + 2 * MINIMAP_PAD;
  return Math.max(0, Math.round(desktop ? 2 * base - outer / 2 : 2.57 * base - 0.67 * outer));
}
function overlapsPane(map: HTMLElement, scroller: HTMLElement): boolean {
  const pane = scroller.querySelector('[data-testid="favorites-picker"]')?.getBoundingClientRect();
  if (!pane) return false;
  const m = map.getBoundingClientRect();
  return m.left < pane.right && m.right > pane.left && m.top < pane.bottom && m.bottom > pane.top;
}

function trackPart(track: '--cell' | '--head', fraction: number): string {
  return `calc((var(${track}) - 1px) * ${fraction})`;
}

function facingEdge(pane: DOMRect, cell: DOMRect): string {
  if (pane.top >= cell.bottom - 1) return 'top';
  if (pane.bottom <= cell.top + 1) return 'bottom';
  return pane.left >= cell.right - 1 ? 'left' : 'right';
}

function badgeScale(cell: number, head: number, cell0: number, head0: number): { x: number; y: number } {
  if (BADGE_ZOOM === 'scale') return { x: cell / cell0, y: cell / cell0 };
  const capped = Math.min(cell, head) / Math.min(cell0, head0);
  return BADGE_ZOOM === 'wide' ? { x: cell / cell0, y: capped } : { x: capped, y: capped };
}

function minimapBox(desktop: boolean): { width: number; height: number } {
  const width = desktop ? 180 : 100;
  return { width, height: Math.round(width * GEN_AXIS.length / TYPE_AXIS.length) };
}

type BodyPoint = { u: number; v: number };
type ZoomTarget = { zoom: number; x: number; y: number; body?: BodyPoint };
type Pinch = { source: 'touch' | 'gesture'; zoom: number; distance: number; body: BodyPoint };
type GestureEventLike = UIEvent & { scale: number; clientX: number; clientY: number };
type View = { cell: number; head: number; headRow: number; left: number; top: number; width: number; height: number };
type HeadParts = { icon: HTMLElement; badge: HTMLElement; iconTop: number; iconH: number; badgeTop: number; badgeH: number };
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

const NO_SHINY_PICKS: Readonly<Record<string, number>> = {};

/** The edits a filled cell's hover controls make. The admin chart passes none and shows no controls. */
type CellEdits = {
  clear: (type: TypeAxisId, gen: GenAxisId) => void;
  place: (type: TypeAxisId, gen: GenAxisId, id: number, shiny: boolean) => void;
};

export function FavoritesGrid({
  fills,
  shiny = NO_SHINY_PICKS,
  resolve,
  selected,
  onSelect,
  edits,
  desktop,
  pane,
  fitFrame = false,
}: {
  fills: Record<string, number>;
  shiny?: Readonly<Record<string, number>>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId, keyboard?: boolean) => void;
  edits?: CellEdits;
  desktop: boolean;
  pane?: ReactNode;
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
          shiny={shiny}
          resolve={resolve}
          selected={selected}
          onSelect={onSelect}
          edits={desktop ? edits : undefined}
          desktop={desktop}
        />
      ))}
    </ZoomFrame>
  );
}

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
    let wheel: { x: number; y: number; time: number; body: BodyPoint } | null = null;
    let frame = 0;
    let fadeTimer = 0;
    let paneFrame = 0;
    let scrolled = false;
    let hoverTimer = 0;
    let armed = false;
    let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;

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
    const gridLeft = () => {
      const grid = desktop || fitFrame ? el.firstElementChild : null;
      if (!grid) return 0;
      return grid.getBoundingClientRect().left - el.getBoundingClientRect().left - el.clientLeft + el.scrollLeft;
    };
    const shown = (): View => preview?.view
      ?? { ...tracks(), left: el.scrollLeft, top: el.scrollTop, width: el.scrollWidth, height: el.scrollHeight };
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
      // The offset counts from the grid's right edge at zoom 1, so the minimap
      // covers the disabled cells beside favorite × favorite. A centered grid
      // narrower than the frame leaves a gap on its right.
      const gap = desktop || fitFrame ? Math.max(0, (el.clientWidth - base * COLS) / 2) : 0;
      map.style.right = `${el.offsetWidth - el.clientWidth - el.clientLeft + Math.round(gap) + minimapRight(base, box.width, desktop)}px`;
      map.style.bottom = `${el.offsetHeight - el.clientHeight - el.clientTop}px`;
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
    const showMap = () => {
      const map = mapRef.current;
      if (!map) return;
      // A scroll does not draw the minimap over an open selector's tiles. The
      // check repeats each frame while the minimap shows, because opening a
      // selector scrolls the grid before the selector grows to full size.
      const hideUnderPane = () => {
        if (armed || drag || !overlapsPane(map, el)) return false;
        map.style.transition = 'none';
        map.style.opacity = '0';
        void map.offsetWidth;
        map.style.transition = '';
        return true;
      };
      if (hideUnderPane()) return;
      const until = performance.now() + MINIMAP_LINGER_MS;
      const watch = () => {
        paneFrame = !hideUnderPane() && performance.now() < until ? requestAnimationFrame(watch) : 0;
      };
      cancelAnimationFrame(paneFrame);
      paneFrame = requestAnimationFrame(watch);
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
      const tx = gl + head - start.head * s - start.gridLeft + el.scrollLeft - left;
      const ty = headRow - start.headRow * s + el.scrollTop - top;
      p.grid.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      const kHead = head / start.head;
      const kRow = headRow / start.headRow;
      const ax = (Math.max(0, gl - left) - start.gridLeft + el.scrollLeft - Math.max(0, el.scrollLeft - start.gridLeft) * s - tx) / s;
      const ay = (el.scrollTop * (1 - s) - ty) / s;
      for (const node of p.rows) node.style.transform = `translateY(${ay}px) scaleY(${kRow / s})`;
      for (const node of p.cols) node.style.transform = `translateX(${ax}px) scaleX(${kHead / s})`;
      if (p.corner) p.corner.style.transform = `translate(${ax}px, ${ay}px) scale(${kHead / s}, ${kRow / s})`;
      for (const node of p.marks) node.style.scale = `1 ${kHead / s}`;
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
      if (preview) zoomTo({ ...preview.focus, zoom: preview.zoom });
      paint(true);
      if (scrolled) return;
      scrolled = true;
      firstScrollRef.current();
    };

    const overMap = (x: number, y: number) => {
      const map = mapRef.current;
      if (!map || map.style.display === 'none') return false;
      const rect = map.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };
    // An open selector wins where it overlaps the minimap, so every tile in it
    // stays clickable: the minimap does not arm under the selector.
    const overSelector = (x: number, y: number) => {
      const rect = el.querySelector('[data-testid="favorites-picker"]')?.getBoundingClientRect();
      return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
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
      if (!overMap(event.clientX, event.clientY) || overSelector(event.clientX, event.clientY)) arm(false);
      else if (!armed && !hoverTimer) hoverTimer = window.setTimeout(() => arm(true), MINIMAP_HOVER_MS);
    };
    const onFrameLeave = () => {
      if (!drag) arm(false);
    };
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
      cancelAnimationFrame(paneFrame);
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
  shiny,
  resolve,
  selected,
  onSelect,
  edits,
  desktop,
}: {
  gen: GenAxisId;
  fills: Record<string, number>;
  shiny: Readonly<Record<string, number>>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId, keyboard?: boolean) => void;
  edits?: CellEdits;
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
          shiny={shiny}
          resolve={resolve}
          selected={selected}
          onSelect={onSelect}
          edits={edits}
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
  shiny,
  resolve,
  selected,
  onSelect,
  edits,
  desktop,
}: {
  type: TypeAxisId;
  gen: GenAxisId;
  banded: boolean;
  fills: Record<string, number>;
  shiny: Readonly<Record<string, number>>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId, keyboard?: boolean) => void;
  edits?: CellEdits;
  desktop: boolean;
}) {
  const kind = kindFor(type, gen);
  const dwell = useRef(0);
  const cellRef = useRef<HTMLButtonElement>(null);
  const id = fills[cellKey(type, gen)];
  const mon = id == null ? undefined : resolve(id);
  const shinyHere = mon != null && isShinyCell(fills, shiny, cellKey(type, gen));
  const t = useT();
  const isSel = selected?.type === type && selected?.gen === gen;
  const tint = isTypeName(type) ? TYPE_COLORS[type] : undefined;
  const locked = kind === 'disabled' || kind === 'null';
  const ball = kind !== 'pointer' ? 'poke' : type === 'favorite' && gen === 'favorite' ? 'master' : 'ultra';

  const cell = (
    <button
      ref={cellRef}
      type="button"
      disabled={locked}
      onClick={(event) => onSelect(type, gen, event.detail === 0)}
      onPointerEnter={locked ? undefined : (event) => {
        if (event.pointerType === 'mouse') dwell.current = window.setTimeout(() => prefetchCell(type, gen), 80);
        else prefetchCell(type, gen);
      }}
      onPointerLeave={() => window.clearTimeout(dwell.current)}
      onPointerDown={locked ? undefined : () => prefetchCell(type, gen)}
      onFocus={locked ? undefined : () => prefetchCell(type, gen)}
      aria-label={`${coordinateLabel(type, gen)}${mon ? ` · ${labelOf(mon)}` : ''}${shinyHere ? ` · ${t('shiny.label')}` : ''}`}
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
        !locked && 'hover:bg-linear-to-b hover:from-foreground/5 hover:to-foreground/5',
      )}
    >
      {banded && !locked ? <span className="pointer-events-none absolute inset-0 bg-foreground/[0.026]" /> : null}
      {mon ? (
        <Filled mon={mon} shiny={shinyHere} desktop={desktop} />
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
  if (!mon || locked) return cell;
  const named = <NameTooltip mon={mon}>{cell}</NameTooltip>;
  if (!edits) return named;
  // A pointer cell takes its look from the cells it points at, and its sheet chooses between two looks, so it has no shiny control of its own.
  const mark: ShinyMark | null = kind === 'pointer' ? null
    : pickerShinySprite(mon.id) === null ? 'none' : shinyHere ? 'on' : 'off';
  return (
    <HoverControls
      name={labelOf(mon)}
      mark={mark}
      onShiny={(on) => edits.place(type, gen, mon.id, on)}
      onRemove={(keyboard) => {
        edits.clear(type, gen);
        // Clearing remounts the cell's button, so focus goes back to it after a keyboard remove.
        if (keyboard) requestAnimationFrame(() => cellRef.current?.focus({ preventScroll: true }));
      }}
    >
      {named}
    </HoverControls>
  );
}

const CONTROL_SHOWN = 'opacity-0 transition-opacity group-hover/cell:opacity-100 group-has-[:focus-visible]/cell:opacity-100';
// A screen with no hover never shows the controls, so they must not catch its taps either.
const CONTROL_PRESSABLE = 'cursor-pointer touch-manipulation pointer-events-none group-hover/cell:pointer-events-auto';
const SHINY_CORNER = cn(TILE_ACTION_BUTTON_CLASS, 'right-auto left-[calc(var(--tile-sprite)*0.05)]');

/**
 * Wraps a filled cell with the shiny and remove controls that a mouse over it shows, sized like
 * the Dex tile's remove button. A span, not a div: the zoom and picker specs read the grid's div
 * children as its headers.
 */
function HoverControls({ children, name, mark, onShiny, onRemove }: {
  children: ReactElement;
  name: string;
  mark: ShinyMark | null;
  onShiny: (on: boolean) => void;
  onRemove: (keyboard: boolean) => void;
}) {
  const t = useT();
  return (
    <span className="group/cell relative grid min-h-0 min-w-0" style={{ ['--tile-sprite' as string]: 'var(--cell)' }}>
      {children}
      {mark === 'none' ? (
        <span role="img" aria-label={t('shiny.none')} data-shiny-mark={mark} className={cn(SHINY_CORNER, CONTROL_SHOWN, 'pointer-events-none')}>
          <ShinyDisc mark={mark} />
        </span>
      ) : mark ? (
        <button
          type="button"
          aria-label={t('league.cell.shiny', { name })}
          aria-pressed={mark === 'on'}
          data-shiny-mark={mark}
          data-cell-control="shiny"
          onClick={() => onShiny(mark === 'off')}
          className={cn(SHINY_CORNER, CONTROL_SHOWN, CONTROL_PRESSABLE)}
        >
          <ShinyDisc mark={mark} />
        </button>
      ) : null}
      {/* No translateZ(0), unlike the Dex tile: a compositing layer per filled cell changes how the open selector's edges paint. */}
      <button
        type="button"
        aria-label={t('builder.remove', { name })}
        data-cell-control="remove"
        onClick={(event) => onRemove(event.detail === 0)}
        className={cn(TILE_ACTION_BUTTON_CLASS, 'tile-remove-target', CONTROL_SHOWN, CONTROL_PRESSABLE)}
      >
        <RedXIcon className="h-full w-full" />
      </button>
    </span>
  );
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

function Filled({ mon, shiny, desktop }: { mon: PickerMon; shiny: boolean; desktop: boolean }) {
  const pokemon = { types: mon.types } as Pokemon;
  const size = gridSpriteSizePercent(mon.sprite);
  const src = usePickerSprite((shiny ? pickerShinySprite(mon.id) : null) ?? mon.sprite, true);
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
