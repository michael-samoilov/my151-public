import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import type { ChainSlot } from '../model/packing';

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
  const trash = slot.role === 'trash';
  const color = trash ? '#000000' : slot.type ? TYPE_COLORS[slot.type] : '#737373';
  const faded = slot.role === 'vacate' || trash;
  return (
    <span
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border-2 bg-background"
      style={{ borderColor: color }}
      data-role={slot.role}
      data-testid="favorites-pack-slot"
    >
      {trash ? (
        <span
          data-testid="favorites-trash-mark"
          className="absolute top-0.5 right-0.5 inline-flex h-3 w-3 items-center justify-center rounded-[2px] bg-red-600 text-white"
        >
          <Trash2 size={8} strokeWidth={2.5} aria-hidden />
        </span>
      ) : slot.type ? (
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
