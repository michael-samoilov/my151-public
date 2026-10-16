import type { TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeLabel, typeLabels, localeUppercase } from '@/i18n';
import {
  TYPE_BADGE,
  TYPE_BADGE_H,
  TYPE_BADGE_W,
  typeBadgeGlyphBox,
} from '@/lib/typeBadgeGeometry';
import { typeBadgeFit, typeBadgeFontStack } from '@/lib/typeBadgeFit';

export function drawTypeBadge(
  ctx: CanvasRenderingContext2D,
  type: TypeName,
  glyphImage: HTMLImageElement | null,
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

  if (glyphImage) {
    const box = typeBadgeGlyphBox();
    const side = box.size * s;
    const iw = glyphImage.naturalWidth || 1;
    const ih = glyphImage.naturalHeight || 1;
    const fit = Math.min(side / iw, side / ih);
    const dw = iw * fit;
    const dh = ih * fit;
    ctx.drawImage(
      glyphImage,
      x + box.x * s + (side - dw) / 2,
      y + box.y * s + (side - dh) / 2,
      dw,
      dh,
    );
  }

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
