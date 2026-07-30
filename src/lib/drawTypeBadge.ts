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

/**
 * The canvas twin of `<TypeBadge>`.
 *
 * Both read their proportions from `typeBadgeGeometry.ts`, so the exported
 * poster and the screen cannot disagree about where the symbol sits or how big
 * the word is — the poster is a picture of the app, and a badge that is subtly
 * different in the PNG reads as a bug nobody can name.
 *
 * `glyph` is the white symbol from `/sprites/types/glyph/`, already decoded by
 * the caller. Canvas never triggers image or font loading of its own, so this
 * draws whatever the caller has resolved; a missing glyph degrades to the
 * coloured pill with its word, which is still readable.
 */
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
    // Contain-fit into the symbol box, matching the SVG's
    // preserveAspectRatio="xMidYMid meet" — the crops are not square.
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
  // The same measured fit the SVG uses, from the same module — so a long
  // Italian name is condensed identically in the poster and on screen.
  const fit = typeBadgeFit(label, typeLabels().map(localeUppercase));
  ctx.font = `${TYPE_BADGE.fontWeight} ${fit.fontSize * s}px ${typeBadgeFontStack()}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  // Alphabetic, then shifted — the same baseline placement the SVG does, and
  // for the same reason: 'middle' is the em-box middle, which is right for CJK
  // and visibly low for Latin. `fit.baseline` already carries the per-script
  // correction, so this stays a plain alphabetic draw.
  ctx.textBaseline = 'alphabetic';
  // Condensed about the text centre, the same way the SVG does it.
  const cx = x + TYPE_BADGE.textCenterX * s;
  ctx.translate(cx, 0);
  ctx.scale(fit.scaleX, 1);
  ctx.translate(-cx, 0);
  ctx.fillText(label, cx, y + fit.baseline * s);
  ctx.restore();
}
