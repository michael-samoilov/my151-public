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
const glyphShapes = new Map<TypeName, Path2D[]>();

/**
 * Fills a type's white glyph so that its shared 44-unit frame spans `frame`
 * pixels around (cx, cy). The paths come from the glyph SVGs, so each type
 * keeps its game size (see `scripts/type-icons/BUILD.md`).
 *
 * A path rather than the SVG file: the browser rasterizes an SVG image drawn
 * into a canvas, and exports from Samsung Internet and from Chrome on Windows
 * showed that glyph faint, or between two thin lines.
 */
export function fillTypeGlyph(
  ctx: CanvasRenderingContext2D,
  type: TypeName,
  cx: number,
  cy: number,
  frame: number,
): void {
  let shapes = glyphShapes.get(type);
  if (!shapes) {
    shapes = GLYPHS[type].map((d) => new Path2D(d));
    glyphShapes.set(type, shapes);
  }
  const unit = frame / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(unit, unit);
  ctx.fillStyle = '#ffffff';
  for (const shape of shapes) ctx.fill(shape);
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
