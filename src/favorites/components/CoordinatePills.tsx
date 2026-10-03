import { useT, typeLabel } from '@/i18n';
import { cellKey, isGenNumber, isTypeName, ROMAN, GEN_NUMBERS, type GenNumber } from '../model/cells';
import type { SourceCoordinate } from '../model/pointers';
import { GEN_STOPS } from '@/components/shared/GenBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import { ExtraMark, TypeIcon } from './marks';
import { ROMAN_URIS } from './romanDiscAssets';
import { coordinatePillLayout, singleOriginMark, type OriginContext } from './coordinatePillLayout';

// Keep the shared numeral, outline and font; only remove its disc. A tighter
// viewBox gives the glyph room inside the generation-colored half.
const ROMAN_GLYPHS = Object.fromEntries(GEN_NUMBERS.map(gen => [gen,
  `data:image/svg+xml,${encodeURIComponent(decodeURIComponent(ROMAN_URIS[gen].split(',')[1])
    .replace(/<circle\b[^>]*\/>/, '')
    .replace('viewBox="0 0 32 32"', 'viewBox="2 5 28 22"'))}`,
])) as Record<GenNumber, string>;

/** Show each immediate origin, omitting coordinates supplied by the selector. */
export function CoordinatePills({ origins, spritePx, inset, markPx, pointer, current, id }: {
  origins: SourceCoordinate[]; spritePx: number; inset: number; markPx: number; pointer: boolean; current?: OriginContext; id?: string;
}) {
  const t = useT();
  const { size, gap, width } = coordinatePillLayout(spritePx, inset, markPx);
  const label = (type: SourceCoordinate['type'], gen: SourceCoordinate['gen']) => `${isGenNumber(gen)
    ? t('favorites.generation', { gen: ROMAN[gen] }) : t(`favorites.axis.${gen}`)} · ${isTypeName(type)
    ? typeLabel(type) : t(`favorites.axis.${type}`)}`;
  return <span className="pointer-events-none z-[16] flex flex-wrap justify-center leading-none"
    style={{ marginTop: inset, width, gap, opacity: pointer ? 0.85 : 1 }}>
    <span id={id} className="sr-only">{origins.map(origin => label(origin.type, origin.gen)).join('; ')}</span>
    {origins.map(origin => {
      const { type, gen, mark } = origin;
      const single = singleOriginMark(origin, pointer, current);
      const fullLabel = label(type, gen);
      return <span key={cellKey(type, gen)} role="img" aria-label={fullLabel} title={fullLabel}
        data-origin-mode={single ? 'single' : 'pair'}
        data-testid={pointer ? 'favorites-pointer-mark' : 'favorites-used-mark'}
        data-coordinate-cell={cellKey(type, gen)} data-source={mark.source} data-value={'value' in mark ? mark.value : undefined}
        className="pointer-events-auto flex shrink-0 overflow-hidden bg-white ring-1 ring-zinc-300"
        style={{ width: size * (single ? 1 : 2), height: size, borderRadius: size * 0.2 }}>
        {single ? <CoordinateIcon axis={single.source === 'gen' || single.source === 'type' ? single.value : single.source} size={size} /> : <>
          <CoordinateIcon axis={gen} size={size} />
          <CoordinateIcon axis={type} size={size} divider />
        </>}
      </span>;
    })}
  </span>;
}

function CoordinateIcon({ axis, size, divider = false }: {
  axis: SourceCoordinate['type'] | SourceCoordinate['gen']; size: number; divider?: boolean;
}) {
  return <span aria-hidden className={`flex items-center justify-center${divider ? ' border-l border-zinc-300' : ''}`}
    style={{ width: size, height: size, background: isGenNumber(axis)
      ? `linear-gradient(135deg, ${GEN_STOPS[axis].map(stop => `${stop.color} ${stop.offset}`).join(', ')})`
      : isTypeName(axis) ? TYPE_COLORS[axis] : undefined }}>
    {isGenNumber(axis) ? <img src={ROMAN_GLYPHS[axis]} alt="" width={size} height={size} draggable={false} className="block shrink-0" />
      : isTypeName(axis) ? <TypeIcon type={axis} size={size - 2} /> : <ExtraMark id={axis} size={size - 2} />}
  </span>;
}
