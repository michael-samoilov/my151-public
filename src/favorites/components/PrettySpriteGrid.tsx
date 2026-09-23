import { tileImageCssPx } from '@/lib/tileImage';
import { SPRITE_NATIVE, useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { typeIconPath } from '@/data/type-ids';
import type { TypeName } from '@/types/pokemon';
import { fitPickerSpriteCssPx, pickerSpriteCssPx } from '../model/pickerSprite';
import { prettyRows } from '../model/prettyWrap';
import type { PickerMon } from '../model/catalog';
import { pokemonLabel, useNamesVersion } from '@/i18n';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ExtraMark, RomanDisc, TypeIcon } from './marks';
import type { PointerMark } from '../model/pointers';

const ROW_GAP_PX = 4;

export function PrettySpriteGrid({
  mons,
  maxCols,
  spritePx: requestedSpritePx,
  lineKey,
  selectedId,
  onPick,
  usedIn,
  showTypes = true,
  pointer = false,
  sourceMarks,
  onClear,
  clearLabel,
}: {
  mons: readonly PickerMon[];
  maxCols: number;
  spritePx?: number;
  lineKey?: (mon: PickerMon) => number;
  selectedId?: number;
  onPick: (mon: PickerMon) => void;
  usedIn?: (id: number) => TypeName | null;
  showTypes?: boolean;
  pointer?: boolean;
  sourceMarks?: (id: number) => PointerMark[];
  onClear?: () => void;
  clearLabel?: string;
}) {
  useNamesVersion();
  const viewportPx = useLayoutViewportCssPx();
  const baseSpritePx = requestedSpritePx ?? pickerSpriteCssPx(viewportPx);
  const dexPx = tileImageCssPx(viewportPx);
  const rows = prettyRows(mons, maxCols, lineKey);
  const lastLen = rows.length > 0 ? rows[rows.length - 1].length : maxCols;
  const fitRows = rows.length + (onClear && (rows.length === 0 || lastLen >= maxCols) ? 1 : 0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [fitPx, setFitPx] = useState(baseSpritePx);
  const spritePx = Math.min(baseSpritePx, fitPx);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let scroller = grid.parentElement;
    while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    const available = scroller ?? grid.parentElement;
    if (!available) return;
    const resize = () => {
      const room = available.getBoundingClientRect().bottom - grid.getBoundingClientRect().top - 16;
      setFitPx(fitPickerSpriteCssPx(baseSpritePx, fitRows, room, ROW_GAP_PX));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(available);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, [baseSpritePx, fitRows]);
  const clear = onClear ? <ClearCell spritePx={spritePx} label={clearLabel} onClear={onClear} /> : null;
  const clearInLast = Boolean(clear) && rows.length > 0 && lastLen < maxCols;
  const clearOwnRow = Boolean(clear) && !clearInLast;

  return (
    <div
      ref={gridRef}
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
                showTypes={showTypes}
                pointer={pointer}
                sourceMarks={sourceMarks?.(mon.id) ?? []}
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
  showTypes,
  pointer,
  sourceMarks,
  onPick,
}: {
  mon: PickerMon;
  spritePx: number;
  selected: boolean;
  usedType: TypeName | null;
  showTypes: boolean;
  pointer: boolean;
  sourceMarks: PointerMark[];
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
        className={usedType && !pointer ? 'opacity-35' : undefined}
        style={{ imageRendering: 'pixelated', width: spritePx, height: spritePx }}
        draggable={false}
      />
      {showTypes ? <span
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
      </span> : null}
      {sourceMarks.length > 0 ? (
        <span
          className="pointer-events-none absolute right-0 top-0 z-[16] flex"
          style={{ gap: 1 }}
        >
          {sourceMarks.map((source) => (
            <span
              key={`${source.source}:${'value' in source ? source.value : ''}`}
              data-testid="favorites-pointer-mark"
              data-source={source.source}
            >
              {source.source === 'gen' ? <RomanDisc gen={source.value} size={mark} />
                : source.source === 'type' ? <TypeIcon type={source.value} size={mark} />
                : <ExtraMark id={source.source} size={mark} />}
            </span>
          ))}
        </span>
      ) : null}
      {usedType ? (
        <img
          src={typeIconPath(usedType)}
          alt=""
          data-testid="favorites-used-mark"
          data-used-type={usedType}
          className="pointer-events-none absolute z-[15] rounded-[4px]"
          style={pointer ? { bottom: inset, right: inset, width: mark, height: mark } : { top: inset, right: inset, width: mark, height: mark }}
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
      className="relative flex shrink-0 cursor-pointer flex-col items-center justify-center rounded-md border border-red-500 bg-transparent p-0 text-red-500"
      style={{ width: spritePx, height: spritePx }}
    >
      <X size={Math.round(spritePx * 0.38)} strokeWidth={2.25} aria-hidden />
      <span style={{ fontSize: Math.max(9, Math.round(spritePx * 0.15)), lineHeight: 1 }}>{label}</span>
    </button>
  );
}

function labelOf(mon: PickerMon): string {
  if (mon.source === 'powerup') return mon.name;
  const label = pokemonLabel(mon.id, mon.name);
  return label.pending ? mon.name : label.full;
}
