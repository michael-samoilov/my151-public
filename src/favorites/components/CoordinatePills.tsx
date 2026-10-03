import { useT, typeLabel } from '@/i18n';
import { cellKey, isGenNumber, isTypeName, ROMAN } from '../model/cells';
import type { SourceCoordinate } from '../model/pointers';
import { GEN_STOPS } from '@/components/shared/GenBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import { ExtraMark, RomanDisc, TypeIcon } from './marks';

/** Joined immediate-source coordinates, kept together when a pick has several origins. */
export function CoordinatePills({ origins, spritePx, inset, markPx, pointer }: {
  origins: SourceCoordinate[]; spritePx: number; inset: number; markPx: number; pointer: boolean;
}) {
  const t = useT();
  const size = Math.min(markPx, Math.floor((spritePx - inset * 2 - origins.length + 1) / origins.length));
  return <span className="pointer-events-none absolute z-[16] flex flex-col items-end gap-px leading-none"
    style={{ right: inset, top: inset, opacity: pointer ? 0.85 : 1 }}>
    {origins.map(({ type, gen, mark }) => {
      const row = isGenNumber(gen) ? t('favorites.generation', { gen: ROMAN[gen] }) : t(`favorites.axis.${gen}`);
      const column = isTypeName(type) ? typeLabel(type) : t(`favorites.axis.${type}`);
      return <span key={cellKey(type, gen)} role="img" aria-label={`${row} · ${column}`}
        data-testid={pointer ? 'favorites-pointer-mark' : 'favorites-used-mark'}
        data-coordinate-cell={cellKey(type, gen)} data-source={mark.source} data-value={'value' in mark ? mark.value : undefined}
        className="flex shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-zinc-300"
        style={{ width: size * 2, height: size }}>
        <span aria-hidden className="flex items-center justify-center" style={{ width: size, height: size, background: isGenNumber(gen)
            ? `linear-gradient(135deg, ${GEN_STOPS[gen].map(stop => `${stop.color} ${stop.offset}`).join(', ')})` : undefined }}>
          {isGenNumber(gen) ? <RomanDisc gen={gen} size={size - 2} /> : <ExtraMark id={gen} size={size - 2} />}
        </span>
        <span aria-hidden className="flex items-center justify-center border-l border-zinc-300" style={{ width: size, height: size, background: isTypeName(type) ? TYPE_COLORS[type] : undefined }}>
          {isTypeName(type) ? <TypeIcon type={type} size={size - 2} /> : <ExtraMark id={type} size={size - 2} />}
        </span>
      </span>;
    })}
  </span>;
}
