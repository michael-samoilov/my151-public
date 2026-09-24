import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
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
const INITIAL_DPR = typeof window === 'undefined' ? 1 : window.devicePixelRatio;

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
  const cells = (
    <>
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
        />
      ))}
    </>
  );

  return (
    <TypeColumnScroller desktop={desktop} fills={fills}>
      {cells}
    </TypeColumnScroller>
  );
}

function TypeColumnScroller({
  children,
  desktop,
  fills,
}: {
  children: ReactNode;
  desktop: boolean;
  fills: Record<string, number>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(0);
  const { frame, scrolling, showScrollCue } = useChartFrame(ref, minimapRef);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setCell(el.clientHeight / ROWS);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={desktop ? 'relative flex min-h-0 w-full flex-1 bg-background' : 'relative flex h-full min-h-0 w-full bg-background'}>
      <div
        data-testid="favorites-grid-generation-headers"
        className="relative z-20 grid h-full shrink-0 bg-background"
        style={{
          width: cell > 0 ? cell : undefined,
          gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
        }}
      >
        <Corner />
        {GEN_AXIS.map((gen) => (
          <HeaderCell key={String(gen)} id={gen} pin banded={gen !== 'favorite' && GEN_AXIS.indexOf(gen) % 2 === 1} />
        ))}
      </div>
      <div
        ref={ref}
        className="h-full min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain bg-background"
        style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
        data-testid="favorites-grid-scroll"
      >
        <div
          className="grid"
          style={{
            height: cell > 0 ? cell * ROWS : '100%',
            gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
            gridTemplateColumns: `repeat(${TYPE_AXIS.length}, minmax(0, 1fr))`,
            width: cell > 0
              ? desktop ? Math.max(cell * TYPE_AXIS.length, frame?.clientWidth ?? 0) : cell * TYPE_AXIS.length
              : '100%',
          }}
          data-testid="favorites-grid"
          data-axis="gen-major"
        >
          {children}
        </div>
      </div>
      <ChartMinimap frame={frame} scrolling={scrolling} fills={fills} mapRef={minimapRef} />
      {frame && chartOverflows(frame) && showScrollCue ? (
        <div data-testid="favorites-scroll-cue" className="pointer-events-none absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-full bg-card/95 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          <span>Scroll for more</span><span aria-hidden>→</span>
        </div>
      ) : null}
    </div>
  );
}

function GenRow({
  gen,
  fills,
  resolve,
  selected,
  onSelect,
}: {
  gen: GenAxisId;
  fills: Record<string, number>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId) => void;
}) {
  const banded = gen !== 'favorite' && GEN_AXIS.indexOf(gen) % 2 === 1;
  return (
    <>
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
        />
      ))}
    </>
  );
}

function Corner() {
  return (
    <div
      className="border-[0.5px] border-neutral-200 bg-background"
    />
  );
}

function HeaderCell({ id, pin = false, banded = false }: { id: TypeAxisId | GenAxisId; pin?: boolean; banded?: boolean }) {
  const iconSize = isGenNumber(id) ? 87 : 72;
  return (
    <div
      data-row-banded={pin ? banded : undefined}
      className={cn(
        'relative min-h-0 min-w-0 overflow-hidden border-[0.5px] border-neutral-200 bg-card',
        pin && 'sticky left-0 z-20',
      )}
    >
      {banded ? <span className="pointer-events-none absolute inset-0 bg-foreground/[0.026]" /> : null}
      <div className="absolute inset-0" style={{ containerType: 'size' }}>
        <div
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_span]:!h-full [&_span]:!w-full [&_span]:!text-[0.62em]"
          style={{ width: `${iconSize}cqmin`, height: `${iconSize}cqmin`, fontSize: `${iconSize}cqmin` }}
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
}: {
  type: TypeAxisId;
  gen: GenAxisId;
  banded: boolean;
  fills: Record<string, number>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId) => void;
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
        locked
          ? 'cursor-default bg-[repeating-linear-gradient(-45deg,#f4f4f5,#f4f4f5_3px,#ececee_3px,#ececee_6px)]'
          : mon ? 'cursor-pointer bg-transparent' : 'cursor-pointer bg-card',
        !locked && kind === 'pointer' && (mon ? 'bg-amber-50/50' : 'bg-amber-50'),
      )}
    >
      {banded && !locked ? <span className="pointer-events-none absolute inset-0 bg-foreground/[0.026]" /> : null}
      {mon ? (
        <Filled mon={mon} />
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

interface ChartMetrics {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  gridWidth: number;
  gridHeight: number;
  visibleLeft: number;
  visibleRight: number;
  visibleTop: number;
  visibleBottom: number;
  viewportRight: number;
  viewportBottom: number;
  visualScale: number;
  visible: boolean;
}

function useChartFrame(ref: RefObject<HTMLDivElement | null>, minimapRef: RefObject<HTMLDivElement | null>) {
  const [frame, setFrame] = useState<ChartMetrics | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const [showScrollCue, setShowScrollCue] = useState(() => {
    try { return sessionStorage.getItem('favorites-scroll-cue-seen') !== '1'; }
    catch { return true; }
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    const pinMinimap = () => {
      const map = minimapRef.current;
      if (!map) return;
      const visual = window.visualViewport;
      const scale = Math.max(1, (visual?.scale ?? 1) * window.devicePixelRatio / INITIAL_DPR);
      map.style.left = `${(visual?.offsetLeft ?? 0) + (visual?.width ?? window.innerWidth) - (map.offsetWidth + 12) / scale}px`;
      map.style.top = `${(visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight) - (map.offsetHeight + 12) / scale}px`;
      map.style.transform = `scale(${1 / scale})`;
    };
    const show = () => {
      setScrolling(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setScrolling(false), 350);
    };
    const read = () => {
      const grid = el.firstElementChild as HTMLElement | null;
      const visual = window.visualViewport;
      const bounds = el.getBoundingClientRect();
      // Compare both rectangles in document coordinates. Comparing visual
      // viewport offsets directly with getBoundingClientRect mixes coordinate
      // spaces in WebKit after the document itself has scrolled while zoomed.
      const pageLeft = visual?.pageLeft ?? window.scrollX;
      const pageTop = visual?.pageTop ?? window.scrollY;
      const pageRight = pageLeft + (visual?.width ?? window.innerWidth);
      const pageBottom = pageTop + (visual?.height ?? window.innerHeight);
      const frameLeft = bounds.left + window.scrollX;
      const frameTop = bounds.top + window.scrollY;
      const visibleLeft = Math.max(0, Math.min(el.clientWidth, pageLeft - frameLeft));
      const visibleRight = Math.max(0, Math.min(el.clientWidth, pageRight - frameLeft));
      const visibleTop = Math.max(0, Math.min(el.clientHeight, pageTop - frameTop));
      const visibleBottom = Math.max(0, Math.min(el.clientHeight, pageBottom - frameTop));
      const next = {
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        gridWidth: grid?.offsetWidth ?? el.scrollWidth,
        gridHeight: grid?.offsetHeight ?? el.scrollHeight,
        visibleLeft,
        visibleRight,
        visibleTop,
        visibleBottom,
        // Fixed positioning handles document scroll. Only the visual viewport's
        // offset within the layout viewport needs compensation during zoom.
        viewportRight: (visual?.offsetLeft ?? 0) + (visual?.width ?? window.innerWidth),
        viewportBottom: (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight),
        visualScale: Math.max(1, (visual?.scale ?? 1) * window.devicePixelRatio / INITIAL_DPR),
        visible: visibleRight > visibleLeft && visibleBottom > visibleTop,
      };
      setFrame(next);
    };
    const onVisualChange = () => {
      pinMinimap();
      read();
      if ((window.visualViewport?.scale ?? 1) > 1.01 || window.devicePixelRatio > INITIAL_DPR * 1.01) show();
    };
    const onScroll = () => {
      read();
      show();
      setShowScrollCue(false);
      try { sessionStorage.setItem('favorites-scroll-cue-seen', '1'); }
      catch { /* Storage can be unavailable in private browsing. */ }
    };
    read();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.visualViewport?.addEventListener('resize', onVisualChange);
    window.visualViewport?.addEventListener('scroll', onVisualChange);
    window.addEventListener('resize', onVisualChange);
    window.addEventListener('scroll', onVisualChange, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.visualViewport?.removeEventListener('resize', onVisualChange);
      window.visualViewport?.removeEventListener('scroll', onVisualChange);
      window.removeEventListener('resize', onVisualChange);
      window.removeEventListener('scroll', onVisualChange);
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [ref, minimapRef]);

  return { frame, scrolling, showScrollCue };
}

function chartOverflows(frame: ChartMetrics): boolean {
  return frame.scrollWidth > frame.clientWidth + 1 || frame.scrollHeight > frame.clientHeight + 1
    || frame.visibleRight - frame.visibleLeft < frame.clientWidth - 1
    || frame.visibleBottom - frame.visibleTop < frame.clientHeight - 1;
}

function ChartMinimap({
  frame,
  scrolling,
  fills,
  mapRef,
}: {
  frame: ChartMetrics | null;
  scrolling: boolean;
  fills: Record<string, number>;
  mapRef: RefObject<HTMLDivElement | null>;
}) {
  if (!frame || !frame.visible || !chartOverflows(frame)) return null;
  const max = 84;
  const cellHeight = frame.gridHeight / ROWS;
  const bodyWidth = frame.gridWidth;
  const bodyHeight = frame.gridHeight - cellHeight;
  const aspect = bodyWidth / Math.max(bodyHeight, 1);
  let mapW = max;
  let mapH = Math.round(max / aspect);
  if (mapH > max) {
    mapH = max;
    mapW = Math.round(max * aspect);
  }
  mapW = Math.max(48, mapW);
  mapH = Math.max(28, mapH);
  const sx = mapW / Math.max(bodyWidth, 1);
  const sy = mapH / Math.max(bodyHeight, 1);
  const bodyLeft = frame.scrollLeft + frame.visibleLeft;
  const bodyTop = frame.scrollTop + Math.max(0, frame.visibleTop - cellHeight);
  const bodyVisibleWidth = Math.max(0, frame.visibleRight - frame.visibleLeft);
  const bodyVisibleHeight = Math.max(0, frame.visibleBottom - Math.max(cellHeight, frame.visibleTop));
  const viewportWidth = Math.min(mapW, Math.max(2, bodyVisibleWidth * sx));
  const viewportHeight = Math.min(mapH, Math.max(2, bodyVisibleHeight * sy));
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
  return createPortal(
    <div
      ref={mapRef}
      data-testid="favorites-minimap"
      aria-hidden
      className="pointer-events-none fixed z-30 rounded-sm bg-background/85 p-[3px] shadow-sm transition-opacity duration-200"
      style={{
        opacity: scrolling ? 0.95 : 0,
        left: frame.viewportRight - (mapW + 18) / frame.visualScale,
        top: frame.viewportBottom - (mapH + 18) / frame.visualScale,
        transform: `scale(${1 / frame.visualScale})`,
        transformOrigin: 'top left',
      }}
    >
      <div className="relative" style={{ width: mapW, height: mapH }}>
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
          data-testid="favorites-minimap-viewport"
          className="absolute bg-primary/10"
          style={{
            left: minimapViewportX(bodyLeft, sx, mapW, viewportWidth),
            top: Math.max(0, Math.min(mapH - viewportHeight, bodyTop * sy)),
            width: viewportWidth,
            height: viewportHeight,
            outline: '1px solid var(--color-primary)',
            outlineOffset: 1,
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

function Filled({ mon }: { mon: PickerMon }) {
  const pokemon = { types: mon.types } as Pokemon;
  const size = gridSpriteSizePercent(mon.sprite);
  return (
    <>
      <PokeballBg pokemon={pokemon} />
      <img
        src={mon.sprite}
        alt={mon.name}
        className="absolute left-1/2 top-1/2 z-10 h-auto max-w-none -translate-x-1/2 -translate-y-1/2"
        style={{ imageRendering: 'pixelated', width: `${size}%` }}
        data-grid-sprite-size={size}
        draggable={false}
      />
    </>
  );
}
