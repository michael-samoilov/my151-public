import { useT, typeLabel } from '@/i18n';
import { cellKey, isGenNumber, isTypeName, ROMAN, GEN_NUMBERS, type GenNumber } from '../model/cells';
import type { SourceCoordinate } from '../model/pointers';
import { GEN_STOPS } from '@/components/shared/GenBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import { ExtraMark, TypeIcon } from './marks';
import { ROMAN_URIS } from './romanDiscAssets';
import { coordinatePillLayout } from './coordinatePillLayout';

// Keep the shared numeral, outline and font; only remove its disc. A tighter
// viewBox gives the glyph room inside the generation-colored half.
const ROMAN_GLYPHS = Object.fromEntries(GEN_NUMBERS.map(gen => [gen,
  `data:image/svg+xml,${encodeURIComponent(decodeURIComponent(ROMAN_URIS[gen].split(',')[1])
    .replace(/<circle\b[^>]*\/>/, '')
    .replace('viewBox="0 0 32 32"', 'viewBox="2 5 28 22"'))}`,
])) as Record<GenNumber, string>;

/** Joined immediate-source coordinates, kept together when a pick has several origins. */
export function CoordinatePills({ origins, spritePx, inset, markPx, pointer }: {
  origins: SourceCoordinate[]; spritePx: number; inset: number; markPx: number; pointer: boolean;
}) {
  const t = useT();
  const { size, gap, width } = coordinatePillLayout(spritePx, inset, markPx);
  return <span className="pointer-events-none z-[16] flex flex-wrap justify-center leading-none"
    style={{ marginTop: inset, width, gap, opacity: pointer ? 0.85 : 1 }}>
    {origins.map(({ type, gen, mark }) => {
      const row = isGenNumber(gen) ? t('favorites.generation', { gen: ROMAN[gen] }) : t(`favorites.axis.${gen}`);
      const column = isTypeName(type) ? typeLabel(type) : t(`favorites.axis.${type}`);
      return <span key={cellKey(type, gen)} role="img" aria-label={`${row} · ${column}`}
        data-testid={pointer ? 'favorites-pointer-mark' : 'favorites-used-mark'}
        data-coordinate-cell={cellKey(type, gen)} data-source={mark.source} data-value={'value' in mark ? mark.value : undefined}
        className="flex shrink-0 overflow-hidden bg-white ring-1 ring-zinc-300"
        style={{ width: size * 2, height: size, borderRadius: size * 0.2 }}>
        <span aria-hidden className="flex items-center justify-center" style={{ width: size, height: size, background: isGenNumber(gen)
            ? `linear-gradient(135deg, ${GEN_STOPS[gen].map(stop => `${stop.color} ${stop.offset}`).join(', ')})` : undefined }}>
          {isGenNumber(gen) ? <img src={ROMAN_GLYPHS[gen]} alt="" width={size} height={size} draggable={false} className="block shrink-0" /> : <ExtraMark id={gen} size={size - 2} />}
        </span>
        <span aria-hidden className="flex items-center justify-center border-l border-zinc-300" style={{ width: size, height: size, background: isTypeName(type) ? TYPE_COLORS[type] : undefined }}>
          {isTypeName(type) ? <TypeIcon type={type} size={size - 2} /> : <ExtraMark id={type} size={size - 2} />}
        </span>
      </span>;
    })}
  </span>;
}
