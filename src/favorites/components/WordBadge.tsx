import { useId, type CSSProperties } from 'react';
import { localeUppercase, useLocale, useT } from '@/i18n';
import { TYPE_BADGE, TYPE_BADGE_H, TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit } from '@/lib/typeBadgeFit';
import { localeTypeLabels } from '@/components/shared/typeBadgeSvg';
import type { ExtraTypeAxis, GenNumber } from '../model/cells';
import { AXIS_FILL, GEN_FILL, WORD_BADGE_MARGIN, generationBadgeUnits, generationLabel, generationOutlined, type BadgeStops } from './badgeStyle';

const OUTLINE_PER_FONT = 1.25 / 15;
const OUTLINE_MIN_PX = 0.6;
// The word is condensed sideways, and a stroke on it is condensed with it:
// about 0.7 as thick at the sides as at the top. So the outline repeats the
// stroked word at small steps left and right, until the sides match the top.
// Only horizontal steps: browsers snap text to whole pixels vertically, and
// vertical steps would round unevenly.
const OUTLINE_SPREAD = [-1, -0.5, 0, 0.5, 1];
const EDGE = 1;

type Sizing = {
  className?: string;
  height?: number;
};

function WordBadge({
  spoken,
  fill,
  units = TYPE_BADGE_W,
  split = false,
  outlined = false,
  className,
  height,
  data,
}: Sizing & {
  spoken: string;
  fill: string | BadgeStops;
  units?: number;
  split?: boolean;
  outlined?: boolean;
  data: Record<`data-${string}`, string | number>;
}) {
  const gradientId = `word-badge-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const label = localeUppercase(spoken);
  const fit = typeBadgeFit(label, localeTypeLabels(), units - 2 * WORD_BADGE_MARGIN);
  const centerX = units / 2;
  const reach = (units + TYPE_BADGE_H) / 2;
  const style: CSSProperties | undefined = height == null ? undefined : { height, width: height * units / TYPE_BADGE_H };
  const outline = Math.max(fit.fontSize * OUTLINE_PER_FONT / 2, height == null ? 0 : OUTLINE_MIN_PX * TYPE_BADGE_H / height);
  const spread = outline * (1 - fit.scaleX);
  const condense = `translate(${centerX} 0) scale(${fit.scaleX} 1) translate(${-centerX} 0)`;
  const word = (color: string, stroke?: number) => (
    <text
      x={centerX}
      y={fit.baseline}
      textAnchor="middle"
      fontSize={fit.fontSize}
      fontWeight={TYPE_BADGE.fontWeight}
      fill={color}
      stroke={stroke == null ? undefined : color}
      strokeWidth={stroke}
      strokeLinejoin={stroke == null ? undefined : 'round'}
    >
      {label}
    </text>
  );
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
      {outlined ? (
        <g opacity={0.85} aria-hidden>
          {OUTLINE_SPREAD.map((step) => (
            <g key={step} transform={`translate(${step * spread} 0)`}>
              <g transform={condense}>{word('#000000', 2 * outline)}</g>
            </g>
          ))}
        </g>
      ) : null}
      <g transform={condense}>{word('#ffffff')}</g>
    </svg>
  );
}

export function AxisBadge({ id, ...sizing }: Sizing & { id: ExtraTypeAxis }) {
  useLocale();
  const t = useT();
  return <WordBadge spoken={t(`favorites.axis.${id}`)} fill={AXIS_FILL[id]} data={{ 'data-axis': id }} {...sizing} />;
}

export function GenerationBadge({ gen, maxUnits, ...sizing }: Sizing & { gen: GenNumber; maxUnits?: number }) {
  useLocale();
  const units = Math.min(generationBadgeUnits(), maxUnits ?? Infinity);
  return <WordBadge spoken={generationLabel(gen)} fill={GEN_FILL[gen]} units={units} split outlined={generationOutlined(gen)} data={{ 'data-gen': gen }} {...sizing} />;
}
