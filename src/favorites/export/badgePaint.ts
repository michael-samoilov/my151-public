import { localeTypeLabels } from '@/components/shared/typeBadgeSvg';
import { localeUppercase } from '@/i18n';
import { TYPE_BADGE } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit, typeBadgeFontStack, typeBadgeTextWidth } from '@/lib/typeBadgeFit';
import { roundRect } from '@/league/export/paint';
import type { BadgeStops, GenerationWord } from '../components/badgeStyle';

export function badgePaint(ctx: CanvasRenderingContext2D, fill: string | BadgeStops,
  x: number, y: number, width: number, height: number): string | CanvasGradient {
  if (typeof fill === 'string') return fill;
  const reach = (width + height) / 2;
  const gradient = ctx.createLinearGradient(x, y, x + reach, y + reach);
  for (const [offset, color] of fill) gradient.addColorStop(offset, color);
  return gradient;
}

type Fit = ReturnType<typeof typeBadgeFit>;

// Draws the word centred on `x`, in badge units, with the condense applied.
function paintWord(c: CanvasRenderingContext2D, spoken: string, numeral: GenerationWord | undefined, fit: Fit, x: number, stroke: boolean): void {
  const text = (content: string, at: number) => stroke ? c.strokeText(content, at, fit.baseline) : c.fillText(content, at, fit.baseline);
  c.font = `${TYPE_BADGE.fontWeight} ${fit.fontSize}px ${typeBadgeFontStack()}`;
  c.textBaseline = 'alphabetic';
  if (!numeral) {
    c.textAlign = 'center';
    text(spoken, x);
    return;
  }
  const before = typeBadgeTextWidth(numeral.before, fit.fontSize);
  const total = before + numeral.width * fit.fontSize + typeBadgeTextWidth(numeral.after, fit.fontSize);
  const start = x - total / 2;
  c.textAlign = 'left';
  if (numeral.before) text(numeral.before, start);
  c.textAlign = 'right';
  if (numeral.after) text(numeral.after, start + total);
  const k = numeral.scale * fit.fontSize;
  c.save();
  c.translate(start + before, fit.baseline);
  c.scale(k, k);
  c.lineWidth /= k;
  for (const glyph of numeral.numeral) {
    const path = new Path2D();
    path.addPath(new Path2D(glyph.d), new DOMMatrix([1, 0, 0, 1, glyph.x, 0]));
    if (stroke) c.stroke(path);
    else c.fill(path);
  }
  c.restore();
}

export function drawWordBadge(ctx: CanvasRenderingContext2D, label: string,
  paint: string | CanvasGradient, cx: number, edgeY: number, width: number, height: number,
  split = false, outlined = false, numeral?: GenerationWord): void {
  const scale = height / 40;
  const units = width / scale;
  const spoken = localeUppercase(label);
  const fit = numeral
    ? typeBadgeFit(numeral.before + numeral.after, localeTypeLabels(), units - 44, numeral.width)
    : typeBadgeFit(spoken, localeTypeLabels(), units - 44);
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
    ink.strokeStyle = '#000000';
    ink.lineWidth = 2 * outline;
    ink.lineJoin = 'round';
    for (const step of [-1, -0.5, 0, 0.5, 1]) paintWord(ink, spoken, numeral, fit, step * spread / fit.scaleX, true);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(mask, x, y);
    ctx.restore();
  }
  ctx.translate(cx, top);
  ctx.scale(scale * fit.scaleX, scale);
  ctx.fillStyle = '#ffffff';
  paintWord(ctx, spoken, numeral, fit, 0, false);
  ctx.restore();
}
