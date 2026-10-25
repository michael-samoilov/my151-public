import { localeTypeLabels } from '@/components/shared/typeBadgeSvg';
import { localeUppercase } from '@/i18n';
import { TYPE_BADGE } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit, typeBadgeFontStack } from '@/lib/typeBadgeFit';
import { roundRect } from '@/league/export/paint';
import type { BadgeStops } from '../components/badgeStyle';

export function badgePaint(ctx: CanvasRenderingContext2D, fill: string | BadgeStops,
  x: number, y: number, width: number, height: number): string | CanvasGradient {
  if (typeof fill === 'string') return fill;
  const reach = (width + height) / 2;
  const gradient = ctx.createLinearGradient(x, y, x + reach, y + reach);
  for (const [offset, color] of fill) gradient.addColorStop(offset, color);
  return gradient;
}

export function drawWordBadge(ctx: CanvasRenderingContext2D, label: string,
  paint: string | CanvasGradient, cx: number, edgeY: number, width: number, height: number, split = false, outlined = false): void {
  const scale = height / 40;
  const units = width / scale;
  const spoken = localeUppercase(label);
  const fit = typeBadgeFit(spoken, localeTypeLabels(), units - 44);
  const left = cx - width / 2;
  const top = edgeY - height / 2;
  const inset = split ? scale / 2 : 0;
  ctx.save();
  ctx.fillStyle = paint;
  roundRect(ctx, left + inset, top + inset, width - 2 * inset, height - 2 * inset, TYPE_BADGE.radius * scale - inset);
  ctx.fill();
  if (split) {
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = scale;
    ctx.stroke();
  }
  if (outlined) {
    const outline = Math.max(fit.fontSize * (1.25 / 15) / 2, 0.6 / scale);
    const spread = outline * (1 - fit.scaleX);
    const x = Math.floor(left), y = Math.floor(top);
    const mask = document.createElement('canvas');
    mask.width = Math.ceil(left + width) - x;
    mask.height = Math.ceil(top + height) - y;
    const ink = mask.getContext('2d')!;
    ink.translate(left - x + width / 2, top - y);
    ink.scale(scale * fit.scaleX, scale);
    ink.font = `${TYPE_BADGE.fontWeight} ${fit.fontSize}px ${typeBadgeFontStack()}`;
    ink.textAlign = 'center';
    ink.textBaseline = 'alphabetic';
    ink.strokeStyle = '#000000';
    ink.lineWidth = 2 * outline;
    ink.lineJoin = 'round';
    for (const step of [-1, -0.5, 0, 0.5, 1]) ink.strokeText(spoken, step * spread / fit.scaleX, fit.baseline);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(mask, x, y);
    ctx.restore();
  }
  ctx.translate(cx, top);
  ctx.scale(scale * fit.scaleX, scale);
  ctx.font = `${TYPE_BADGE.fontWeight} ${fit.fontSize}px ${typeBadgeFontStack()}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(spoken, 0, fit.baseline);
  ctx.restore();
}
