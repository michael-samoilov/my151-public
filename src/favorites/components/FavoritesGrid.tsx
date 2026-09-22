import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PokeballBg } from '@/components/shared/PokeballBg';
import { TYPE_COLORS } from '@/data/type-colors';
import { cn } from '@/lib/utils';
import type { Pokemon } from '@/types/pokemon';
import {
  GEN_AXIS,
  TYPE_AXIS,
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
      <Corner pin={!desktop} />
      {TYPE_AXIS.map((id) => (
        <HeaderCell key={`h-${String(id)}`} id={id} />
      ))}
      {GEN_AXIS.map((gen) => (
        <GenRow
          key={String(gen)}
          gen={gen}
          pin={!desktop}
          fills={fills}
          resolve={resolve}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </>
  );

  if (desktop) {
    return <DesktopChart>{cells}</DesktopChart>;
  }

  return <TypeColumnScroller>{cells}</TypeColumnScroller>;
}

function TypeColumnScroller({ children }: { children: ReactNode }) {
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
    <div className="relative h-full min-h-0 w-full">
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
            gridTemplateColumns: cell > 0 ? `repeat(${COLS}, ${cell}px)` : `repeat(${COLS}, minmax(0, 1fr))`,
            width: cell > 0 ? cell * COLS : '100%',
          }}
          data-testid="favorites-grid"
          data-axis="gen-major"
        >
          {children}
        </div>
      </div>
      <ChartMinimap frame={frame} scrolling={scrolling} />
    </div>
  );
}

function DesktopChart({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { frame, scrolling } = useChartFrame(ref);
  return (
    <div className="relative flex min-h-0 w-full flex-1">
      <div
        ref={ref}
        className="grid min-h-0 w-full flex-1 overflow-auto bg-card"
        style={{
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
        }}
        data-testid="favorites-grid"
        data-axis="gen-major"
      >
        {children}
      </div>
      <ChartMinimap frame={frame} scrolling={scrolling} />
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
        'relative min-h-0 min-w-0 overflow-hidden border-[0.5px] border-neutral-200 p-0 [container-type:size]',
        locked ? 'cursor-default bg-[repeating-linear-gradient(-45deg,#f4f4f5,#f4f4f5_3px,#ececee_3px,#ececee_6px)]' : 'cursor-pointer bg-card',
        kind === 'pointer' && 'bg-amber-50',
        isSel && 'z-[1]',
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
}

function useChartFrame(ref: RefObject<HTMLDivElement | null>) {
  const [frame, setFrame] = useState<ChartMetrics | null>(null);
  const [scrolling, setScrolling] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    const read = () => {
      setFrame({
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
      });
    };
    const onScroll = () => {
      read();
      setScrolling(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setScrolling(false), 700);
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

function ChartMinimap({ frame, scrolling }: { frame: ChartMetrics | null; scrolling: boolean }) {
  if (!frame || (!scrolling && !chartOverflows(frame))) return null;
  const max = 84;
  const aspect = frame.scrollWidth / Math.max(frame.scrollHeight, 1);
  let mapW = max;
  let mapH = Math.round(max / aspect);
  if (mapH > max) {
    mapH = max;
    mapW = Math.round(max * aspect);
  }
  mapW = Math.max(48, mapW);
  mapH = Math.max(28, mapH);
  const sx = mapW / Math.max(frame.scrollWidth, 1);
  const sy = mapH / Math.max(frame.scrollHeight, 1);
  const cells: ReactNode[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      cells.push(<div key={`${col}-${row}`} style={{ background: minimapFill(col, row) }} />);
    }
  }
  return (
    <div
      data-testid="favorites-minimap"
      aria-hidden
      className="pointer-events-none absolute right-2 bottom-2 z-30 rounded-sm bg-background/75 p-[3px]"
      style={{ opacity: 0.62 }}
    >
      <div className="relative" style={{ width: mapW, height: mapH }}>
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          }}
        >
          {cells}
        </div>
        <div
          data-testid="favorites-minimap-viewport"
          className="absolute border border-neutral-900/80 bg-neutral-900/15"
          style={{
            left: frame.scrollLeft * sx,
            top: frame.scrollTop * sy,
            width: Math.max(2, frame.clientWidth * sx),
            height: Math.max(2, frame.clientHeight * sy),
          }}
        />
      </div>
    </div>
  );
}

function minimapFill(col: number, row: number): string {
  if (col === 0 || row === 0) return 'rgba(23,23,23,0.28)';
  const id = TYPE_AXIS[col - 1];
  if (id && isTypeName(id)) return `${TYPE_COLORS[id]}66`;
  return 'rgba(23,23,23,0.16)';
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
