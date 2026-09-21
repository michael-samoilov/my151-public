import { prettyGridCols, prettyRows } from '../model/prettyWrap';
import type { PickerMon } from '../model/catalog';
import { pokemonLabel, useNamesVersion } from '@/i18n';
import { cn } from '@/lib/utils';

const GAP_PX = 4;

export function PrettySpriteGrid({
  mons,
  maxCols,
  selectedId,
  onPick,
}: {
  mons: readonly PickerMon[];
  maxCols: number;
  selectedId?: number;
  onPick: (mon: PickerMon) => void;
}) {
  useNamesVersion();
  const cols = prettyGridCols(mons.length, maxCols);
  const rows = prettyRows(mons, maxCols);
  const tileWidth = `calc((100% - ${GAP_PX}px * ${cols - 1}) / ${cols})`;

  return (
    <div className="flex w-full flex-col" style={{ gap: GAP_PX }} data-testid="favorites-pretty-grid">
      {rows.map((row, r) => (
        <div
          key={r}
          className="flex justify-center"
          style={{ gap: GAP_PX }}
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
                'relative flex aspect-square cursor-pointer items-center justify-center rounded-md bg-transparent p-0',
                selectedId === mon.id && 'ring-2 ring-primary ring-offset-1',
              )}
              style={{ width: tileWidth, flex: 'none' }}
            >
              <img
                src={mon.sprite}
                alt={labelOf(mon)}
                className="max-h-full max-w-full"
                style={{ imageRendering: 'pixelated', width: '108%' }}
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
