import { t } from '@/i18n';
import { tileImageCssPx } from '@/lib/tileImage';
import { SPRITE_NATIVE, useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { typeIconPath } from '@/data/type-ids';
import { fitPickerSpriteCssPx, pickerSpriteCssPx } from '../model/pickerSprite';
import { prettyRows } from '../model/prettyWrap';
import type { PickerMon } from '../model/catalog';
import { useNamesVersion } from '@/i18n';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ExtraMark, RomanDisc, TypeIcon } from './marks';
import { NameTooltip } from './NameTooltip';
import { labelOf } from './spriteLabel';
import { CoordinatePills } from './CoordinatePills';
import { coordinatePillLayout, originRows, type OriginContext } from './coordinatePillLayout';
import type { SourceCoordinate } from '../model/pointers';
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
  takenMarks,
  showTypes = true,
  pointer = false,
  sourceMarks,
  coordinates,
  originContext,
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
  coordinates?: (id: number) => SourceCoordinate[];
  originContext?: OriginContext;
  onClear?: () => void;
  clearLabel?: string;
}) {
  useNamesVersion();
  const viewportPx = useLayoutViewportCssPx();
  const baseSpritePx = requestedSpritePx ?? pickerSpriteCssPx(viewportPx);
  const dexPx = tileImageCssPx(viewportPx);
  const rows = prettyRows(mons, maxCols, lineKey, formKey);
  const fitRows = rows.length;
  const metadataLayout = coordinatePillLayout(baseSpritePx, Math.max(5, Math.round(baseSpritePx * 0.05)), Math.round(baseSpritePx * 0.28));
  const metadataRows = rows.map(row => Math.max(0, ...row.map(mon => originRows(coordinates?.(mon.id) ?? [], pointer, originContext, metadataLayout))));
  const hasMetadata = metadataRows.some(count => count > 0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [fitPx, setFitPx] = useState(baseSpritePx);
  const spritePx = hasMetadata ? baseSpritePx : Math.min(baseSpritePx, fitPx);

  useLayoutEffect(() => {
    // Source rows use the scroller rather than compressing the Pokémon image.
    if (hasMetadata) return;
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
  }, [baseSpritePx, fitRows, hasMetadata]);
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
                metadataRows={metadataRows[r]}
                selected={selectedId === mon.id}
                taken={takenMarks?.(mon.id) ?? []}
                showTypes={showTypes}
                pointer={pointer}
                sourceMarks={sourceMarks?.(mon.id) ?? []}
                coordinates={coordinates?.(mon.id)}
                originContext={originContext}
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
  metadataRows,
  selected,
  taken,
  showTypes,
  pointer,
  sourceMarks,
  coordinates,
  originContext,
  onPick,
  onClear,
  clearLabel,
}: {
  mon: PickerMon;
  spritePx: number;
  metadataRows: number;
  selected: boolean;
  taken: PointerMark[];
  showTypes: boolean;
  pointer: boolean;
  sourceMarks: PointerMark[];
  coordinates?: SourceCoordinate[];
  originContext?: OriginContext;
  onPick: (mon: PickerMon) => void;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const originsId = useId();
  const clearing = selected && Boolean(onClear);
  // Pointer selectors list only picks from other cells, so they never show taken.
  const takenHere = pointer ? [] : taken;
  const mark = Math.round(spritePx * 0.28);
  const inset = Math.max(5, Math.round(spritePx * 0.05));
  const pills = coordinatePillLayout(spritePx, inset, mark);
  const metadataHeight = metadataRows > 0 ? inset * 2 + metadataRows * pills.size + (metadataRows - 1) * pills.gap : 0;
  const tile = (
    <button
      type="button"
      onClick={() => selected && onClear ? onClear() : onPick(mon)}
      data-testid={`favorites-pick-${mon.id}`}
      aria-pressed={selected}
      aria-describedby={coordinates?.length ? originsId : undefined}
      aria-label={clearing ? `${clearLabel ?? t('favorites.clear')} ${labelOf(mon)}` : labelOf(mon)}
      className="group/pick relative flex shrink-0 flex-col cursor-pointer items-center justify-start rounded-md bg-transparent p-0 hover:bg-foreground/5"
      style={{ width: spritePx, height: spritePx + metadataHeight, scrollMargin: 4 }}
    >
      <img
        src={mon.sprite}
        alt={labelOf(mon)}
        width={spritePx}
        height={spritePx}
        className={clearing || takenHere.length > 0 || (!pointer && Boolean(coordinates?.length)) ? 'relative z-10 opacity-35' : 'relative z-10'}
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
      {coordinates && coordinates.length > 0 ? <CoordinatePills origins={coordinates} spritePx={spritePx} inset={inset} markPx={mark} pointer={pointer} current={originContext} id={originsId} /> : null}
      {!coordinates && sourceMarks.length > 0 ? (
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
      {!coordinates && takenHere.length > 0 ? (
        <span
          className="pointer-events-none absolute z-[15] flex items-start leading-none"
          style={{ gap: 1, right: inset, top: inset }}
        >
          {takenHere.map((where) => (
            <span
              key={`${where.source}:${'value' in where ? where.value : ''}`}
              data-testid="favorites-used-mark"
              data-source={where.source}
              data-value={'value' in where ? where.value : undefined}
              className="flex shrink-0 items-center justify-center leading-none"
              style={{ width: mark, height: mark }}
            >
              {where.source === 'gen' ? <RomanDisc gen={where.value} size={mark} />
                : where.source === 'type' ? <TypeIcon type={where.value} size={mark} />
                : <ExtraMark id={where.source} size={mark} />}
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
          style={{ top: spritePx / 2, width: Math.round(spritePx * 0.62), height: Math.round(spritePx * 0.62), filter: 'drop-shadow(0 0 1px white) drop-shadow(0 0 1px white)' }}
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
