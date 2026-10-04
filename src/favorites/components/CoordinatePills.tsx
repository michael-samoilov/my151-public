import { cellKey, isGenNumber, isTypeName, GEN_NUMBERS, type GenNumber } from '../model/cells';
import type { SourceCoordinate } from '../model/pointers';
import { RomanDisc, TypeIcon } from './marks';
import { ExtraSymbol } from './ExtraSymbol';
import { axisBackground, coordinateLabel, displayCoordinate } from './coordinatePresentation';
import { ROMAN_URIS } from './romanDiscAssets';
import { coordinateOverlayLayout, originShapeGeometry, originMarkBox, visibleOriginCount, singleOriginMark, type OriginContext } from './coordinatePillLayout';

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
  const layout = coordinateOverlayLayout(spritePx, inset, markPx);
  const { size, circleSize, radius, circleDiameter, outlineOutset, gap, width, height } = layout;
  const visible = visibleOriginCount(origins, pointer, current, layout);
  const hidden = origins.length - visible;
  const label = coordinateLabel;
  return <span data-testid="favorites-origin-overlay" className="pointer-events-none absolute z-[16] flex items-center justify-end leading-none"
    style={{ top: inset, right: inset, width, height, opacity: pointer ? 0.85 : 1 }}>
    <span id={id} className="sr-only">{origins.map(origin => label(origin.type, origin.gen)).join('; ')}</span>
    {origins.slice(0, visible).map((origin, index) => {
      const { type, gen, mark } = origin;
      const single = singleOriginMark(origin, pointer, current);
      const fullLabel = label(type, gen);
      const box = originMarkBox(single, layout);
      const previous = index > 0 ? originMarkBox(singleOriginMark(origins[index - 1], pointer, current), layout).padding : 0;
      return <span key={cellKey(type, gen)} role="img" aria-label={fullLabel} title={fullLabel}
        data-origin-mode={single ? 'single' : 'pair'}
        data-testid={pointer ? 'favorites-pointer-mark' : 'favorites-used-mark'}
        data-coordinate-cell={cellKey(type, gen)} data-source={mark.source} data-value={'value' in mark ? mark.value : undefined}
        className={single && single.source !== 'gen' ? 'pointer-events-auto flex shrink-0 bg-white' : 'pointer-events-auto flex shrink-0'}
        style={{ width: box.width, height: box.height, marginLeft: index ? gap - previous - box.padding : 0, borderRadius: single ? 0 : radius, boxShadow: single && single.source !== 'gen' ? `0 0 0 ${outlineOutset}px #d4d4d8` : undefined }}>
        {single?.source === 'gen' ? <RomanDisc gen={single.value} size={circleSize} /> : single ? <CoordinateIcon axis={single.source === 'type' ? single.value : single.source} size={size} /> : <CoordinatePair type={type} gen={gen} size={size} />}
      </span>;
    })}
    {hidden > 0 ? <span data-testid="favorites-origin-overflow-badge" role="img"
      aria-label={origins.map(origin => label(origin.type, origin.gen)).join('; ')}
      title={origins.map(origin => label(origin.type, origin.gen)).join('; ')}
      className="pointer-events-auto flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground"
      style={{ width: circleDiameter, height: circleDiameter, fontSize: size * 0.55,
        marginLeft: visible ? gap - originMarkBox(singleOriginMark(origins[visible - 1], pointer, current), layout).padding + outlineOutset : 0,
        boxShadow: `0 0 0 ${outlineOutset}px #d4d4d8` }}>+{hidden}</span> : null}
  </span>;
}

function CoordinatePair({ type, gen, size }: { type: SourceCoordinate['type']; gen: SourceCoordinate['gen']; size: number }) {
  const { radius, halfWidth, outlineOutset } = originShapeGeometry(size);
  const display = displayCoordinate(type, gen);
  if (display.gen == null) return <CoordinateIcon axis={display.type} size={size} />;
  return <span aria-hidden className="flex shrink-0 overflow-hidden bg-white"
    style={{ width: halfWidth * 2, height: size, borderRadius: radius, boxShadow: `0 0 0 ${outlineOutset}px #d4d4d8` }}>
    <CoordinateIcon axis={display.gen} size={size} width={halfWidth} />
    <CoordinateIcon axis={display.type} size={size} width={halfWidth} divider />
  </span>;
}

function CoordinateIcon({ axis, size, width = size, divider = false }: {
  axis: SourceCoordinate['type'] | SourceCoordinate['gen']; size: number; width?: number; divider?: boolean;
}) {
  return <span aria-hidden data-origin-half className="flex shrink-0 items-center justify-center"
    style={{ width, height: size, boxShadow: divider ? 'inset 1px 0 #d4d4d8' : undefined, background: axisBackground(axis) }}>
    {isGenNumber(axis) ? <img src={ROMAN_GLYPHS[axis]} alt="" width={size} height={size} draggable={false} className="block shrink-0" />
      : isTypeName(axis) ? <TypeIcon type={axis} size={size - 2} /> : <ExtraSymbol id={axis} size={size - 2} />}
  </span>;
}
