import { useId, type CSSProperties } from 'react';
import { localeUppercase, useLocale, useT } from '@/i18n';
import { TYPE_BADGE, TYPE_BADGE_H, TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit } from '@/lib/typeBadgeFit';
import { localeTypeLabels } from '@/components/shared/typeBadgeSvg';
import type { ExtraTypeAxis, GenNumber } from '../model/cells';
import { AXIS_FILL, GEN_FILL, WORD_BADGE_MARGIN, generationBadgeUnits, generationLabel, type BadgeStops } from './badgeStyle';

// The generation disc outlines its white numeral in near-black so it reads on
// both halves, such as gen V's black and white. The badge keeps the disc's
// ratio of outline to font size, and at small sizes it keeps at least this
// much outline showing past the letter, in CSS px.
const OUTLINE_PER_FONT = 1.25 / 15;
const OUTLINE_MIN_PX = 0.6;
// The disc's grey hairline edge, which keeps a pale half visible on a pale
// background. In badge units.
const EDGE = 1;

type Sizing = {
  /** Sets the width; the height follows from the pill's aspect. */
  className?: string;
  /** Sets the height in CSS px; the width follows from the pill's aspect. */
  height?: number;
};

/**
 * A type-badge-style pill with a word and no symbol. It sizes its word from
 * the type names, so it shares their letter height. `units` is the pill's
 * length in the type badge's 40-unit height; 200 matches a type badge.
 */
function WordBadge({
  spoken,
  fill,
  units = TYPE_BADGE_W,
  split = false,
  className,
  height,
  data,
}: Sizing & {
  spoken: string;
  fill: string | BadgeStops;
  units?: number;
  /** Hard-edged bands at 45°, as on the generation discs, with an outlined word. */
  split?: boolean;
  data: Record<`data-${string}`, string | number>;
}) {
  const gradientId = `word-badge-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const label = localeUppercase(spoken);
  const fit = typeBadgeFit(label, localeTypeLabels(), units - 2 * WORD_BADGE_MARGIN);
  const centerX = units / 2;
  // A 45° band edge crosses the pill's middle when the gradient runs from the
  // top-left corner to the point level with the far end along that diagonal.
  const reach = (units + TYPE_BADGE_H) / 2;
  const style: CSSProperties | undefined = height == null ? undefined : { height, width: height * units / TYPE_BADGE_H };
  // Paint order puts the stroke under the fill, so half of it shows.
  const outline = Math.max(fit.fontSize * OUTLINE_PER_FONT, height == null ? 0 : 2 * OUTLINE_MIN_PX * TYPE_BADGE_H / height);
  return (
    <svg
      viewBox={`0 0 ${units} ${TYPE_BADGE_H}`}
      className={`${height == null ? 'h-auto' : ''} ${className ?? ''}`}
      style={style}
      // At some sub-pixel offsets Chrome clips the SVG box short of the
      // pill's rounded end. Nothing draws outside the pill.
      overflow="visible"
      role="img"
      aria-label={spoken}
      {...data}
    >
      {typeof fill === 'string' ? null : (
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            y1="0"
            x2={split ? reach : units}
            y2={split ? reach : TYPE_BADGE_H}
            gradientUnits="userSpaceOnUse"
          >
            {fill.map(([offset, color], i) => <stop key={i} offset={offset} stopColor={color} />)}
          </linearGradient>
        </defs>
      )}
      <rect
        x={split ? EDGE / 2 : 0}
        y={split ? EDGE / 2 : 0}
        width={split ? units - EDGE : units}
        height={split ? TYPE_BADGE_H - EDGE : TYPE_BADGE_H}
        rx={split ? TYPE_BADGE.radius - EDGE / 2 : TYPE_BADGE.radius}
        fill={typeof fill === 'string' ? fill : `url(#${gradientId})`}
        stroke={split ? '#d4d4d8' : undefined}
        strokeWidth={split ? EDGE : undefined}
      />
      <g transform={`translate(${centerX} 0) scale(${fit.scaleX} 1) translate(${-centerX} 0)`}>
        <text
          x={centerX}
          y={fit.baseline}
          textAnchor="middle"
          fontSize={fit.fontSize}
          fontWeight={TYPE_BADGE.fontWeight}
          fill="#ffffff"
          stroke={split ? 'rgba(0,0,0,0.85)' : undefined}
          strokeWidth={split ? outline : undefined}
          paintOrder={split ? 'stroke' : undefined}
        >
          {label}
        </text>
      </g>
    </svg>
  );
}

/** The starter, gimmick, legendary, or favorite badge: a type badge's size. */
export function AxisBadge({ id, ...sizing }: Sizing & { id: ExtraTypeAxis }) {
  useLocale();
  const t = useT();
  return <WordBadge spoken={t(`favorites.axis.${id}`)} fill={AXIS_FILL[id]} data={{ 'data-axis': id }} {...sizing} />;
}

/**
 * The generation badge. Its pill is longer than a type badge, so the longest
 * name keeps the type names' letter height. `maxUnits` caps the length where
 * the room is fixed, and the word condenses to fit.
 */
export function GenerationBadge({ gen, maxUnits, ...sizing }: Sizing & { gen: GenNumber; maxUnits?: number }) {
  useLocale();
  const units = Math.min(generationBadgeUnits(), maxUnits ?? Infinity);
  return <WordBadge spoken={generationLabel(gen)} fill={GEN_FILL[gen]} units={units} split data={{ 'data-gen': gen }} {...sizing} />;
}
