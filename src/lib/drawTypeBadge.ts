import type { TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeLabel } from '@/i18n';
import {
  TYPE_BADGE,
  TYPE_BADGE_H,
  TYPE_BADGE_W,
  typeBadgeBaseline,
  typeBadgeTextBox,
} from '@/lib/typeBadgeGeometry';

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
  glyph: HTMLImageElement | null,
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

  if (glyph) {
    // Contain-fit into the square glyph box, matching the SVG's
    // preserveAspectRatio="xMidYMid meet" — the crops are not square.
    const box = TYPE_BADGE.glyph * s;
    const iw = glyph.naturalWidth || 1;
    const ih = glyph.naturalHeight || 1;
    const fit = Math.min(box / iw, box / ih);
    const dw = iw * fit;
    const dh = ih * fit;
    ctx.drawImage(
      glyph,
      x + TYPE_BADGE.padX * s + (box - dw) / 2,
      y + (height - dh) / 2,
      dw,
      dh,
    );
  }

  const label = typeLabel(type);
  const size = TYPE_BADGE.fontSize * s;
  ctx.font = `${TYPE_BADGE.fontWeight} ${size}px 'Inter Variable', system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  // Alphabetic, then shifted — the same cap-height centring the SVG does, and
  // for the same reason: 'middle' is the em-box middle, which is right for CJK
  // and visibly low for Latin.
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x + typeBadgeTextBox().center * s, y + typeBadgeBaseline() * s);
  ctx.restore();
}
