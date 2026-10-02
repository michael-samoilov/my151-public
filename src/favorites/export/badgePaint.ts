import { localeTypeLabels } from '@/components/shared/typeBadgeSvg';
import { localeUppercase, t } from '@/i18n';
import { TYPE_BADGE } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit, typeBadgeFontStack } from '@/lib/typeBadgeFit';
import { roundRect } from '@/league/export/paint';
import { AXIS_FILL, type BadgeStops } from '../components/badgeStyle';
import type { ExtraTypeAxis } from '../model/cells';

/** Preserve hard generation stops and the WordBadge diagonal on its frame. */
export function badgePaint(ctx: CanvasRenderingContext2D, fill: string | BadgeStops,
  x: number, y: number, width: number, height: number): string | CanvasGradient {
  if (typeof fill === 'string') return fill;
  const reach = (width + height) / 2;
  const gradient = ctx.createLinearGradient(x, y, x + reach, y + reach);
  for (const [offset, color] of fill) gradient.addColorStop(offset, color);
  return gradient;
}

/** The canvas twin of AxisBadge, centered on the sprite frame's bottom edge. */
export function drawAxisBadge(ctx: CanvasRenderingContext2D, axis: ExtraTypeAxis,
  cx: number, edgeY: number, height: number): void {
  const width = height * 5;
  const fit = typeBadgeFit(localeUppercase(t(`favorites.axis.${axis}`)), localeTypeLabels(), 156);
  ctx.save();
  ctx.translate(cx - width / 2, edgeY - height / 2);
  ctx.scale(height / 40, height / 40);
  ctx.fillStyle = badgePaint(ctx, AXIS_FILL[axis], 0, 0, 200, 40);
  roundRect(ctx, 0, 0, 200, 40, TYPE_BADGE.radius);
  ctx.fill();
  ctx.translate(100, 0);
  ctx.scale(fit.scaleX, 1);
  ctx.font = `${TYPE_BADGE.fontWeight} ${fit.fontSize}px ${typeBadgeFontStack()}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(localeUppercase(t(`favorites.axis.${axis}`)), 0, fit.baseline);
  ctx.restore();
}
