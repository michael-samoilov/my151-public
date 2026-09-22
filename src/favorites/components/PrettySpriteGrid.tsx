import { tileImageCssPx } from '@/lib/tileImage';
import { SPRITE_NATIVE, useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { pickerSpriteCssPx } from '../model/pickerSprite';
import { prettyRows } from '../model/prettyWrap';
import type { PickerMon } from '../model/catalog';
import { pokemonLabel, useNamesVersion } from '@/i18n';
import { cn } from '@/lib/utils';

const ROW_GAP_PX = 4;

export function PrettySpriteGrid({
  mons,
  maxCols,
  lineKey,
  selectedId,
  onPick,
}: {
  mons: readonly PickerMon[];
  maxCols: number;
  lineKey?: (mon: PickerMon) => number;
  selectedId?: number;
  onPick: (mon: PickerMon) => void;
}) {
  useNamesVersion();
  const viewportPx = useLayoutViewportCssPx();
  const spritePx = pickerSpriteCssPx(viewportPx);
  const dexPx = tileImageCssPx(viewportPx);
  const rows = prettyRows(mons, maxCols, lineKey);

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
              <button
                key={mon.id}
                type="button"
                onClick={() => onPick(mon)}
                data-testid={`favorites-pick-${mon.id}`}
                aria-pressed={selectedId === mon.id}
                className={cn(
                  'relative flex shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent p-0',
                  selectedId === mon.id && 'ring-2 ring-primary ring-offset-1',
                )}
                style={{ width: spritePx, height: spritePx }}
              >
                <img
                  src={mon.sprite}
                  alt={labelOf(mon)}
                  width={spritePx}
                  height={spritePx}
                  style={{ imageRendering: 'pixelated', width: spritePx, height: spritePx }}
                  draggable={false}
                />
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}

function labelOf(mon: PickerMon): string {
  if (mon.source === 'powerup') return mon.name;
  const label = pokemonLabel(mon.id, mon.name);
  return label.pending ? mon.name : label.full;
}
