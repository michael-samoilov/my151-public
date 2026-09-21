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
  const typeMajor = !desktop;
  const axisA = typeMajor ? TYPE_AXIS : GEN_AXIS;
  const axisB = typeMajor ? GEN_AXIS : TYPE_AXIS;
  const cols = axisB.length + 1;
  const rows = axisA.length + 1;

  return (
    <div
      className="grid min-h-0 w-full flex-1 bg-card"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
      data-testid="favorites-grid"
      data-axis={typeMajor ? 'type-major' : 'gen-major'}
    >
      <div className="border-[0.5px] border-neutral-200 bg-neutral-50" />
      {axisB.map((id) => (
        <HeaderCell key={`h-${String(id)}`} id={id} />
      ))}
      {axisA.map((a) => (
        <Row key={String(a)} a={a} axisB={axisB} typeMajor={typeMajor} fills={fills} resolve={resolve} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

function Row({
  a,
  axisB,
  typeMajor,
  fills,
  resolve,
  selected,
  onSelect,
}: {
  a: TypeAxisId | GenAxisId;
  axisB: readonly (TypeAxisId | GenAxisId)[];
  typeMajor: boolean;
  fills: Record<string, number>;
  resolve: (id: number) => PickerMon | undefined;
  selected: { type: TypeAxisId; gen: GenAxisId } | null;
  onSelect: (type: TypeAxisId, gen: GenAxisId) => void;
}) {
  return (
    <>
      <HeaderCell id={a} />
      {axisB.map((b) => {
        const type = (typeMajor ? a : b) as TypeAxisId;
        const gen = (typeMajor ? b : a) as GenAxisId;
        return (
          <BodyCell
            key={cellKey(type, gen)}
            type={type}
            gen={gen}
            fills={fills}
            resolve={resolve}
            selected={selected}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}

function HeaderCell({ id }: { id: TypeAxisId | GenAxisId }) {
  return (
    <div className="flex items-center justify-center border-[0.5px] border-neutral-200 bg-card">
      {isTypeName(id) ? (
        <TypeIcon type={id} size={18} />
      ) : isGenNumber(id) ? (
        <RomanDisc gen={id} size={22} />
      ) : (
        <ExtraMark id={id} size={18} />
      )}
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
        'relative min-h-0 min-w-0 overflow-hidden border-[0.5px] border-neutral-200 p-0',
        locked ? 'cursor-default bg-[repeating-linear-gradient(-45deg,#f4f4f5,#f4f4f5_3px,#ececee_3px,#ececee_6px)]' : 'cursor-pointer bg-card',
        kind === 'pointer' && 'bg-amber-50',
        isSel && 'z-[1] outline outline-2 outline-offset-[-2px] outline-primary',
      )}
    >
      {mon ? (
        <Filled mon={mon} />
      ) : locked ? null : (
        <EmptyBall className="absolute inset-[18%] text-muted-foreground/20 -rotate-[30deg]" />
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
