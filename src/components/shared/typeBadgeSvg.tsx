import type { ReactNode } from 'react';
import type { TypeName } from '@/types/pokemon';
import { typeGlyphPath } from '@/data/type-ids';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeLabel, typeLabels, localeUppercase, getVersion } from '@/i18n';
import {
  TYPE_BADGE,
  TYPE_BADGE_H,
  TYPE_BADGE_W,
  typeBadgeGlyphBox,
} from '@/lib/typeBadgeGeometry';
import { typeBadgeFit } from '@/lib/typeBadgeFit';

let labelCache: { version: number; labels: string[] } | null = null;

export function localeTypeLabels(): string[] {
  const version = getVersion();
  if (!labelCache || labelCache.version !== version) {
    labelCache = { version, labels: typeLabels().map(localeUppercase) };
  }
  return labelCache.labels;
}

export function typeBadgeSvg(type: TypeName, label: string): ReactNode {
  const glyph = typeBadgeGlyphBox();
  const fit = typeBadgeFit(label, localeTypeLabels());
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
      <g
        transform={
          `translate(${TYPE_BADGE.textCenterX} 0) scale(${fit.scaleX} 1) ` +
          `translate(${-TYPE_BADGE.textCenterX} 0)`
        }
      >
        <text
          x={TYPE_BADGE.textCenterX}
          y={fit.baseline}
          textAnchor="middle"
          fontSize={fit.fontSize}
          fontWeight={TYPE_BADGE.fontWeight}
          fill="#ffffff"
        >
          {label}
        </text>
      </g>
    </>
  );
}

export function typeChartIcon(type: TypeName) {
  return function render(x: number, y: number, size: number, colWidth: number): ReactNode {
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
