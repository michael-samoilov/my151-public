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
import { ExtraMark, EmptyBall, RomanDisc, TypeIcon } from './marks';

const COLS = TYPE_AXIS.length + 1;
const ROWS = GEN_AXIS.length + 1;

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
      <Corner pin />
      {TYPE_AXIS.map((id) => (
        <HeaderCell key={`h-${String(id)}`} id={id} />
      ))}
      {GEN_AXIS.map((gen) => (
        <GenRow
          key={String(gen)}
          gen={gen}
          pin
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
  const [cell, setCell] = useState(0);
  const { frame, scrolling } = useChartFrame(ref);

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
    <div className={desktop ? 'relative flex min-h-0 w-full flex-1' : 'relative h-full min-h-0 w-full'}>
      <div
        ref={ref}
        className="h-full min-h-0 w-full overflow-x-auto overflow-y-hidden overscroll-x-contain bg-card"
        style={{ touchAction: 'pan-x pan-y' }}
        data-testid="favorites-grid-scroll"
      >
        <div
          className="grid"
          style={{
            height: cell > 0 ? cell * ROWS : '100%',
            gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            width: cell > 0
              ? desktop ? Math.max(cell * COLS, frame?.clientWidth ?? 0) : cell * COLS
              : '100%',
          }}
          data-testid="favorites-grid"
          data-axis="gen-major"
        >
          {children}
        </div>
      </div>
      <ChartMinimap frame={frame} scrolling={scrolling} fills={fills} />
    </div>
  );
}

function GenRow({
  gen,
  pin,
  fills,
  resolve,
  selected,
  onSelect,
}: {
  gen: GenAxisId;
  pin: boolean;
  fills: Record<string, number>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId) => void;
}) {
  return (
    <>
      <HeaderCell id={gen} pin={pin} />
      {TYPE_AXIS.map((type) => (
        <BodyCell
          key={cellKey(type, gen)}
          type={type}
          gen={gen}
          fills={fills}
          resolve={resolve}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function Corner({ pin }: { pin: boolean }) {
  return (
    <div
      className={cn(
        'border-[0.5px] border-neutral-200 bg-neutral-50',
        pin && 'sticky left-0 z-20',
      )}
    />
  );
}

function HeaderCell({ id, pin = false }: { id: TypeAxisId | GenAxisId; pin?: boolean }) {
  return (
    <div
      className={cn(
        'relative min-h-0 min-w-0 overflow-hidden border-[0.5px] border-neutral-200 bg-card',
        pin && 'sticky left-0 z-20',
      )}
    >
      <div className="absolute inset-0" style={{ containerType: 'size' }}>
        <div
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center [&_img]:h-full [&_img]:w-full [&_img]:object-contain [&_span]:!h-full [&_span]:!w-full [&_span]:!text-[0.62em]"
          style={{ width: '72cqmin', height: '72cqmin', fontSize: '72cqmin' }}
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
  fills,
  resolve,
  selected,
  onSelect,
}: {
  type: TypeAxisId;
  gen: GenAxisId;
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
      className={cn(
        'relative min-h-0 min-w-0 overflow-visible border-[0.5px] border-neutral-200 p-0 [container-type:size]',
        locked
          ? 'cursor-default bg-[repeating-linear-gradient(-45deg,#f4f4f5,#f4f4f5_3px,#ececee_3px,#ececee_6px)]'
          : mon ? 'z-[2] cursor-pointer bg-transparent' : 'cursor-pointer bg-card',
        kind === 'pointer' && (mon ? 'bg-amber-50/50' : 'bg-amber-50'),
        isSel && (mon ? 'z-[3]' : 'z-[1]'),
      )}
    >
      {mon ? (
        <Filled mon={mon} />
      ) : locked ? null : (
        <span
          data-testid="favorites-empty-ball"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: '64cqmin', height: '64cqmin' }}
        >
          <EmptyBall className="block h-full w-full overflow-visible text-muted-foreground/20 -rotate-[30deg]" />
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
}

function useChartFrame(ref: RefObject<HTMLDivElement | null>) {
  const [frame, setFrame] = useState<ChartMetrics | null>(null);
  const [scrolling, setScrolling] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    const show = () => {
      setScrolling(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setScrolling(false), 700);
    };
    const read = () => {
      const grid = el.firstElementChild as HTMLElement | null;
      const next = {
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        gridWidth: grid?.offsetWidth ?? el.scrollWidth,
        gridHeight: grid?.offsetHeight ?? el.scrollHeight,
      };
      setFrame(next);
    };
    const onScroll = () => {
      read();
      show();
    };
    read();
    el.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [ref]);

  return { frame, scrolling };
}

function chartOverflows(frame: ChartMetrics): boolean {
  return frame.scrollWidth > frame.clientWidth + 1 || frame.scrollHeight > frame.clientHeight + 1;
}

function ChartMinimap({
  frame,
  scrolling,
  fills,
}: {
  frame: ChartMetrics | null;
  scrolling: boolean;
  fills: Record<string, number>;
}) {
  if (!frame || !chartOverflows(frame)) return null;
  const max = 84;
  const cellWidth = frame.gridWidth / COLS;
  const cellHeight = frame.gridHeight / ROWS;
  const bodyWidth = frame.gridWidth - cellWidth;
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
  const viewportWidth = Math.min(mapW, Math.max(2, (frame.clientWidth - cellWidth) * sx));
  const viewportHeight = Math.min(mapH, Math.max(2, (frame.clientHeight - cellHeight) * sy));
  const cells: ReactNode[] = [];
  for (const gen of GEN_AXIS) {
    for (const type of TYPE_AXIS) {
      const kind = kindFor(type, gen);
      const filled = fills[cellKey(type, gen)] != null;
      let background = '#e4e4e7';
      if (kind === 'disabled' || kind === 'null') background = 'transparent';
      else if (filled) background = isTypeName(type) ? TYPE_COLORS[type] : EXTRA_COLOR[type];
      cells.push(
        <div
          key={cellKey(type, gen)}
          data-kind={kind}
          data-filled={String(filled)}
          style={{ background }}
        />,
      );
    }
  }
  return (
    <div
      data-testid="favorites-minimap"
      aria-hidden
      className="pointer-events-none absolute right-2 bottom-2 z-30 rounded-sm bg-background/85 p-[3px] shadow-sm transition-opacity duration-300"
      style={{ opacity: scrolling ? 0.95 : 0 }}
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
          className="absolute border-2 border-primary bg-primary/10"
          style={{
            left: Math.min(mapW - viewportWidth, frame.scrollLeft * sx),
            top: Math.min(mapH - viewportHeight, frame.scrollTop * sy),
            width: viewportWidth,
            height: viewportHeight,
          }}
        />
      </div>
    </div>
  );
}

function Filled({ mon }: { mon: PickerMon }) {
  const pokemon = { types: mon.types } as Pokemon;
  return (
    <>
      <PokeballBg pokemon={pokemon} />
      <img
        src={mon.sprite}
        alt={mon.name}
        className="absolute left-1/2 top-1/2 z-10 max-h-[120%] max-w-[120%] -translate-x-1/2 -translate-y-1/2"
        style={{ imageRendering: 'pixelated' }}
        draggable={false}
      />
    </>
  );
}
