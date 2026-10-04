import { useCallback, useRef, useState } from 'react';
import { useT, typeLabel } from '@/i18n';
import { cellKey, isGenNumber, isTypeName, ROMAN, GEN_NUMBERS, type GenNumber } from '../model/cells';
import type { SourceCoordinate } from '../model/pointers';
import { GEN_STOPS } from '@/components/shared/GenBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import { ExtraMark, RomanDisc, TypeIcon } from './marks';
import { ROMAN_URIS } from './romanDiscAssets';
import { OriginDetails } from './OriginDetails';
import { coordinateOverlayLayout, originShapeGeometry, visibleOriginCount, singleOriginMark, type OriginContext } from './coordinatePillLayout';

// Keep the shared numeral, outline and font; only remove its disc. A tighter
// viewBox gives the glyph room inside the generation-colored half.
const ROMAN_GLYPHS = Object.fromEntries(GEN_NUMBERS.map(gen => [gen,
  `data:image/svg+xml,${encodeURIComponent(decodeURIComponent(ROMAN_URIS[gen].split(',')[1])
    .replace(/<circle\b[^>]*\/>/, '')
    .replace('viewBox="0 0 32 32"', 'viewBox="2 5 28 22"'))}`,
])) as Record<GenNumber, string>;

/** Show each immediate origin, omitting coordinates supplied by the selector. */
export function CoordinatePills({ origins, spritePx, inset, markPx, pointer, current, id, name }: {
  origins: SourceCoordinate[]; spritePx: number; inset: number; markPx: number; pointer: boolean; current?: OriginContext; id?: string; name: string;
}) {
  const t = useT();
  const layout = coordinateOverlayLayout(spritePx, inset, markPx);
  const { size, circleSize, halfWidth, radius, circleDiameter, gap, width, height, overflowWidth } = layout;
  const visible = visibleOriginCount(origins, pointer, current, layout);
  const hidden = origins.length - visible;
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const label = (type: SourceCoordinate['type'], gen: SourceCoordinate['gen']) => `${isGenNumber(gen)
    ? t('favorites.generation', { gen: ROMAN[gen] }) : t(`favorites.axis.${gen}`)} · ${isTypeName(type)
    ? typeLabel(type) : t(`favorites.axis.${type}`)}`;
  return <span data-testid="favorites-origin-overlay" className="pointer-events-none absolute z-[16] flex items-center justify-end leading-none"
    style={{ top: inset, right: inset, width, height, gap, opacity: pointer ? 0.85 : 1 }}>
    <span id={id} className="sr-only">{origins.map(origin => label(origin.type, origin.gen)).join('; ')}</span>
    {origins.slice(0, visible).map(origin => {
      const { type, gen, mark } = origin;
      const single = singleOriginMark(origin, pointer, current);
      const fullLabel = label(type, gen);
      const iconSize = single?.source === 'gen' ? circleSize : size;
      return <span key={cellKey(type, gen)} role="img" aria-label={fullLabel} title={fullLabel}
        data-origin-mode={single ? 'single' : 'pair'}
        data-testid={pointer ? 'favorites-pointer-mark' : 'favorites-used-mark'}
        data-coordinate-cell={cellKey(type, gen)} data-source={mark.source} data-value={'value' in mark ? mark.value : undefined}
        className={single && single.source !== 'gen' ? 'pointer-events-auto flex shrink-0 bg-white ring-1 ring-zinc-300' : 'pointer-events-auto flex shrink-0'}
        style={{ width: single ? iconSize : halfWidth * 2, height: iconSize, borderRadius: single ? 0 : radius }}>
        {single?.source === 'gen' ? <RomanDisc gen={single.value} size={circleSize} /> : single ? <CoordinateIcon axis={single.source === 'type' ? single.value : single.source} size={size} /> : <CoordinatePair type={type} gen={gen} size={size} />}
      </span>;
    })}
    {hidden > 0 ? <button ref={trigger} type="button" data-testid="favorites-origin-overflow"
      aria-label={t('favorites.origins.more', { pokemon: name })} aria-describedby={id} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}
      className="pointer-events-auto group flex shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-primary"
      style={{ width: overflowWidth, height: overflowWidth }}>
      <span data-testid="favorites-origin-overflow-badge" className="flex items-center justify-center rounded-full bg-muted ring-1 ring-border font-semibold text-foreground group-hover:bg-foreground/10"
        style={{ width: circleDiameter, height: circleDiameter, fontSize: size * 0.55 }}>+{hidden}</span>
    </button> : null}
    {open ? <OriginDetails name={name} trigger={trigger} onClose={close}>
      {origins.map(origin => <li key={cellKey(origin.type, origin.gen)} data-origin-detail
        className="flex items-center gap-2 leading-normal">
        <CoordinatePair type={origin.type} gen={origin.gen} size={20} />
        <span>{label(origin.type, origin.gen)}</span>
      </li>)}
    </OriginDetails> : null}
  </span>;
}

function CoordinatePair({ type, gen, size }: { type: SourceCoordinate['type']; gen: SourceCoordinate['gen']; size: number }) {
  const { radius, halfWidth } = originShapeGeometry(size);
  return <span aria-hidden className="flex shrink-0 overflow-hidden bg-white ring-1 ring-zinc-300"
    style={{ width: halfWidth * 2, height: size, borderRadius: radius }}>
    <CoordinateIcon axis={gen} size={size} width={halfWidth} />
    <CoordinateIcon axis={type} size={size} width={halfWidth} divider />
  </span>;
}

function CoordinateIcon({ axis, size, width = size, divider = false }: {
  axis: SourceCoordinate['type'] | SourceCoordinate['gen']; size: number; width?: number; divider?: boolean;
}) {
  return <span aria-hidden data-origin-half className="flex shrink-0 items-center justify-center"
    style={{ width, height: size, boxShadow: divider ? 'inset 1px 0 #d4d4d8' : undefined, background: isGenNumber(axis)
      ? `linear-gradient(135deg, ${GEN_STOPS[axis].map(stop => `${stop.color} ${stop.offset}`).join(', ')})`
      : isTypeName(axis) ? TYPE_COLORS[axis] : undefined }}>
    {isGenNumber(axis) ? <img src={ROMAN_GLYPHS[axis]} alt="" width={size} height={size} draggable={false} className="block shrink-0" />
      : isTypeName(axis) ? <TypeIcon type={axis} size={size - 2} /> : <ExtraMark id={axis} size={size - 2} />}
  </span>;
}
