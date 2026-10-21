import { TYPE_COLORS } from '@/data/type-colors';
import { drawTypeBadge } from '@/lib/drawTypeBadge';
import { EXPORT_SPRITE_PX } from '@/lib/exportPngShape';
import { t } from '@/i18n';
import { drawSprite, roundRect } from '@/league/export/paint';
import { AXIS_FILL, GEN_FILL, type BadgeStops } from '../components/badgeStyle';
import { ROMAN_URIS } from '../components/romanDiscAssets';
import { GEN_NUMBERS, TYPES18, cellKey } from '../model/cells';
import { badgePaint, drawWordBadge } from './badgePaint';
import { pickerSpriteSrc } from '../model/spritePreload';
import { createFavoritesCanvas, drawBall, drawFavoritesCredit, encodeFavoritesCanvas, image } from './canvas';
import { drawFavoriteLaurels, drawFavoriteCrown, FAVORITE_ORNAMENTS } from './laurelPaint';
import type { FavoritesExportCell, FavoritesSnapshot } from './snapshot';

const SIMPLIFIED_CHART_LAYOUT = {
  width: 1356, height: 1040, left: 48, column: 140,
  tileWidth: 128, tileHeight: 140, radius: 12, stroke: 3,
  typeTop: 308, typeColumns: 9, rowHeight: 176,
  generationTop: 104, generationCircle: 40,
  supportWidth: 224, supportHeight: 164, supportBadgeHeight: 25.6,
  favoriteWidth: 360, favoriteHeight: 264, favoriteBadgeHeight: 32,
  supportTops: [708, 759.6, 811.2], favoriteTop: 708,
};

export async function renderSimplifiedChart(snapshot: FavoritesSnapshot): Promise<Blob> {
  await document.fonts.ready;
  const urls = new Set([
    ...snapshot.summary.flatMap(cell => cell.mon ? [cell.mon.sprite] : []),
    ...GEN_NUMBERS.map(gen => ROMAN_URIS[gen]),
    FAVORITE_ORNAMENTS.leaf, FAVORITE_ORNAMENTS.crown,
  ]);
  const images = new Map(await Promise.all([...urls].map(async url => [url, await image(pickerSpriteSrc(url))] as const)));
  const L = SIMPLIFIED_CHART_LAYOUT;
  const { canvas, ctx } = createFavoritesCanvas(L.width, L.height, t('favorites.export.summaryTitle'));
  const byKey = new Map(snapshot.summary.map(cell => [cell.key, cell]));
  function tile(entry: FavoritesExportCell, cx: number, top: number, fill: string | BadgeStops,
    width = L.tileWidth, height = L.tileHeight, size = EXPORT_SPRITE_PX, split = false, special = false, fixedBadgeHeight?: number) {
    const left = cx - width / 2;
    const badgeHeight = fixedBadgeHeight ?? width / 5;
    const edge = top + height;
    const paint = split ? badgePaint(ctx, fill, left, top, width, height)
      : badgePaint(ctx, fill, left, edge - badgeHeight / 2, width, badgeHeight);
    const inset = (L.stroke + (split ? 1 : 0)) / 2;
    const radius = L.radius - inset;
    const x = left + inset, y = top + inset, right = left + width - inset;
    ctx.save();
    if (split) roundRect(ctx, x, y, width - 2 * inset, height - 2 * inset, radius);
    else {
      ctx.beginPath();
      ctx.moveTo(x, edge);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.lineTo(right - radius, y);
      ctx.quadraticCurveTo(right, y, right, y + radius);
      ctx.lineTo(right, edge);
    }
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
    const spriteTop = special ? Math.round(top + (height - badgeHeight / 2 - size) / 2) : top + 16;
    const cy = spriteTop + size / 2;
    if (entry.mon) drawSprite(ctx, images.get(entry.mon.sprite)!, cx, cy, size);
    else {
      const ultimate = entry.type === 'favorite' && entry.generation === 'favorite';
      drawBall(ctx, ultimate ? 'master' : 'ultra', cx, cy, ultimate ? 96 : 48);
    }
    return { edge, badgeHeight, paint };
  }
  GEN_NUMBERS.forEach((gen, index) => {
    const cx = L.left + (index + 0.5) * L.column;
    const box = tile(byKey.get(cellKey('favorite', gen))!, cx, L.generationTop, GEN_FILL[gen], L.tileWidth, L.tileHeight, EXPORT_SPRITE_PX, true);
    ctx.drawImage(images.get(ROMAN_URIS[gen])!, cx - L.generationCircle / 2,
      box.edge - L.generationCircle / 2, L.generationCircle, L.generationCircle);
  });
  TYPES18.forEach((type, index) => {
    const cx = L.left + (index % L.typeColumns + 0.5) * L.column;
    const top = L.typeTop + Math.floor(index / L.typeColumns) * L.rowHeight;
    const box = tile(byKey.get(cellKey(type, 'favorite'))!, cx, top, TYPE_COLORS[type]);
    drawTypeBadge(ctx, type, cx - L.tileWidth / 2, box.edge - box.badgeHeight / 2, box.badgeHeight);
  });
  const special = [
    { key: cellKey('starter', 'favorite'), axis: 'starter' },
    { key: cellKey('legendary', 'legendary'), axis: 'legendary' },
    { key: cellKey('gimmick', 'gimmick'), axis: 'gimmick' },
    { key: cellKey('favorite', 'favorite'), axis: 'favorite' },
  ] as const;
  special.forEach(({ key, axis }, index) => {
    const favorite = axis === 'favorite';
    const cx = [166, 402, 638, 1053][index];
    const width = favorite ? L.favoriteWidth : L.supportWidth;
    const height = favorite ? L.favoriteHeight : L.supportHeight;
    const badgeHeight = favorite ? L.favoriteBadgeHeight : L.supportBadgeHeight;
    const top = favorite ? L.favoriteTop : L.supportTops[index];
    const box = tile(byKey.get(key)!, cx, top, AXIS_FILL[axis], width, height,
      EXPORT_SPRITE_PX * (favorite ? 2 : 1), false, true, badgeHeight);
    if (favorite) drawFavoriteLaurels(ctx, images.get(FAVORITE_ORNAMENTS.leaf)!);
    drawWordBadge(ctx, t(`favorites.axis.${axis}`), box.paint, cx, box.edge, width, badgeHeight);
  });
  drawFavoriteCrown(ctx, images.get(FAVORITE_ORNAMENTS.crown)!);
  drawFavoritesCredit(ctx, L.width, L.height);
  return encodeFavoritesCanvas(canvas);
}
