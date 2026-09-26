import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PokeballBg } from '@/components/shared/PokeballBg';
import { TYPE_COLORS } from '@/data/type-colors';
import { cn } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import {
  GEN_AXIS,
  TYPE_AXIS,
  EXTRA_COLOR,
  cellKey,
  isGenNumber,
  isTypeName,
  type GenAxisId,
  type TypeAxisId,
} from '../model/cells';
import { kindFor } from '../model/eligibility';
import type { PickerMon } from '../model/catalog';
import { gridSpriteSizePercent } from '../model/gridSpriteSize';
import { minimapViewportX } from '../model/minimap';
import { ExtraMark, EmptyBall, RomanDisc, TypeIcon } from './marks';

const ROWS = GEN_AXIS.length + 1;
const COLS = TYPE_AXIS.length + 1;
const DESKTOP_CELL_PX = 96;
// Zoom multiplies the cell size, so 1 is the unzoomed grid. Mobile cells
// start small and get more headroom than native-size desktop sprites.
const ZOOM_RANGE = { mobile: { min: 1, max: 4 }, desktop: { min: 1, max: 2.5 } };

/** A length inside a cell's 0.5px borders, as a fraction of it. A container
 *  unit would give the same size, but 300 size containers make every zoom
 *  frame run a style pass per cell. */
function cellPart(fraction: number): string {
  return `calc((var(--cell) - 1px) * ${fraction})`;
}

/** Minimap size. Body cells are square, so it keeps the body's aspect ratio. */
function minimapBox(desktop: boolean): { width: number; height: number } {
  const width = desktop ? 180 : 112;
  return { width, height: Math.round(width * GEN_AXIS.length / TYPE_AXIS.length) };
}

/** The zoom to draw next. `u` and `v` are the content point, in cells, that
 *  stays under (x, y); without them it is the point under (x, y) now. */
type ZoomTarget = { zoom: number; x: number; y: number; u?: number; v?: number };
type Pinch = { source: 'touch' | 'gesture'; zoom: number; distance: number; u: number; v: number };
type GestureEventLike = UIEvent & { scale: number; clientX: number; clientY: number };

export function FavoritesGrid({
  fills,
  resolve,
  selected,
  onSelect,
  desktop,
}: {
  fills: Record<string, number>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId) => void;
  desktop: boolean;
}) {
  return (
    <ZoomFrame desktop={desktop} fills={fills}>
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
  fills,
}: {
  children: ReactNode;
  desktop: boolean;
  fills: Record<string, number>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const [showScrollCue, setShowScrollCue] = useState(() => {
    try { return sessionStorage.getItem('favorites-scroll-cue-seen') !== '1'; }
    catch { return true; }
  });
  useZoomFrame({ ref, mapRef, windowRef, cueRef }, desktop, () => {
    setShowScrollCue(false);
    try { sessionStorage.setItem('favorites-scroll-cue-seen', '1'); }
    catch { /* Storage can be unavailable in private browsing. */ }
  });

  return (
    <div className="relative h-full min-h-0 w-full">
      <div
        ref={ref}
        className="isolate h-full w-full overflow-auto overscroll-contain bg-background"
        style={{ touchAction: 'pan-x pan-y', scrollPaddingTop: 'var(--cell)', scrollPaddingLeft: 'var(--cell)' }}
        data-testid="favorites-grid-scroll"
        data-zoom="1"
      >
        <div
          className="grid"
          style={{
            width: `calc(var(--cell) * ${COLS})`,
            height: `calc(var(--cell) * ${ROWS})`,
            gridTemplateRows: `repeat(${ROWS}, var(--cell))`,
            gridTemplateColumns: `repeat(${COLS}, var(--cell))`,
          }}
          data-testid="favorites-grid"
          data-axis="gen-major"
        >
          {children}
        </div>
      </div>
      <ChartMinimap fills={fills} mapRef={mapRef} windowRef={windowRef} box={minimapBox(desktop)} />
      {showScrollCue ? (
        <div ref={cueRef} data-testid="favorites-scroll-cue" className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full bg-card/95 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          <span>Scroll for more</span><span aria-hidden>→</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sizes cells, applies pinch and ctrl+wheel zoom, and paints the minimap.
 *
 * Gestures write the cell size and scroll offsets straight to the DOM once
 * per animation frame. React renders none of it, so a pinch never waits on a
 * render.
 */
function useZoomFrame(
  refs: {
    ref: RefObject<HTMLDivElement | null>;
    mapRef: RefObject<HTMLDivElement | null>;
    windowRef: RefObject<HTMLDivElement | null>;
    cueRef: RefObject<HTMLDivElement | null>;
  },
  desktop: boolean,
  onFirstScroll: () => void,
) {
  const { ref, mapRef, windowRef, cueRef } = refs;
  const zoomRef = useRef(1);
  const firstScrollRef = useRef(onFirstScroll);
  useLayoutEffect(() => { firstScrollRef.current = onFirstScroll; });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const range = desktop ? ZOOM_RANGE.desktop : ZOOM_RANGE.mobile;
    const clampZoom = (value: number) => Math.max(range.min, Math.min(range.max, value));
    const baseCell = () => desktop ? DESKTOP_CELL_PX : el.clientHeight / ROWS;
    const box = minimapBox(desktop);
    let base = baseCell();
    let zoom = clampZoom(zoomRef.current);
    let target: ZoomTarget | null = null;
    let pinch: Pinch | null = null;
    let frame = 0;
    let fadeTimer = 0;
    let scrolled = false;

    const writeCell = () => {
      zoomRef.current = zoom;
      el.style.setProperty('--cell', `${base * zoom}px`);
      el.dataset.zoom = String(Math.round(zoom * 1000) / 1000);
    };
    const paint = (show: boolean) => {
      const map = mapRef.current;
      const view = windowRef.current;
      const overflows = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      if (cueRef.current) cueRef.current.style.display = overflows ? '' : 'none';
      if (!map || !view) return;
      map.style.display = overflows ? '' : 'none';
      if (!overflows) return;
      // Sit in the scrollport corner, clear of classic scrollbars.
      map.style.right = `${el.offsetWidth - el.clientWidth - el.clientLeft + 8}px`;
      map.style.bottom = `${el.offsetHeight - el.clientHeight - el.clientTop + 8}px`;
      // The sticky headers cover one cell on each axis, so the visible body
      // starts at the scroll offset and is one cell short of the frame.
      const cell = base * zoom;
      const sx = box.width / (TYPE_AXIS.length * cell);
      const sy = box.height / (GEN_AXIS.length * cell);
      const width = Math.min(box.width, Math.max(2, (el.clientWidth - cell) * sx));
      const height = Math.min(box.height, Math.max(2, (el.clientHeight - cell) * sy));
      view.style.left = `${minimapViewportX(el.scrollLeft, sx, box.width, width)}px`;
      view.style.top = `${Math.max(0, Math.min(box.height - height, el.scrollTop * sy))}px`;
      view.style.width = `${width}px`;
      view.style.height = `${height}px`;
      if (!show) return;
      map.style.opacity = '0.95';
      window.clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(() => { map.style.opacity = '0'; }, 350);
    };
    const draw = () => {
      frame = 0;
      if (!target) return;
      const cell = base * zoom;
      const u = target.u ?? (el.scrollLeft + target.x) / cell;
      const v = target.v ?? (el.scrollTop + target.y) / cell;
      zoom = target.zoom;
      writeCell();
      el.scrollLeft = u * base * zoom - target.x;
      el.scrollTop = v * base * zoom - target.y;
      target = null;
      paint(true);
    };
    const zoomTo = (next: ZoomTarget) => {
      target = next;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const local = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      return { x: clientX - rect.left - el.clientLeft, y: clientY - rect.top - el.clientTop };
    };
    const startPinch = (source: Pinch['source'], clientX: number, clientY: number, distance: number): Pinch => {
      const point = local(clientX, clientY);
      const cell = base * zoom;
      pinch = { source, zoom, distance, u: (el.scrollLeft + point.x) / cell, v: (el.scrollTop + point.y) / cell };
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
      zoomTo({ zoom: clampZoom(start.zoom * pair.distance / start.distance), ...local(pair.x, pair.y), u: start.u, v: start.v });
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2 && pinch?.source === 'touch') pinch = null;
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
      zoomTo({ zoom: clampZoom(pinch.zoom * gesture.scale), ...local(gesture.clientX, gesture.clientY), u: pinch.u, v: pinch.v });
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      if (pinch?.source === 'gesture') pinch = null;
    };
    // Chromium and Firefox report a trackpad pinch as a ctrl+wheel event.
    // Chromium sets deltaY to -100 * ln(scale). A mouse wheel step is larger,
    // so cap each event.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      // A Safari trackpad pinch already zooms through gesture events.
      if (pinch?.source === 'gesture') return;
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * 33;
      const factor = Math.exp(-Math.max(-50, Math.min(50, delta)) / 100);
      zoomTo({ zoom: clampZoom((target?.zoom ?? zoom) * factor), ...local(event.clientX, event.clientY) });
    };
    const onScroll = () => {
      paint(true);
      if (scrolled) return;
      scrolled = true;
      firstScrollRef.current();
    };
    const onResize = () => {
      const next = baseCell();
      if (next > 0 && Math.abs(next - base) > 0.01) {
        const ratio = next / base;
        const left = el.scrollLeft * ratio;
        const top = el.scrollTop * ratio;
        base = next;
        writeCell();
        el.scrollLeft = left;
        el.scrollTop = top;
      }
      paint(false);
    };

    writeCell();
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
    return () => {
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
      window.clearTimeout(fadeTimer);
    };
  }, [ref, mapRef, windowRef, cueRef, desktop]);
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
  onSelect: (type: TypeAxisId, gen: GenAxisId) => void;
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
  return <div className="sticky left-0 top-0 z-40 border-[0.5px] border-neutral-200 bg-background" />;
}

function HeaderCell({ id, pin = false, banded = false }: { id: TypeAxisId | GenAxisId; pin?: boolean; banded?: boolean }) {
  const iconSize = isGenNumber(id) ? 87 : 72;
  return (
    <div
      data-row-banded={pin ? banded : undefined}
      className={cn(
        'min-h-0 min-w-0 overflow-hidden border-[0.5px] border-neutral-200 bg-card',
        // Sprites paint above body cells at z-10. Headers stay above them,
        // and the type row stays above the generation column.
        pin ? 'sticky left-0 z-20' : 'sticky top-0 z-30',
      )}
    >
      {banded ? <span className="pointer-events-none absolute inset-0 bg-foreground/[0.026]" /> : null}
      <div
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_span]:!h-full [&_span]:!w-full [&_span]:!text-[0.62em]"
        style={{ width: cellPart(iconSize / 100), height: cellPart(iconSize / 100), fontSize: cellPart(iconSize / 100) }}
      >
        {isTypeName(id) ? (
          <TypeIcon type={id} size={32} />
        ) : isGenNumber(id) ? (
          <RomanDisc gen={id} size={32} />
        ) : (
          <ExtraMark id={id} size={32} />
        )}
      </div>
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
  onSelect: (type: TypeAxisId, gen: GenAxisId) => void;
  desktop: boolean;
}) {
  const kind = kindFor(type, gen);
  const id = fills[cellKey(type, gen)];
  const mon = id == null ? undefined : resolve(id);
  const isSel = selected?.type === type && selected?.gen === gen;
  const tint = isTypeName(type) ? TYPE_COLORS[type] : undefined;
  const locked = kind === 'disabled' || kind === 'null';

  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => onSelect(type, gen)}
      data-testid={`favorites-cell-${type}-${gen}`}
      data-kind={kind}
      data-row-banded={banded}
      className={cn(
        'relative min-h-0 min-w-0 overflow-visible border-[0.5px] border-neutral-200 p-0',
        // Off-screen empty cells skip layout while a zoom resizes every
        // cell. Filled cells cannot, because skipping clips their sprites.
        !mon && !locked && '[content-visibility:auto]',
        locked
          ? 'cursor-default bg-[repeating-linear-gradient(-45deg,#f4f4f5,#f4f4f5_3px,#ececee_3px,#ececee_6px)]'
          : mon ? 'cursor-pointer bg-transparent' : 'cursor-pointer bg-card',
        !locked && kind === 'pointer' && (mon ? 'bg-amber-50/50' : 'bg-amber-50'),
      )}
    >
      {banded && !locked ? <span className="pointer-events-none absolute inset-0 bg-foreground/[0.026]" /> : null}
      {mon ? (
        <Filled mon={mon} desktop={desktop} />
      ) : locked ? null : (
        <span
          data-testid="favorites-empty-ball"
          className="pointer-events-none absolute left-[5%] top-[5%] h-[90%] w-[90%]"
        >
          <EmptyBall className="block h-full w-full overflow-visible text-muted-foreground/20" />
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
      const tint = isTypeName(type) ? TYPE_COLORS[type] : EXTRA_COLOR[type];
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
  // useZoomFrame paints the position, viewport window, and opacity.
  return (
    <div
      ref={mapRef}
      data-testid="favorites-minimap"
      aria-hidden
      className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-sm bg-background/85 p-[3px] shadow-sm transition-opacity duration-200"
      style={{ opacity: 0 }}
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
          className="absolute bg-primary/10"
          style={{ outline: '1px solid var(--color-primary)', outlineOffset: 1 }}
        />
      </div>
    </div>
  );
}

function Filled({ mon, desktop }: { mon: PickerMon; desktop: boolean }) {
  const pokemon = { types: mon.types } as Pokemon;
  const size = gridSpriteSizePercent(mon.sprite);
  // The ball behind the sprite skips layout off screen during a zoom. The
  // sprite stays outside it, because skipping clips overflow.
  return (
    <>
      <span className="pointer-events-none absolute inset-0 [content-visibility:auto]">
        <PokeballBg pokemon={pokemon} />
      </span>
      <img
        src={mon.sprite}
        alt={mon.name}
        className="absolute left-1/2 top-1/2 z-10 h-auto max-w-none -translate-x-1/2 -translate-y-1/2"
        style={{ imageRendering: 'pixelated', width: desktop ? 'var(--cell)' : cellPart(size / 100) }}
        data-grid-sprite-size={desktop ? DESKTOP_CELL_PX : size}
        draggable={false}
      />
    </>
  );
}
