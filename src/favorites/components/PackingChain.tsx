import { typeIconPath } from '@/data/type-ids';
import { cn } from '@/lib/utils';
import { ArrowRight, Trash2 } from 'lucide-react';
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
    <div className="flex flex-nowrap items-center gap-1.5" data-testid="favorites-pack-chain">
      {slots.map((slot, i) => (
        <span key={`${slot.role}-${slot.type ?? 'x'}-${slot.mon?.id ?? i}`} className="flex items-center gap-1.5">
          {i > 0 ? (
            <ArrowRight size={13} className="shrink-0 text-muted-foreground" aria-hidden />
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
  const faded = slot.role === 'vacate' || trash;
  const oldType = slot.role === 'vacate';
  return (
    <span
      className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center"
      data-role={slot.role}
      data-testid="favorites-pack-slot"
    >
      {trash ? (
        <span
          data-testid="favorites-trash-mark"
          className="absolute top-0 right-0 z-10 inline-flex h-4 w-4 items-center justify-center rounded-[2px] bg-red-600 text-white"
        >
          <Trash2 size={11} strokeWidth={2.5} aria-hidden />
        </span>
      ) : slot.type ? (
        <img
          src={typeIconPath(slot.type)}
          alt=""
          data-testid={oldType ? 'favorites-pack-old-mark' : 'favorites-pack-new-mark'}
          className="absolute right-0 top-0 z-10 h-4 w-4 rounded-[2px]"
          draggable={false}
        />
      ) : null}
      {slot.mon ? (
        <img
          src={slot.mon.sprite}
          alt={slot.mon.name}
          data-testid="favorites-pack-sprite"
          className={cn('relative z-0 h-11 w-11', faded && 'opacity-35')}
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      ) : null}
    </span>
  );
}
