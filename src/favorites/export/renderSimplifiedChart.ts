import { typeGlyphPath } from '@/data/type-ids';
import { TYPE_COLORS } from '@/data/type-colors';
import { drawTypeBadge } from '@/lib/drawTypeBadge';
import { EXPORT_SPRITE_PX } from '@/lib/exportPngShape';
import { t } from '@/i18n';
import { drawSprite } from '@/league/export/paint';
import { AXIS_FILL, GEN_FILL, generationLabel, type BadgeStops } from '../components/badgeStyle';
import { GEN_NUMBERS, TYPES18, cellKey } from '../model/cells';
import { badgePaint, drawWordBadge } from './badgePaint';
import { createFavoritesCanvas, drawBall, drawFavoritesCredit, encodeFavoritesCanvas, image } from './canvas';
import type { FavoritesExportCell, FavoritesSnapshot } from './snapshot';

// Nine types per row, one generation row, then four larger special favorites.
export const SIMPLIFIED_CHART_LAYOUT = {
  width: 1356, height: 1040, left: 48, column: 140,
  tileWidth: 128, tileHeight: 140, radius: 12, stroke: 3,
  typeTop: 104, typeColumns: 9, rowHeight: 176,
  generationTop: 480, specialTop: 688,
  specialWidth: 296, specialHeight: 248, specialBadgeHeight: 32,
};

/** Only the validated generation, type, special and overall pointer cells. */
export async function renderSimplifiedChart(snapshot: FavoritesSnapshot): Promise<Blob> {
  await document.fonts.ready;
  const urls = new Set([
    ...snapshot.summary.flatMap(cell => cell.mon ? [cell.mon.sprite] : []),
    ...TYPES18.map(typeGlyphPath),
  ]);
  const images = new Map(await Promise.all([...urls].map(async url => [url, await image(url)] as const)));
  const L = SIMPLIFIED_CHART_LAYOUT;
  const { canvas, ctx } = createFavoritesCanvas(L.width, L.height);
  const byKey = new Map(snapshot.summary.map(cell => [cell.key, cell]));
  function tile(entry: FavoritesExportCell, cx: number, top: number, fill: string | BadgeStops,
    width = L.tileWidth, height = L.tileHeight, size = EXPORT_SPRITE_PX, split = false) {
    const left = cx - width / 2;
    const badgeHeight = size === EXPORT_SPRITE_PX ? width / 5 : L.specialBadgeHeight;
    const edge = top + height;
    const paint = badgePaint(ctx, fill, left, edge - badgeHeight / 2, width, badgeHeight);
    // Bounds describe the outside ink, including the generation's gray guard.
    // Inset the open-U centerline so its sides meet the badge's outer tips.
    const inset = (L.stroke + (split ? 1 : 0)) / 2;
    const radius = L.radius - inset;
    const x = left + inset, y = top + inset, right = left + width - inset;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, edge);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.lineTo(right - radius, y);
    ctx.quadraticCurveTo(right, y, right, y + radius);
    ctx.lineTo(right, edge);
    ctx.lineCap = 'butt';
    if (split) {
      ctx.strokeStyle = '#d4d4d8';
      ctx.lineWidth = L.stroke + 1;
      ctx.stroke();
    }
    ctx.strokeStyle = paint;
    ctx.lineWidth = L.stroke;
    ctx.stroke();
    ctx.restore();
    const spriteTop = top + (size === EXPORT_SPRITE_PX ? 16 : 20);
    const cy = spriteTop + size / 2;
    if (entry.mon) drawSprite(ctx, images.get(entry.mon.sprite)!, cx, cy, size);
    else drawBall(ctx, entry.type === 'favorite' && entry.generation === 'favorite' ? 'master' : 'ultra', cx, cy);
    return { edge, badgeHeight, paint };
  }
  TYPES18.forEach((type, index) => {
    const cx = L.left + (index % L.typeColumns + 0.5) * L.column;
    const top = L.typeTop + Math.floor(index / L.typeColumns) * L.rowHeight;
    const box = tile(byKey.get(cellKey(type, 'favorite'))!, cx, top, TYPE_COLORS[type]);
    drawTypeBadge(ctx, type, images.get(typeGlyphPath(type))!, cx - L.tileWidth / 2,
      box.edge - box.badgeHeight / 2, box.badgeHeight);
  });
  GEN_NUMBERS.forEach((gen, index) => {
    const cx = L.left + (index + 0.5) * L.column;
    const box = tile(byKey.get(cellKey('favorite', gen))!, cx, L.generationTop, GEN_FILL[gen], L.tileWidth, L.tileHeight, EXPORT_SPRITE_PX, true);
    drawWordBadge(ctx, generationLabel(gen), box.paint, cx, box.edge, L.tileWidth, box.badgeHeight, true);
  });
  const special = [
    { key: cellKey('starter', 'favorite'), axis: 'starter' },
    { key: cellKey('legendary', 'legendary'), axis: 'legendary' },
    { key: cellKey('gimmick', 'gimmick'), axis: 'gimmick' },
    { key: cellKey('favorite', 'favorite'), axis: 'favorite' },
  ] as const;
  special.forEach(({ key, axis }, index) => {
    const cx = [206, 521, 836, 1151][index];
    const box = tile(byKey.get(key)!, cx, L.specialTop, AXIS_FILL[axis], L.specialWidth, L.specialHeight, EXPORT_SPRITE_PX * 2);
    drawWordBadge(ctx, t(`favorites.axis.${axis}`), box.paint, cx, box.edge, L.specialWidth, box.badgeHeight);
  });
  drawFavoritesCredit(ctx, L.width, L.height);
  return encodeFavoritesCanvas(canvas);
}
