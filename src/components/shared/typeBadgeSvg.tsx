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

/**
 * The badge's SVG innards, and the chart-icon wrapper around them.
 *
 * Separate from `TypeBadge.tsx` only so that file exports a component and
 * nothing else — react-refresh cannot hot-reload a module that mixes the two.
 */

/**
 * Every type name in the active locale, uppercased the way a badge shows them.
 *
 * The badge sizes its text from the whole set rather than from the single word
 * it is drawing, so all eighteen share one cap height — see `typeBadgeFit.ts`.
 */
let labelCache: { version: number; labels: string[] } | null = null;

export function localeTypeLabels(): string[] {
  // Cached per catalog version. A full browser grid draws ~2,250 badges, and
  // each one used to translate and uppercase all eighteen names again. The
  // version key invalidates the cache on a locale change.
  const version = getVersion();
  if (!labelCache || labelCache.version !== version) {
    labelCache = { version, labels: typeLabels().map(localeUppercase) };
  }
  return labelCache.labels;
}

/** Contents of a badge drawn in its own 200x40 space. */
export function typeBadgeSvg(type: TypeName, label: string): ReactNode {
  const glyph = typeBadgeGlyphBox();
  // Size, baseline and condense all come from measuring this exact word in the
  // font that actually resolved — the official names are not ours to shorten,
  // so the layout is what gives. See `typeBadgeFit.ts`.
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
      {/* Condensed about the text's own centre, so the anchor stays put. */}
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

/**
 * The badge as a ButterflyChart row icon, so it drops into the chart's icon
 * slot with no chart-side special casing. Fills the icon column, which the
 * caller widens via `iconColAspect`.
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
