import { t } from '@/i18n';
import { tileImageCssPx } from '@/lib/tileImage';
import { SPRITE_NATIVE, useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { typeIconPath } from '@/data/type-ids';
import { fitPickerSpriteCssPx, pickerSpriteCssPx } from '../model/pickerSprite';
import { prettyRows } from '../model/prettyWrap';
import type { PickerMon } from '../model/catalog';
import { useNamesVersion } from '@/i18n';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { RomanDisc, TypeIcon } from './marks';
import { NameTooltip } from './NameTooltip';
import { PickerSprite } from './PickerSprite';
import { labelOf } from './spriteLabel';
import { ExtraSymbol } from './ExtraSymbol';
import { axisBackground, coordinateLabel } from './coordinatePresentation';
import { CoordinatePills } from './CoordinatePills';
import { equalAreaDiscSize, originShapeGeometry, type OriginContext } from './coordinatePillLayout';
import type { SourceCoordinate } from '../model/pointers';
import type { PointerMark } from '../model/pointers';
import { shinySpriteUrl } from '@/lib/spriteUrl';
import { NoShinyMark } from '@/components/shiny/ShinyMarks';
import { NO_SHINY } from '@/components/shiny/shinyMarks';

const ROW_GAP_PX = 4;

/** One tile of a selector: a Pokémon, and whether the tile shows it shiny. */
export interface SelectorOption {
  mon: PickerMon;
  shiny: boolean;
}

export function PrettySpriteGrid<T extends SelectorOption>({
  options,
  maxCols,
  spritePx: requestedSpritePx,
  lineKey,
  formKey,
  selected,
  converting = false,
  onPick,
  takenMarks,
  showIcons = true,
  pointer = false,
  sourceMarks,
  coordinates,
  originContext,
  onClear,
  clearLabel,
  fitToHeight = true,
  caption,
  captionPx = 0,
}: {
  /** A shiny option without a shiny sprite shows faded, under the no-shiny mark. */
  options: readonly T[];
  maxCols: number;
  spritePx?: number;
  lineKey?: (option: T) => number;
  formKey?: (option: T) => number;
  selected?: (option: T) => boolean;
  /** The selected tile shows another look than the pick it stands for, so a tap converts the pick instead of clearing it. */
  converting?: boolean;
  onPick: (option: T) => void;
  takenMarks?: (id: number) => PointerMark[];
  showIcons?: boolean;
  pointer?: boolean;
  sourceMarks?: (option: T) => PointerMark[];
  coordinates?: (option: T) => SourceCoordinate[];
  originContext?: OriginContext;
  onClear?: () => void;
  clearLabel?: string;
  fitToHeight?: boolean;
  caption?: (option: T) => ReactNode;
  captionPx?: number;
}) {
  useNamesVersion();
  const viewportPx = useLayoutViewportCssPx();
  const baseSpritePx = requestedSpritePx ?? pickerSpriteCssPx(viewportPx);
  const dexPx = tileImageCssPx(viewportPx);
  const rows = prettyRows(options, maxCols, lineKey, formKey);
  const fitRows = rows.length;
  const gridRef = useRef<HTMLDivElement>(null);
  const [fitPx, setFitPx] = useState(baseSpritePx);
  const spritePx = Math.min(baseSpritePx, fitPx);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !fitToHeight) return;
    let scroller = grid.parentElement;
    while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    const available = scroller ?? grid.parentElement;
    if (!available) return;
    const resize = () => {
      let container: HTMLElement | null = available;
      let bottom = available.getBoundingClientRect().bottom;
      while (container) {
        const maxHeight = getComputedStyle(container).maxHeight;
        const cap = maxHeight.endsWith('px') ? parseFloat(maxHeight) : NaN;
        if (Number.isFinite(cap)) {
          bottom = container.getBoundingClientRect().top + cap;
          break;
        }
        container = container.parentElement;
      }
      const room = bottom - grid.getBoundingClientRect().top - 20;
      setFitPx(fitPickerSpriteCssPx(baseSpritePx, fitRows, room - fitRows * captionPx, ROW_GAP_PX));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(available);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, [baseSpritePx, fitRows, fitToHeight, captionPx]);
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
            {row.map((option) => (
              <PickCell
                key={option.mon.id}
                mon={option.mon}
                spritePx={spritePx}
                selected={selected?.(option) ?? false}
                converting={converting}
                shiny={option.shiny}
                taken={takenMarks?.(option.mon.id) ?? []}
                showIcons={showIcons}
                pointer={pointer}
                sourceMarks={sourceMarks?.(option) ?? []}
                coordinates={coordinates?.(option)}
                originContext={originContext}
                onPick={() => onPick(option)}
                onClear={onClear}
                clearLabel={clearLabel}
                caption={caption?.(option)}
                captionPx={captionPx}
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
  converting,
  shiny,
  taken,
  showIcons,
  pointer,
  sourceMarks,
  coordinates,
  originContext,
  onPick,
  onClear,
  clearLabel,
  caption,
  captionPx,
}: {
  mon: PickerMon;
  spritePx: number;
  selected: boolean;
  converting: boolean;
  shiny: boolean;
  taken: PointerMark[];
  showIcons: boolean;
  pointer: boolean;
  sourceMarks: PointerMark[];
  coordinates?: SourceCoordinate[];
  originContext?: OriginContext;
  onPick: () => void;
  onClear?: () => void;
  clearLabel?: string;
  caption?: ReactNode;
  captionPx: number;
}) {
  const originsId = useId();
  const clearing = selected && !converting && Boolean(onClear);
  const shinySprite = shiny ? shinySpriteUrl(mon.sprite) : null;
  const noShiny = shiny && !shinySprite && !selected;
  const takenHere = pointer ? [] : taken;
  const mark = Math.round(spritePx * 0.28);
  const discSize = equalAreaDiscSize(mark);
  const { roundedSide, roundedRadius } = originShapeGeometry(mark);
  const inset = Math.max(5, Math.round(spritePx * 0.05));
  const hasOrigins = coordinates !== undefined;
  const tile = (
    <button
      type="button"
      onClick={() => clearing ? onClear?.() : onPick()}
      data-testid={`favorites-pick-${mon.id}`}
      aria-pressed={selected}
      aria-describedby={coordinates?.length ? originsId : undefined}
      aria-label={clearing ? `${clearLabel ?? t('favorites.clear')} ${labelOf(mon)}` : labelOf(mon)}
      className="group/pick relative flex shrink-0 flex-col cursor-pointer items-center justify-start rounded-md bg-transparent p-0 hover:bg-foreground/5"
      style={{ width: spritePx, height: spritePx, scrollMargin: 4 }}
    >
      <PickerSprite
        sprite={shinySprite ?? mon.sprite}
        alt={labelOf(mon)}
        width={spritePx}
        height={spritePx}
        className={clearing ? 'relative z-10 opacity-35' : 'relative z-10'}
        style={{ imageRendering: 'pixelated', width: spritePx, height: spritePx, ...(noShiny ? NO_SHINY.sprite : null) }}
        decoding="sync"
        draggable={false}
      />
      {selected ? <span className="pointer-events-none absolute inset-[2px] z-[1] rounded-md border-2 border-primary" data-testid="favorites-selection-ring" /> : null}
      {noShiny ? <NoShinyMark size={`${mark}px`} left="2px" top="2px" /> : null}
      {showIcons ? <span
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
      {showIcons && !coordinates && sourceMarks.length > 0 ? (
        <span
          className="pointer-events-none absolute z-[16] flex items-center leading-none opacity-[0.85]"
          style={{ gap: 1, right: inset, top: inset }}
        >
          {sourceMarks.map((source) => (
            <span
              key={`${source.source}:${'value' in source ? source.value : ''}`}
              data-testid="favorites-pointer-mark"
              data-source={source.source}
              className="flex shrink-0 items-center justify-center overflow-hidden leading-none"
              style={{ width: source.source === 'gen' ? discSize : roundedSide, height: source.source === 'gen' ? discSize : roundedSide, borderRadius: source.source === 'gen' ? undefined : roundedRadius, background: source.source === 'gen' ? undefined : axisBackground(source.source === 'type' ? source.value : source.source) }}
            >
              {source.source === 'gen' ? <RomanDisc gen={source.value} size={discSize} />
                : source.source === 'type' ? <TypeIcon type={source.value} size={mark} />
                : <ExtraSymbol origin id={source.source} size={mark - 2} />}
            </span>
          ))}
        </span>
      ) : null}
      {showIcons && !coordinates && takenHere.length > 0 ? (
        <span
          className="pointer-events-none absolute z-[15] flex items-center leading-none"
          style={{ gap: 1, right: inset, top: inset }}
        >
          {takenHere.map((where) => (
            <span
              key={`${where.source}:${'value' in where ? where.value : ''}`}
              data-testid="favorites-used-mark"
              data-source={where.source}
              data-value={'value' in where ? where.value : undefined}
              className="flex shrink-0 items-center justify-center overflow-hidden leading-none"
              style={{ width: where.source === 'gen' ? discSize : roundedSide, height: where.source === 'gen' ? discSize : roundedSide, borderRadius: where.source === 'gen' ? undefined : roundedRadius, background: where.source === 'gen' ? undefined : axisBackground(where.source === 'type' ? where.value : where.source) }}
            >
              {where.source === 'gen' ? <RomanDisc gen={where.value} size={discSize} />
                : where.source === 'type' ? <TypeIcon type={where.value} size={mark} />
                : <ExtraSymbol origin id={where.source} size={mark - 2} />}
            </span>
          ))}
        </span>
      ) : null}
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
  return <div data-selector-tile data-testid={`favorites-origin-tile-${mon.id}`} className="relative flex shrink-0 flex-col items-center"
    style={{ width: spritePx, height: spritePx + captionPx }}>
    {hasOrigins && showIcons ? <CoordinatePills origins={coordinates ?? []} spritePx={spritePx} inset={inset} markPx={mark}
      pointer={pointer} current={originContext} id={originsId} /> : hasOrigins ? <span id={originsId} className="sr-only">{coordinates?.map(origin => coordinateLabel(origin.type, origin.gen)).join('; ')}</span> : null}
    <NameTooltip mon={mon}>{tile}</NameTooltip>
    {caption ? <div className="w-full shrink-0" style={{ height: captionPx }}>{caption}</div> : null}
  </div>;
}
