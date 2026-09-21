import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import { cn } from '@/lib/utils';
import type { ChainSlot } from '../model/packing';
import { TrashSlot } from './marks';

export function PackingChain({
  slots,
  selected,
  onSelect,
}: {
  slots: ChainSlot[];
  selected?: boolean;
  onSelect?: () => void;
}) {
  const inner = (
    <div className="flex flex-nowrap items-center gap-1" data-testid="favorites-pack-chain">
      {slots.map((slot, i) => (
        <span key={`${slot.role}-${slot.type ?? 'x'}-${slot.mon?.id ?? i}`} className="flex items-center gap-1">
          {i > 0 ? (
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
          ) : null}
          <PackSlot slot={slot} />
        </span>
      ))}
    </div>
  );

  if (!onSelect) return inner;
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="favorites-pack-option"
      className={cn(
        'flex w-full cursor-pointer items-center overflow-x-auto rounded-lg border bg-background px-2 py-1.5 text-left',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      {inner}
    </button>
  );
}

function PackSlot({ slot }: { slot: ChainSlot }) {
  if (slot.role === 'trash') {
    return (
      <span data-role="trash" data-testid="favorites-pack-slot">
        <TrashSlot />
      </span>
    );
  }
  const color = slot.type ? TYPE_COLORS[slot.type] : '#737373';
  const faded = slot.role === 'vacate';
  return (
    <span
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border-2 bg-background"
      style={{ borderColor: color }}
      data-role={slot.role}
      data-testid="favorites-pack-slot"
    >
      {slot.type ? (
        <img
          src={typeIconPath(slot.type)}
          alt=""
          className="absolute top-0.5 right-0.5 h-3 w-3 rounded-[2px]"
          draggable={false}
        />
      ) : null}
      {slot.mon ? (
        <img
          src={slot.mon.sprite}
          alt={slot.mon.name}
          className={cn('h-[28px] w-[28px]', faded && 'opacity-35')}
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      ) : null}
    </span>
  );
}
