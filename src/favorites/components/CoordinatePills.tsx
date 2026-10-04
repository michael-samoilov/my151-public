import { useCallback, useRef, useState } from 'react';
import { useT, typeLabel } from '@/i18n';
import { cellKey, isGenNumber, isTypeName, ROMAN, GEN_NUMBERS, type GenNumber } from '../model/cells';
import type { SourceCoordinate } from '../model/pointers';
import { GEN_STOPS } from '@/components/shared/GenBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import { ExtraMark, RomanDisc, TypeIcon } from './marks';
import { ROMAN_URIS } from './romanDiscAssets';
import { OriginDetails } from './OriginDetails';
import { coordinateBandLayout, visibleOriginCount, singleOriginMark, type OriginContext } from './coordinatePillLayout';

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
  const layout = coordinateBandLayout(spritePx, inset, markPx);
  const { size, gap, width, height } = layout;
  const visible = visibleOriginCount(origins, pointer, current, layout);
  const hidden = origins.length - visible;
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const label = (type: SourceCoordinate['type'], gen: SourceCoordinate['gen']) => `${isGenNumber(gen)
    ? t('favorites.generation', { gen: ROMAN[gen] }) : t(`favorites.axis.${gen}`)} · ${isTypeName(type)
    ? typeLabel(type) : t(`favorites.axis.${type}`)}`;
  return <span data-testid="favorites-origin-band" className="z-[16] flex shrink-0 items-center justify-end leading-none"
    style={{ width, height, gap, opacity: pointer ? 0.85 : 1 }}>
    <span id={id} className="sr-only">{origins.map(origin => label(origin.type, origin.gen)).join('; ')}</span>
    {origins.slice(0, visible).map(origin => {
      const { type, gen, mark } = origin;
      const single = singleOriginMark(origin, pointer, current);
      const fullLabel = label(type, gen);
      return <span key={cellKey(type, gen)} role="img" aria-label={fullLabel} title={fullLabel}
        data-origin-mode={single ? 'single' : 'pair'}
        data-testid={pointer ? 'favorites-pointer-mark' : 'favorites-used-mark'}
        data-coordinate-cell={cellKey(type, gen)} data-source={mark.source} data-value={'value' in mark ? mark.value : undefined}
        className={single?.source === 'gen' ? 'flex shrink-0' : 'flex shrink-0 overflow-hidden bg-white ring-1 ring-zinc-300'}
        style={{ width: size * (single ? 1 : 2), height: size, borderRadius: size * 0.2 }}>
        {single?.source === 'gen' ? <RomanDisc gen={single.value} size={size} /> : single ? <CoordinateIcon axis={single.source === 'type' ? single.value : single.source} size={size} /> : <>
          <CoordinateIcon axis={gen} size={size} />
          <CoordinateIcon axis={type} size={size} divider />
        </>}
      </span>;
    })}
    {hidden > 0 ? <button ref={trigger} type="button" data-testid="favorites-origin-overflow"
      aria-label={t('favorites.origins.more', { pokemon: name })} aria-describedby={id} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}
      className="flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold text-foreground hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-primary"
      style={{ width: height, height }}>+{hidden}</button> : null}
    {open ? <OriginDetails name={name} trigger={trigger} onClose={close}>
      {origins.map(origin => <li key={cellKey(origin.type, origin.gen)} data-origin-detail
        className="flex items-center gap-2 leading-normal">
        <span aria-hidden className="flex shrink-0 overflow-hidden rounded-sm ring-1 ring-zinc-300">
          <CoordinateIcon axis={origin.gen} size={20} /><CoordinateIcon axis={origin.type} size={20} divider />
        </span>
        <span>{label(origin.type, origin.gen)}</span>
      </li>)}
    </OriginDetails> : null}
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
