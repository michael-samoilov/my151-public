import { useNamesVersion } from '@/i18n';
import { labelOf } from './spriteLabel';
import { typeIconPath } from '@/data/type-ids';
import { cn } from '@/lib/utils';
import { ArrowRight, Trash2 } from 'lucide-react';
import { chainSlotKey, type ChainSlot } from '../model/packing';
import { usePickerSprite } from '../model/spritePreload';

export function PackingChain({
  slots,
  selected,
  onSelect,
}: {
  slots: ChainSlot[];
  selected?: boolean;
  onSelect?: () => void;
}) {
  useNamesVersion();
  const inner = (
    <div className="flex flex-nowrap items-center gap-1.5" data-testid="favorites-pack-chain">
      {slots.map((slot) => <PackSlot key={chainSlotKey(slot)} slot={slot} />)}
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
  const trash = slot.to === null;
  const src = usePickerSprite(slot.mon.sprite);
  return (
    <span
      className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center"
      data-role={trash ? 'trash' : 'move'}
      data-testid="favorites-pack-slot"
    >
      {slot.from ? (
        <img
          src={typeIconPath(slot.from)}
          alt=""
          data-testid="favorites-pack-old-mark"
          className="absolute left-0 top-0 z-10 h-4 w-4 rounded-[2px]"
          draggable={false}
        />
      ) : null}
      {slot.from ? (
        <ArrowRight
          size={12}
          data-testid="favorites-pack-move-arrow"
          className="absolute left-1/2 top-0 z-10 -translate-x-1/2 text-muted-foreground"
          aria-hidden
        />
      ) : null}
      {trash ? (
        <span
          data-testid="favorites-trash-mark"
          className="absolute top-0 right-0 z-10 inline-flex h-4 w-4 items-center justify-center rounded-[2px] bg-red-600 text-white"
        >
          <Trash2 size={11} strokeWidth={2.5} aria-hidden />
        </span>
      ) : slot.to ? (
        <img
          src={typeIconPath(slot.to)}
          alt=""
          data-testid="favorites-pack-new-mark"
          className="absolute right-0 top-0 z-10 h-4 w-4 rounded-[2px]"
          draggable={false}
        />
      ) : null}
      <img
        src={src}
        alt={labelOf(slot.mon)}
        data-testid="favorites-pack-sprite"
        className={cn('relative z-0 h-11 w-11', trash && 'opacity-35')}
        style={{ imageRendering: 'pixelated' }}
        draggable={false}
      />
    </span>
  );
}
