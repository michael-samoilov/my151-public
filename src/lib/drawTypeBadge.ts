import type { TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import GLYPH_PATHS from '@/data/typeGlyphPaths.json';
import { typeLabel, typeLabels, localeUppercase } from '@/i18n';
import {
  TYPE_BADGE,
  TYPE_BADGE_H,
  TYPE_BADGE_W,
  typeBadgeGlyphBox,
} from '@/lib/typeBadgeGeometry';
import { typeBadgeFit, typeBadgeFontStack } from '@/lib/typeBadgeFit';

const GLYPHS: Record<TypeName, readonly string[]> = GLYPH_PATHS;

// platform: A canvas draws an SVG image faint on Samsung Internet and Chrome on Windows, and Chrome draws a reused Path2D with different edges.
export function fillTypeGlyph(
  ctx: CanvasRenderingContext2D,
  type: TypeName,
  cx: number,
  cy: number,
  frame: number,
): void {
  const unit = frame / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(unit, unit);
  ctx.fillStyle = '#ffffff';
  for (const d of GLYPHS[type]) ctx.fill(new Path2D(d));
  ctx.restore();
}

/** The colored type icon: the glyph's 44-unit frame centered on a 60-unit rounded square. */
export function drawTypeIcon(
  ctx: CanvasRenderingContext2D,
  type: TypeName,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.fillStyle = TYPE_COLORS[type];
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, (8 / 60) * size);
  ctx.fill();
  ctx.restore();
  fillTypeGlyph(ctx, type, x + size / 2, y + size / 2, (44 / 60) * size);
}

export function drawTypeBadge(
  ctx: CanvasRenderingContext2D,
  type: TypeName,
  x: number,
  y: number,
  height: number,
): void {
  const s = height / TYPE_BADGE_H;
  const w = TYPE_BADGE_W * s;

  ctx.save();
  ctx.fillStyle = TYPE_COLORS[type];
  ctx.beginPath();
  ctx.roundRect(x, y, w, height, TYPE_BADGE.radius * s);
  ctx.fill();

  const box = typeBadgeGlyphBox();
  fillTypeGlyph(ctx, type, x + (box.x + box.size / 2) * s, y + (box.y + box.size / 2) * s, box.size * s);

  const label = localeUppercase(typeLabel(type));
  const fit = typeBadgeFit(label, typeLabels().map(localeUppercase));
  ctx.font = `${TYPE_BADGE.fontWeight} ${fit.fontSize * s}px ${typeBadgeFontStack()}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const cx = x + TYPE_BADGE.textCenterX * s;
  ctx.translate(cx, 0);
  ctx.scale(fit.scaleX, 1);
  ctx.translate(-cx, 0);
  ctx.fillText(label, cx, y + fit.baseline * s);
  ctx.restore();
}
