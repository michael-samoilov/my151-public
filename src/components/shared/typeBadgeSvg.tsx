import type { ReactNode } from 'react';
import type { TypeName } from '@/types/pokemon';
import { typeGlyphPath } from '@/data/type-ids';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeLabel, localeUppercase } from '@/i18n';
import {
  TYPE_BADGE,
  TYPE_BADGE_H,
  TYPE_BADGE_W,
  typeBadgeBaseline,
  typeBadgeFontSize,
  typeBadgeGlyphBox,
} from '@/lib/typeBadgeGeometry';

/**
 * The badge's SVG innards, and the chart-icon wrapper around them.
 *
 * Separate from `TypeBadge.tsx` only so that file exports a component and
 * nothing else — react-refresh cannot hot-reload a module that mixes the two.
 */

/** Contents of a badge drawn in its own 200x40 space. */
export function typeBadgeSvg(type: TypeName, label: string): ReactNode {
  const glyph = typeBadgeGlyphBox();
  const fontSize = typeBadgeFontSize();
  return (
    <>
      <rect
        width={TYPE_BADGE_W}
        height={TYPE_BADGE_H}
        rx={TYPE_BADGE.radius}
        fill={TYPE_COLORS[type]}
      />
      <image
        href={typeGlyphPath(type)}
        x={glyph.x}
        y={glyph.y}
        width={glyph.size}
        height={glyph.size}
        preserveAspectRatio="xMidYMid meet"
      />
      {/* Condensed about the text's own centre, so the anchor stays put. */}
      <g
        transform={
          `translate(${TYPE_BADGE.textCenterX} 0) scale(${TYPE_BADGE.textScaleX} 1) ` +
          `translate(${-TYPE_BADGE.textCenterX} 0)`
        }
      >
        <text
          x={TYPE_BADGE.textCenterX}
          y={typeBadgeBaseline()}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight={TYPE_BADGE.fontWeight}
          fill="#ffffff"
        >
          {label}
        </text>
      </g>
    </>
  );
}

/**
 * The badge as a ButterflyChart row icon — the twin of `shapeChartIcon`, so it
 * drops into the chart's icon slot with no chart-side special casing. Fills the
 * icon column, which the caller widens via `iconColAspect`.
 */
export function typeChartIcon(type: TypeName) {
  return function render(x: number, y: number, size: number, colWidth: number): ReactNode {
    // Contain-fit inside the column: the badge is 5:1 and the column may not be.
    const scale = Math.min(colWidth / TYPE_BADGE_W, size / TYPE_BADGE_H);
    const w = TYPE_BADGE_W * scale;
    const h = TYPE_BADGE_H * scale;
    return (
      <g
        key={`type-badge-${type}`}
        transform={`translate(${x + (colWidth - w) / 2} ${y + (size - h) / 2}) scale(${scale})`}
      >
        {typeBadgeSvg(type, localeUppercase(typeLabel(type)))}
      </g>
    );
  };
}
