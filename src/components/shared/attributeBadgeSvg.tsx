import type { ReactNode } from 'react';
import { TYPE_BADGE, TYPE_BADGE_H, TYPE_BADGE_W, typeBadgeGlyphBox } from '@/lib/typeBadgeGeometry';
import { attributeBadgeLayout, COLOR_BADGE_FILLS, colorBadgeTextFill } from '@/lib/attributeBadgeStyle';
import type { ColorName, ShapeName } from '@/types/pokemon';
import { GenerationBadge } from '@/favorites/components/WordBadge';
import type { GenNumber } from '@/favorites/model/cells';
import { shapeIconPath } from './ShapeIcon';

function attributeBadgeSvg(kind: 'color' | 'shape', value: ColorName | ShapeName): ReactNode {
  const { label, centerX, fit } = attributeBadgeLayout(kind, value);
  const color = kind === 'color' ? colorBadgeTextFill(value as ColorName) : '#000000';
  const box = typeBadgeGlyphBox();
  return <>
    <rect x={.5} y={.5} width={TYPE_BADGE_W - 1} height={TYPE_BADGE_H - 1} rx={TYPE_BADGE.radius - .5}
      fill={kind === 'color' ? COLOR_BADGE_FILLS[value as ColorName] : '#ffffff'} stroke="#a3a3a3" strokeWidth={1} />
    {kind === 'shape' && <image href={shapeIconPath(value)} x={box.x} y={box.y} width={box.size} height={box.size} preserveAspectRatio="xMidYMid meet" />}
    <g transform={`translate(${centerX} 0) scale(${fit.scaleX} 1) translate(${-centerX} 0)`}>
      <text x={centerX} y={fit.baseline} textAnchor="middle" fontSize={fit.fontSize} fontWeight={TYPE_BADGE.fontWeight} fill={color}>{label}</text>
    </g>
  </>;
}

export const colorBadgeSvg = (color: ColorName) => attributeBadgeSvg('color', color);
export const shapeBadgeSvg = (shape: ShapeName) => attributeBadgeSvg('shape', shape);

function badgeChartIcon(render: () => ReactNode) {
  return (x: number, y: number, size: number, colWidth = size): ReactNode => {
    const scale = Math.min(colWidth / TYPE_BADGE_W, size / TYPE_BADGE_H);
    return <g transform={`translate(${x + (colWidth - TYPE_BADGE_W * scale) / 2} ${y + (size - TYPE_BADGE_H * scale) / 2}) scale(${scale})`}>{render()}</g>;
  };
}

export const colorChartIcon = (color: ColorName) => badgeChartIcon(() => colorBadgeSvg(color));
export const shapeBadgeChartIcon = (shape: ShapeName) => badgeChartIcon(() => shapeBadgeSvg(shape));

/** Reuse the existing generation pill, including its hard gradient and outlined word. */
export function generationChartIcon(gen: GenNumber) {
  return (x: number, y: number, size: number, colWidth = size): ReactNode => {
    const height = Math.min(size, colWidth * TYPE_BADGE_H / TYPE_BADGE_W);
    const width = height * TYPE_BADGE_W / TYPE_BADGE_H;
    // A nested SVG needs an explicit coordinate viewport; CSS sizing alone
    // leaves its hit box relative to the complete chart instead of its row.
    return <svg x={x + (colWidth - width) / 2} y={y + (size - height) / 2}
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <GenerationBadge gen={gen} maxUnits={TYPE_BADGE_W} height={height} />
    </svg>;
  };
}
