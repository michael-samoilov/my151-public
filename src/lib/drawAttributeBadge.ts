import type { ColorName, ShapeName } from '@/types/pokemon';
import { GEN_FILL, generationLabel, generationOutlined, generationWord } from '@/favorites/components/badgeStyle';
import type { GenNumber } from '@/favorites/model/cells';
import { badgePaint, drawWordBadge } from '@/favorites/export/badgePaint';
import { TYPE_BADGE, TYPE_BADGE_H, TYPE_BADGE_W, typeBadgeGlyphBox } from './typeBadgeGeometry';
import { typeBadgeFontStack } from './typeBadgeFit';
import { attributeBadgeLayout, COLOR_BADGE_FILLS, colorBadgeTextFill, type EvolutionRole } from './attributeBadgeStyle';

function drawAttributeBadge(ctx: CanvasRenderingContext2D, kind: 'color' | 'shape' | 'evolution', value: ColorName | ShapeName | EvolutionRole,
  glyph: HTMLImageElement | null, x: number, y: number, height: number): void {
  const scale = height / TYPE_BADGE_H;
  const { label, centerX, fit } = attributeBadgeLayout(kind, value);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = kind === 'color' ? COLOR_BADGE_FILLS[value as ColorName] : '#ffffff';
  ctx.strokeStyle = '#a3a3a3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(.5, .5, TYPE_BADGE_W - 1, TYPE_BADGE_H - 1, TYPE_BADGE.radius - .5);
  ctx.fill();
  if (kind !== 'color' || value === 'white') ctx.stroke();
  if (kind === 'evolution') {
    const filled = value === 'basic' ? 1 : value === 'intermediate' ? 2 : 3;
    ctx.strokeStyle = '#dc2626';
    ctx.fillStyle = '#dc2626';
    ctx.lineWidth = 1.5;
    for (const index of [0, 1, 2]) {
      if (value === 'standalone' && index !== 1) continue;
      ctx.beginPath();
      ctx.arc(18 + index * 14, TYPE_BADGE_H / 2, 4.5, 0, Math.PI * 2);
      if (value === 'standalone' || index < filled) ctx.fill();
      ctx.stroke();
    }
  }
  if (glyph) {
    const box = typeBadgeGlyphBox();
    const factor = Math.min(box.size / (glyph.naturalWidth || 1), box.size / (glyph.naturalHeight || 1));
    const width = glyph.naturalWidth * factor, glyphHeight = glyph.naturalHeight * factor;
    ctx.drawImage(glyph, box.x + (box.size - width) / 2, box.y + (box.size - glyphHeight) / 2, width, glyphHeight);
  }
  ctx.font = `${TYPE_BADGE.fontWeight} ${fit.fontSize}px ${typeBadgeFontStack()}`;
  ctx.fillStyle = kind === 'color' ? colorBadgeTextFill(value as ColorName) : '#171717';
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
  drawWordBadge(ctx, generationLabel(gen), badgePaint(ctx, GEN_FILL[gen], x, y, width, height), x + width / 2, y + height / 2, width, height,
    true, generationOutlined(gen), generationWord(gen));
}

export type { EvolutionRole } from './attributeBadgeStyle';
export function drawEvolutionBadge(ctx: CanvasRenderingContext2D, role: EvolutionRole, x: number, y: number, height: number): void {
  drawAttributeBadge(ctx, 'evolution', role, null, x, y, height);
}
