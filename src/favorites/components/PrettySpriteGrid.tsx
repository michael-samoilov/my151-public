import { tileImageCssPx } from '@/lib/tileImage';
import { SPRITE_NATIVE, useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_BADGE_ASPECT, TYPE_BADGE_H } from '@/lib/typeBadgeGeometry';
import { fitPickerSpriteCssPx, pickerSpriteCssPx } from '../model/pickerSprite';
import { prettyRows } from '../model/prettyWrap';
import type { PickerMon } from '../model/catalog';
import { useNamesVersion } from '@/i18n';
import { useLayoutEffect, useRef, useState } from 'react';
import { AxisBadge, GenerationBadge } from './WordBadge';
import { NameTooltip } from './NameTooltip';
import { labelOf } from './spriteLabel';
import type { PointerMark } from '../model/pointers';
import type { TypeName } from '@/types/pokemon';

const ROW_GAP_PX = 4;
// A sprite's badges are this fraction of the tile tall, about the height of
// the grid's header badges on a phone.
const MARK_BADGE = 0.165;

function TypeMarkBadge({ type, height }: { type: TypeName; height: number }) {
  return (
    <span className="block" style={{ width: height * TYPE_BADGE_ASPECT }}>
      <TypeBadge type={type} className="block w-full overflow-visible" />
    </span>
  );
}

/** A mark's badge. A generation badge longer than `maxWidth` condenses its word. */
function MarkBadge({ mark, height, maxWidth }: { mark: PointerMark; height: number; maxWidth: number }) {
  if (mark.source === 'gen') return <GenerationBadge gen={mark.value} height={height} maxUnits={maxWidth / height * TYPE_BADGE_H} className="block" />;
  if (mark.source === 'type') return <TypeMarkBadge type={mark.value} height={height} />;
  return <AxisBadge id={mark.source} height={height} className="block" />;
}

export function PrettySpriteGrid({
  mons,
  maxCols,
  spritePx: requestedSpritePx,
  lineKey,
  formKey,
  selectedId,
  onPick,
  takenMarks,
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
  formKey?: (mon: PickerMon) => number;
  selectedId?: number;
  onPick: (mon: PickerMon) => void;
  /** Where each Pokémon is already picked in this cell's row or column. */
  takenMarks?: (id: number) => PointerMark[];
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
                taken={takenMarks?.(mon.id) ?? []}
                showTypes={showTypes}
                pointer={pointer}
                sourceMarks={sourceMarks?.(mon.id) ?? []}
                onPick={onPick}
                onClear={onClear}
                clearLabel={clearLabel}
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
  taken,
  showTypes,
  pointer,
  sourceMarks,
  onPick,
  onClear,
  clearLabel,
}: {
  mon: PickerMon;
  spritePx: number;
  selected: boolean;
  taken: PointerMark[];
  showTypes: boolean;
  pointer: boolean;
  sourceMarks: PointerMark[];
  onPick: (mon: PickerMon) => void;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const clearing = selected && Boolean(onClear);
  // Pointer selectors list only picks from other cells, so they never show taken.
  const takenHere = pointer ? [] : taken;
  const badge = spritePx * MARK_BADGE;
  const inset = Math.max(5, Math.round(spritePx * 0.05));
  const tile = (
    <button
      type="button"
      onClick={() => selected && onClear ? onClear() : onPick(mon)}
      data-testid={`favorites-pick-${mon.id}`}
      aria-pressed={selected}
      aria-label={clearing ? `${clearLabel ?? 'Clear'} ${labelOf(mon)}` : labelOf(mon)}
      className="group/pick relative flex shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent p-0 hover:bg-foreground/5"
      style={{ width: spritePx, height: spritePx, scrollMargin: 4 }}
    >
      <img
        src={mon.sprite}
        alt={labelOf(mon)}
        width={spritePx}
        height={spritePx}
        className={clearing || takenHere.length > 0 ? 'relative z-10 opacity-35' : 'relative z-10'}
        style={{ imageRendering: 'pixelated', width: spritePx, height: spritePx }}
        decoding="sync"
        draggable={false}
      />
      {selected ? <span className="pointer-events-none absolute inset-[2px] z-[1] rounded-md border-2 border-primary" data-testid="favorites-selection-ring" /> : null}
      {showTypes ? <span
        className="pointer-events-none absolute inset-x-0 z-[12] flex flex-col items-center justify-end"
        style={{ gap: 1, bottom: inset }}
      >
        {mon.types.slice(0, 2).map((type) => (
          <span key={type} data-testid="favorites-type-icon" data-type={type}>
            <TypeMarkBadge type={type} height={badge} />
          </span>
        ))}
      </span> : null}
      {sourceMarks.length > 0 ? (
        <span
          className="pointer-events-none absolute z-[16] flex flex-col items-end leading-none opacity-[0.85]"
          style={{ gap: 1, right: inset, top: inset }}
        >
          {sourceMarks.map((source) => (
            <span
              key={`${source.source}:${'value' in source ? source.value : ''}`}
              data-testid="favorites-pointer-mark"
              data-source={source.source}
              className="block shrink-0 leading-none"
            >
              <MarkBadge mark={source} height={badge} maxWidth={spritePx - inset} />
            </span>
          ))}
        </span>
      ) : null}
      {takenHere.length > 0 ? (
        <span
          className="pointer-events-none absolute z-[15] flex flex-col items-end leading-none"
          style={{ gap: 1, right: inset, top: inset }}
        >
          {takenHere.map((where) => (
            <span
              key={`${where.source}:${'value' in where ? where.value : ''}`}
              data-testid="favorites-used-mark"
              data-source={where.source}
              data-value={'value' in where ? where.value : undefined}
              className="block shrink-0 leading-none"
            >
              <MarkBadge mark={where} height={badge} maxWidth={spritePx - inset} />
            </span>
          ))}
        </span>
      ) : null}
      {/* The x paints above the source badges and the used mark. It stays
          soft until a mouse hovers the tile. */}
      {clearing ? (
        <svg
          data-testid="favorites-clear"
          viewBox="0 0 24 24"
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-red-500 opacity-50 group-hover/pick:opacity-100"
          style={{ width: Math.round(spritePx * 0.62), height: Math.round(spritePx * 0.62), filter: 'drop-shadow(0 0 1px white) drop-shadow(0 0 1px white)' }}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
        >
          <path d="M4 4L20 20M20 4L4 20" />
        </svg>
      ) : null}
    </button>
  );
  return <NameTooltip mon={mon}>{tile}</NameTooltip>;
}
