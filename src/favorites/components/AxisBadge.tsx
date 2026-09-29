import { useId } from 'react';
import { localeUppercase, useLocale, useT } from '@/i18n';
import { TYPE_BADGE, TYPE_BADGE_H, TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit } from '@/lib/typeBadgeFit';
import { localeTypeLabels } from '@/components/shared/typeBadgeSvg';
import type { ExtraTypeAxis } from '../model/cells';
import { AXIS_FILL, AXIS_TEXT_CENTER_X as TEXT_CENTER_X, AXIS_TEXT_WIDTH as TEXT_WIDTH } from './axisFill';

/**
 * A type-badge-style pill for the starter, gimmick, legendary, and favorite
 * columns. It has no symbol, and it sizes its word from the type names, so
 * both kinds of badge share one cap height.
 */
export function AxisBadge({ id, className }: { id: ExtraTypeAxis; className?: string }) {
  useLocale();
  const t = useT();
  const gradientId = `axis-${id}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const spoken = t(`favorites.axis.${id}`);
  const label = localeUppercase(spoken);
  const fit = typeBadgeFit(label, localeTypeLabels(), TEXT_WIDTH);
  const fill = AXIS_FILL[id];
  return (
    <svg
      viewBox={`0 0 ${TYPE_BADGE_W} ${TYPE_BADGE_H}`}
      className={`h-auto ${className ?? ''}`}
      // At some sub-pixel offsets Chrome clips the SVG box short of the
      // pill's rounded end. Nothing is drawn outside the pill, so showing
      // overflow only restores the end.
      overflow="visible"
      role="img"
      data-axis={id}
      aria-label={spoken}
    >
      {typeof fill === 'string' ? null : (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2={TYPE_BADGE_W} y2={TYPE_BADGE_H} gradientUnits="userSpaceOnUse">
            {fill.map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color} />)}
          </linearGradient>
        </defs>
      )}
      <rect
        width={TYPE_BADGE_W}
        height={TYPE_BADGE_H}
        rx={TYPE_BADGE.radius}
        fill={typeof fill === 'string' ? fill : `url(#${gradientId})`}
      />
      <g transform={`translate(${TEXT_CENTER_X} 0) scale(${fit.scaleX} 1) translate(${-TEXT_CENTER_X} 0)`}>
        <text
          x={TEXT_CENTER_X}
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
  );
}
