import { tileImageCssPx } from '@/lib/tileImage';
import { SPRITE_NATIVE, useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { typeIconPath } from '@/data/type-ids';
import type { TypeName } from '@/types/pokemon';
import { fitPickerSpriteCssPx, pickerSpriteCssPx } from '../model/pickerSprite';
import { prettyRows } from '../model/prettyWrap';
import type { PickerMon } from '../model/catalog';
import { pokemonLabel, useNamesVersion } from '@/i18n';
import { X } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { ExtraMark, RomanDisc, TypeIcon } from './marks';
import type { PointerMark } from '../model/pointers';

const ROW_GAP_PX = 4;

export function PrettySpriteGrid({
  mons,
  maxCols,
  spritePx: requestedSpritePx,
  lineKey,
  formKey,
  selectedId,
  onPick,
  usedIn,
  showTypes = true,
  pointer = false,
  sourceMarks,
  onClear,
  clearLabel,
  clearText,
}: {
  mons: readonly PickerMon[];
  maxCols: number;
  spritePx?: number;
  lineKey?: (mon: PickerMon) => number;
  formKey?: (mon: PickerMon) => number;
  selectedId?: number;
  onPick: (mon: PickerMon) => void;
  usedIn?: (id: number) => TypeName | null;
  showTypes?: boolean;
  pointer?: boolean;
  sourceMarks?: (id: number) => PointerMark[];
  onClear?: () => void;
  clearLabel?: string;
  clearText?: string;
}) {
  useNamesVersion();
  const viewportPx = useLayoutViewportCssPx();
  const baseSpritePx = requestedSpritePx ?? pickerSpriteCssPx(viewportPx);
  const dexPx = tileImageCssPx(viewportPx);
  const rows = prettyRows(mons, maxCols, lineKey, formKey);
  const fitRows = rows.length;
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
  return (
    <div
      ref={gridRef}
      className="mx-auto flex w-max flex-col"
      style={{ gap: ROW_GAP_PX }}
      data-testid="favorites-pretty-grid"
      data-audit-scale="intended"
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
                onClear={onClear}
                clearLabel={clearLabel}
                clearText={clearText}
              />
            ))}
          </div>
        ))}
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
  onClear,
  clearLabel,
  clearText,
}: {
  mon: PickerMon;
  spritePx: number;
  selected: boolean;
  usedType: TypeName | null;
  showTypes: boolean;
  pointer: boolean;
  sourceMarks: PointerMark[];
  onPick: (mon: PickerMon) => void;
  onClear?: () => void;
  clearLabel?: string;
  clearText?: string;
}) {
  const mark = Math.round(spritePx * 0.28);
  const inset = Math.max(5, Math.round(spritePx * 0.05));
  return (
    <button
      type="button"
      onClick={() => selected && onClear ? onClear() : onPick(mon)}
      data-testid={`favorites-pick-${mon.id}`}
      aria-pressed={selected}
      aria-label={selected && onClear ? `${clearLabel ?? 'Clear'} ${labelOf(mon)}` : labelOf(mon)}
      className="relative flex shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent p-0"
      style={{ width: spritePx, height: spritePx, scrollMargin: 4 }}
    >
      <img
        src={mon.sprite}
        alt={labelOf(mon)}
        width={spritePx}
        height={spritePx}
        className={usedType && !pointer ? 'relative z-10 opacity-35' : 'relative z-10'}
        style={{ imageRendering: 'pixelated', width: spritePx, height: spritePx }}
        decoding="sync"
        draggable={false}
      />
      {selected ? <span className="pointer-events-none absolute inset-[2px] z-[1] rounded-md border-2 border-primary" data-testid="favorites-selection-ring" /> : null}
      {showTypes ? <span
        className="pointer-events-none absolute inset-x-0 z-[12] flex items-end justify-center"
        style={{ gap: 1, bottom: inset, height: Math.round(spritePx * 0.22) }}
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
          className="pointer-events-none absolute z-[16] flex items-start leading-none opacity-[0.85]"
          style={{ gap: 1, right: inset, top: inset }}
        >
          {sourceMarks.map((source) => (
            <span
              key={`${source.source}:${'value' in source ? source.value : ''}`}
              data-testid="favorites-pointer-mark"
              data-source={source.source}
              className="flex shrink-0 items-center justify-center leading-none"
              style={{ width: mark, height: mark }}
            >
              {source.source === 'gen' ? <RomanDisc gen={source.value} size={mark} />
                : source.source === 'type' ? <TypeIcon type={source.value} size={mark} />
                : <ExtraMark id={source.source} size={mark} />}
            </span>
          ))}
        </span>
      ) : null}
      {usedType && !pointer ? (
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
      {selected && onClear ? (
        <span
          data-testid="favorites-clear"
          className="absolute z-[18] inline-flex items-center gap-0.5 rounded-full border border-neutral-300 bg-white/95 px-1 py-0.5 leading-none text-red-500 shadow-sm"
          style={{ left: inset, [pointer ? 'bottom' : 'top']: inset, fontSize: Math.max(9, Math.round(spritePx * 0.13)) }}
        >
          <X size={Math.max(10, Math.round(spritePx * 0.16))} strokeWidth={2.25} className="text-red-400" aria-hidden />
          {clearText ?? clearLabel}
        </span>
      ) : null}
    </button>
  );
}

function labelOf(mon: PickerMon): string {
  if (mon.source === 'powerup') return mon.name;
  const label = pokemonLabel(mon.id, mon.name);
  return label.pending ? mon.name : label.full;
}
