import { localeUppercase, typeLabel, useLocale, useT } from '@/i18n';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeGlyphPath } from '@/data/type-ids';
import { TYPE_BADGE, TYPE_BADGE_H, TYPE_BADGE_W, typeBadgeGlyphBox } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit } from '@/lib/typeBadgeFit';
import { localeTypeLabels } from '@/components/shared/typeBadgeSvg';
import { isTypeName, type ExtraTypeAxis, type TypeAxisId } from '../model/cells';
import { AXIS_FILL, WORD_BADGE_MARGIN } from './badgeStyle';

export function WideBadge({ id }: { id: TypeAxisId }) {
  useLocale();
  const t = useT();
  const glyph = typeBadgeGlyphBox();
  const type = isTypeName(id) ? id : null;
  const spoken = type ? typeLabel(type) : t(`favorites.axis.${id as ExtraTypeAxis}`);
  const label = localeUppercase(spoken);
  const fit = type
    ? typeBadgeFit(label, localeTypeLabels())
    : typeBadgeFit(label, localeTypeLabels(), TYPE_BADGE_W - 2 * WORD_BADGE_MARGIN);
  const centerX = type ? TYPE_BADGE.textCenterX : TYPE_BADGE_W / 2;
  const fill = type ? TYPE_COLORS[type] : AXIS_FILL[id as ExtraTypeAxis];
  const background = typeof fill === 'string'
    ? fill
    : `linear-gradient(101deg, ${fill.map(([offset, color]) => `${color} ${offset * 100}%`).join(', ')})`;
  const h = (units: number) => `calc(100cqh * ${units / TYPE_BADGE_H})`;
  return (
    <div
      role="img"
      aria-label={spoken}
      data-type={type ?? undefined}
      data-axis={type ? undefined : id}
      className="relative h-full w-full"
      style={{ containerType: 'size' }}
    >
      <div className="absolute inset-0" style={{ background, borderRadius: h(TYPE_BADGE.radius) }} />
      {type ? (
        <img
          src={typeGlyphPath(type)}
          alt=""
          draggable={false}
          className="absolute object-contain"
          style={{ left: h(glyph.x), top: h(glyph.y), width: h(glyph.size), height: h(glyph.size) }}
        />
      ) : null}
      <svg
        viewBox={`0 0 ${TYPE_BADGE_W} ${TYPE_BADGE_H}`}
        className="absolute left-1/2 top-0 h-full -translate-x-1/2"
        style={{ width: h(TYPE_BADGE_W) }}
        aria-hidden
      >
        <g transform={`translate(${centerX} 0) scale(${fit.scaleX} 1) translate(${-centerX} 0)`}>
          <text
            x={centerX}
            y={fit.baseline}
            textAnchor="middle"
            fontSize={fit.fontSize}
            fontWeight={TYPE_BADGE.fontWeight}
            fill="#ffffff"
          >
            {label}
          </text>
        </g>
      </svg>
    </div>
  );
}
