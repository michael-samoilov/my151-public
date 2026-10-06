import type { ReactNode } from 'react';
import { TYPE_BADGE, TYPE_BADGE_H, TYPE_BADGE_W, typeBadgeGlyphBox } from '@/lib/typeBadgeGeometry';
import { attributeBadgeLayout, COLOR_BADGE_FILLS, colorBadgeTextFill, type EvolutionRole } from '@/lib/attributeBadgeStyle';
import type { ColorName, ShapeName } from '@/types/pokemon';
import { GenerationBadge } from '@/favorites/components/WordBadge';
import type { GenNumber } from '@/favorites/model/cells';
import { shapeIconPath } from './ShapeIcon';

function attributeBadgeSvg(kind: 'color' | 'shape' | 'evolution', value: ColorName | ShapeName | EvolutionRole): ReactNode {
  const { label, centerX, fit } = attributeBadgeLayout(kind, value);
  const color = kind === 'color' ? colorBadgeTextFill(value as ColorName) : '#171717';
  const box = typeBadgeGlyphBox();
  return <>
    <rect x={.5} y={.5} width={TYPE_BADGE_W - 1} height={TYPE_BADGE_H - 1} rx={TYPE_BADGE.radius - .5}
      fill={kind === 'color' ? COLOR_BADGE_FILLS[value as ColorName] : '#ffffff'} stroke={kind === 'color' && value !== 'white' ? undefined : "#a3a3a3"} strokeWidth={1} />
    {kind === 'evolution' && evolutionDotsSvg(value as EvolutionRole)}
    {kind === 'shape' && <image href={shapeIconPath(value)} x={box.x} y={box.y} width={box.size} height={box.size} preserveAspectRatio="xMidYMid meet" />}
    <g transform={`translate(${centerX} 0) scale(${fit.scaleX} 1) translate(${-centerX} 0)`}>
      <text x={centerX} y={fit.baseline} textAnchor="middle" fontSize={fit.fontSize} fontWeight={TYPE_BADGE.fontWeight} fill={color}>{label}</text>
    </g>
  </>;
}

export function evolutionDotsSvg(role: EvolutionRole): ReactNode {
  const filled = role === 'basic' ? 1 : role === 'intermediate' ? 2 : 3;
  // All roles reserve the same three-dot slot; standalone paints its center only.
  return <g data-evolution-dots={role}>{[0, 1, 2].filter(index => role !== 'standalone' || index === 1).map(index =>
    <circle key={index} cx={18 + index * 14} cy={TYPE_BADGE_H / 2} r={4.5}
      fill={role === 'standalone' || index < filled ? '#dc2626' : 'none'} stroke="#dc2626" strokeWidth={1.5} />)}</g>;
}

export const evolutionBadgeSvg = (role: EvolutionRole) => attributeBadgeSvg('evolution', role);
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

export const evolutionChartIcon = (role: EvolutionRole) => badgeChartIcon(() => evolutionBadgeSvg(role));
