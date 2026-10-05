import { COLOR_SWATCHES } from '@/data/classifications';
import type { ColorName, ShapeName } from '@/types/pokemon';
import { GEN_FILL, generationLabel } from '@/favorites/components/badgeStyle';
import type { GenNumber } from '@/favorites/model/cells';
import { badgePaint, drawWordBadge } from '@/favorites/export/badgePaint';
import { TYPE_BADGE, TYPE_BADGE_H, TYPE_BADGE_W, typeBadgeGlyphBox } from './typeBadgeGeometry';
import { typeBadgeFontStack } from './typeBadgeFit';
import { attributeBadgeLayout, colorBadgeText } from './attributeBadgeStyle';

function drawAttributeBadge(ctx: CanvasRenderingContext2D, kind: 'color' | 'shape', value: ColorName | ShapeName,
  glyph: HTMLImageElement | null, x: number, y: number, height: number): void {
  const scale = height / TYPE_BADGE_H;
  const { label, centerX, fit } = attributeBadgeLayout(kind, value);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = kind === 'color' ? COLOR_SWATCHES[value as ColorName] : '#ffffff';
  ctx.strokeStyle = '#a3a3a3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(.5, .5, TYPE_BADGE_W - 1, TYPE_BADGE_H - 1, TYPE_BADGE.radius - .5);
  ctx.fill();
  ctx.stroke();
  if (glyph) {
    const box = typeBadgeGlyphBox();
    const factor = Math.min(box.size / (glyph.naturalWidth || 1), box.size / (glyph.naturalHeight || 1));
    const width = glyph.naturalWidth * factor, glyphHeight = glyph.naturalHeight * factor;
    ctx.drawImage(glyph, box.x + (box.size - width) / 2, box.y + (box.size - glyphHeight) / 2, width, glyphHeight);
  }
  ctx.font = `${TYPE_BADGE.fontWeight} ${fit.fontSize}px ${typeBadgeFontStack()}`;
  ctx.fillStyle = kind === 'color' ? colorBadgeText(value as ColorName) : '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.translate(centerX, 0);
  ctx.scale(fit.scaleX, 1);
  ctx.fillText(label, 0, fit.baseline);
  ctx.restore();
}

export function drawColorBadge(ctx: CanvasRenderingContext2D, color: ColorName, x: number, y: number, height: number): void {
  drawAttributeBadge(ctx, 'color', color, null, x, y, height);
}

export function drawShapeBadge(ctx: CanvasRenderingContext2D, shape: ShapeName, glyph: HTMLImageElement | null,
  x: number, y: number, height: number): void {
  drawAttributeBadge(ctx, 'shape', shape, glyph, x, y, height);
}

export function drawGenerationBadge(ctx: CanvasRenderingContext2D, gen: GenNumber, x: number, y: number, height: number): void {
  const width = height * TYPE_BADGE_W / TYPE_BADGE_H;
  drawWordBadge(ctx, generationLabel(gen), badgePaint(ctx, GEN_FILL[gen], x, y, width, height), x + width / 2, y + height / 2, width, height, true);
}
