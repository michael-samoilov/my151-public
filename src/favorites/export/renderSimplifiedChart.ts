import { typeGlyphPath } from '@/data/type-ids';
import { TYPE_COLORS } from '@/data/type-colors';
import { drawTypeBadge } from '@/lib/drawTypeBadge';
import { EXPORT_SPRITE_PX } from '@/lib/exportPngShape';
import { drawSprite, roundRect } from '@/league/export/paint';
import { AXIS_FILL, GEN_FILL, type BadgeStops } from '../components/badgeStyle';
import { ROMAN_URIS } from '../components/romanDiscAssets';
import { GEN_NUMBERS, TYPES18, cellKey } from '../model/cells';
import { badgePaint, drawAxisBadge } from './badgePaint';
import { createFavoritesCanvas, drawBall, drawFavoritesCredit, encodeFavoritesCanvas, image } from './canvas';
import type { FavoritesExportCell, FavoritesSnapshot } from './snapshot';

// C: nine types per row, one generation row, then the four special favorites.
// Every sprite stays native size, above a badge centered on its frame edge.
export const SIMPLIFIED_CHART_LAYOUT = {
  width: 1356, height: 912, left: 48, column: 140,
  tileWidth: 128, tileHeight: 140, radius: 12, stroke: 3,
  typeTop: 104, typeColumns: 9, rowHeight: 176, badgeHeight: 24,
  generationTop: 480, generationBadge: 40, specialTop: 688,
};

/** Only the validated generation, type, special and overall pointer cells. */
export async function renderSimplifiedChart(snapshot: FavoritesSnapshot): Promise<Blob> {
  await document.fonts.ready;
  const urls = new Set([
    ...snapshot.summary.flatMap(cell => cell.mon ? [cell.mon.sprite] : []),
    ...TYPES18.map(typeGlyphPath),
    ...GEN_NUMBERS.map(gen => ROMAN_URIS[gen]),
  ]);
  const images = new Map(await Promise.all([...urls].map(async url => [url, await image(url)] as const)));
  const L = SIMPLIFIED_CHART_LAYOUT;
  const { canvas, ctx } = createFavoritesCanvas(L.width, L.height);
  const byKey = new Map(snapshot.summary.map(cell => [cell.key, cell]));
  function tile(entry: FavoritesExportCell, cx: number, top: number, fill: string | BadgeStops, split = false) {
    const left = cx - L.tileWidth / 2;
    ctx.fillStyle = '#ffffff';
    const inset = L.stroke / 2;
    roundRect(ctx, left + inset, top + inset, L.tileWidth - L.stroke, L.tileHeight - L.stroke, L.radius);
    ctx.fill();
    if (split) {
      ctx.strokeStyle = '#d4d4d8';
      ctx.lineWidth = L.stroke + 1;
      ctx.stroke();
    }
    ctx.strokeStyle = badgePaint(ctx, fill, left, top, L.tileWidth, L.tileHeight);
    ctx.lineWidth = L.stroke;
    ctx.stroke();
    const cy = top + 64;
    if (entry.mon) drawSprite(ctx, images.get(entry.mon.sprite)!, cx, cy, EXPORT_SPRITE_PX);
    else drawBall(ctx, entry.type === 'favorite' && entry.generation === 'favorite' ? 'master' : 'ultra', cx, cy);
  }
  TYPES18.forEach((type, index) => {
    const cx = L.left + (index % L.typeColumns + 0.5) * L.column;
    const top = L.typeTop + Math.floor(index / L.typeColumns) * L.rowHeight;
    tile(byKey.get(cellKey(type, 'favorite'))!, cx, top, TYPE_COLORS[type]);
    drawTypeBadge(ctx, type, images.get(typeGlyphPath(type))!, cx - L.badgeHeight * 2.5,
      top + L.tileHeight - L.badgeHeight / 2, L.badgeHeight);
  });
  GEN_NUMBERS.forEach((gen, index) => {
    const cx = L.left + (index + 0.5) * L.column;
    tile(byKey.get(cellKey('favorite', gen))!, cx, L.generationTop, GEN_FILL[gen], true);
    ctx.drawImage(images.get(ROMAN_URIS[gen])!, cx - L.generationBadge / 2,
      L.generationTop + L.tileHeight - L.generationBadge / 2, L.generationBadge, L.generationBadge);
  });
  const special = [
    { key: cellKey('starter', 'favorite'), axis: 'starter' },
    { key: cellKey('legendary', 'legendary'), axis: 'legendary' },
    { key: cellKey('gimmick', 'gimmick'), axis: 'gimmick' },
    { key: cellKey('favorite', 'favorite'), axis: 'favorite' },
  ] as const;
  special.forEach(({ key, axis }, index) => {
    const cx = Math.round(L.left + (index + 0.5) * (L.width - 2 * L.left) / special.length);
    tile(byKey.get(key)!, cx, L.specialTop, AXIS_FILL[axis]);
    drawAxisBadge(ctx, axis, cx, L.specialTop + L.tileHeight, L.badgeHeight);
  });
  drawFavoritesCredit(ctx, L.width, L.height);
  return encodeFavoritesCanvas(canvas);
}
