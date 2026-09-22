import { tileImageCssPx } from '@/lib/tileImage';
import { SPRITE_NATIVE, useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { typeIconPath } from '@/data/type-ids';
import type { TypeName } from '@/types/pokemon';
import { pickerSpriteCssPx } from '../model/pickerSprite';
import { prettyRows } from '../model/prettyWrap';
import type { PickerMon } from '../model/catalog';
import { pokemonLabel, useNamesVersion } from '@/i18n';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

const ROW_GAP_PX = 4;

export function PrettySpriteGrid({
  mons,
  maxCols,
  lineKey,
  selectedId,
  onPick,
  usedIn,
  onClear,
  clearLabel,
}: {
  mons: readonly PickerMon[];
  maxCols: number;
  lineKey?: (mon: PickerMon) => number;
  selectedId?: number;
  onPick: (mon: PickerMon) => void;
  usedIn?: (id: number) => TypeName | null;
  onClear?: () => void;
  clearLabel?: string;
}) {
  useNamesVersion();
  const viewportPx = useLayoutViewportCssPx();
  const spritePx = pickerSpriteCssPx(viewportPx);
  const dexPx = tileImageCssPx(viewportPx);
  const rows = prettyRows(mons, maxCols, lineKey);
  const clear = onClear ? <ClearCell spritePx={spritePx} label={clearLabel} onClear={onClear} /> : null;
  const lastLen = rows.length > 0 ? rows[rows.length - 1].length : maxCols;
  const clearInLast = Boolean(clear) && rows.length > 0 && lastLen < maxCols;
  const clearOwnRow = Boolean(clear) && !clearInLast;

  return (
    <div
      className="mx-auto flex w-max flex-col"
      style={{ gap: ROW_GAP_PX }}
      data-testid="favorites-pretty-grid"
      data-sprite-px={spritePx}
      data-sprite-dex={dexPx}
      data-sprite-native={SPRITE_NATIVE}
    >
        {rows.map((row, r) => (
          <div
            key={r}
            className="flex justify-center"
            data-pretty-row={r}
            data-pretty-len={row.length}
          >
            {row.map((mon) => (
              <PickCell
                key={mon.id}
                mon={mon}
                spritePx={spritePx}
                selected={selectedId === mon.id}
                usedType={usedIn?.(mon.id) ?? null}
                onPick={onPick}
              />
            ))}
            {clearInLast && r === rows.length - 1 ? clear : null}
          </div>
        ))}
        {clearOwnRow ? (
          <div className="flex justify-center" data-testid="favorites-clear-row">
            {clear}
          </div>
        ) : null}
    </div>
  );
}

function PickCell({
  mon,
  spritePx,
  selected,
  usedType,
  onPick,
}: {
  mon: PickerMon;
  spritePx: number;
  selected: boolean;
  usedType: TypeName | null;
  onPick: (mon: PickerMon) => void;
}) {
  const mark = Math.round(spritePx * 0.28);
  const inset = Math.round(spritePx * 0.05);
  return (
    <button
      type="button"
      onClick={() => onPick(mon)}
      data-testid={`favorites-pick-${mon.id}`}
      aria-pressed={selected}
      className={cn(
        'relative flex shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent p-0',
        selected && 'ring-2 ring-primary ring-offset-1',
      )}
      style={{ width: spritePx, height: spritePx, scrollMargin: 4 }}
    >
      <img
        src={mon.sprite}
        alt={labelOf(mon)}
        width={spritePx}
        height={spritePx}
        className={usedType ? 'opacity-35' : undefined}
        style={{ imageRendering: 'pixelated', width: spritePx, height: spritePx }}
        draggable={false}
      />
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[12] flex items-end justify-center"
        style={{ gap: 1, height: Math.round(spritePx * 0.22) }}
      >
        {mon.types.slice(0, 2).map((type) => (
          <img
            key={type}
            src={typeIconPath(type)}
            alt=""
            data-testid="favorites-type-icon"
            data-type={type}
            draggable={false}
            className="rounded-[2px]"
            style={{ width: Math.round(spritePx * 0.22), height: Math.round(spritePx * 0.22) }}
          />
        ))}
      </span>
      {usedType ? (
        <img
          src={typeIconPath(usedType)}
          alt=""
          data-testid="favorites-used-mark"
          data-used-type={usedType}
          className="pointer-events-none absolute z-[15] rounded-[4px]"
          style={{ top: inset, right: inset, width: mark, height: mark }}
          draggable={false}
        />
      ) : null}
    </button>
  );
}

function ClearCell({
  spritePx,
  label,
  onClear,
}: {
  spritePx: number;
  label?: string;
  onClear: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      data-testid="favorites-clear"
      aria-label={label}
      onClick={onClear}
      className="relative flex shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent p-0 text-muted-foreground"
      style={{ width: spritePx, height: spritePx }}
    >
      <X size={Math.round(spritePx * 0.42)} strokeWidth={2.25} aria-hidden />
    </button>
  );
}

function labelOf(mon: PickerMon): string {
  if (mon.source === 'powerup') return mon.name;
  const label = pokemonLabel(mon.id, mon.name);
  return label.pending ? mon.name : label.full;
}
