import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
    return (
      <div
        className="grid min-h-0 w-full flex-1 bg-card"
        style={{
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
        }}
        data-testid="favorites-grid"
        data-axis="gen-major"
      >
        {cells}
      </div>
    );
  }

  return <TypeColumnScroller>{cells}</TypeColumnScroller>;
}

function TypeColumnScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(0);

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
        isSel && 'z-[1] outline outline-2 outline-offset-[-2px] outline-primary',
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
    </button>
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
