import { typeIconPath } from '@/data/type-ids';
import { t, typeLabel } from '@/i18n';
import { ROMAN_URIS } from '../components/romanDiscAssets';
import { EXPORT_FRAME_PX, EXPORT_SPRITE_PX } from '@/lib/exportPngShape';
import { drawSprite, font } from '@/league/export/paint';
import { GEN_NUMBERS, TYPES18, cellKey } from '../model/cells';
import { createFavoritesCanvas, drawBall, encodeFavoritesCanvas, image } from './canvas';
import type { FavoritesExportCell, FavoritesSnapshot } from './snapshot';

// Open portrait: types above generations, then four special favorites.
// Keep layout geometry separate from snapshot selection,
// so a chosen summary arrangement does not change saved picks or pointer rules.
export const SIMPLIFIED_CHART_LAYOUT = {
  width: 1176, height: 1164, headerHeight: 96, left: 48,
  typeTop: 128, typeColumns: 6, typeStep: 180, rowHeight: 180,
  generationTop: 708, generationStep: 120, specialTop: 900,
};

/** Only the validated generation, type, special and overall pointer cells. */
export async function renderSimplifiedChart(snapshot: FavoritesSnapshot): Promise<Blob> {
  await document.fonts.ready;
  const urls = new Set([
    ...snapshot.summary.flatMap(cell => cell.mon ? [cell.mon.sprite] : []),
    ...TYPES18.map(typeIconPath),
    ...GEN_NUMBERS.map(gen => ROMAN_URIS[gen]),
  ]);
  const images = new Map(await Promise.all([...urls].map(async url => [url, await image(url)] as const)));
  const L = SIMPLIFIED_CHART_LAYOUT;
  const { canvas, ctx } = createFavoritesCanvas(L.width, L.height, L.headerHeight, L.left);
  ctx.textAlign = 'center';
  const byKey = new Map(snapshot.summary.map(cell => [cell.key, cell]));
  function pick(entry: FavoritesExportCell, cx: number, cy: number) {
    if (entry.mon) drawSprite(ctx, images.get(entry.mon.sprite)!, cx, cy, EXPORT_SPRITE_PX);
    else drawBall(ctx, entry.type === 'favorite' && entry.generation === 'favorite' ? 'master' : 'ultra', cx, cy);
  }
  TYPES18.forEach((type, index) => {
    const cx = L.left + (index % L.typeColumns + 0.5) * L.typeStep;
    const top = L.typeTop + Math.floor(index / L.typeColumns) * L.rowHeight;
    ctx.drawImage(images.get(typeIconPath(type))!, cx - 20, top, 40, 40);
    ctx.font = font(28, 500);
    ctx.fillStyle = '#18181b';
    ctx.fillText(typeLabel(type), cx, top + 58);
    pick(byKey.get(cellKey(type, 'favorite'))!, cx, top + 126);
  });
  ctx.font = font(28, 600);
  ctx.fillStyle = '#18181b';
  GEN_NUMBERS.forEach((gen, index) => {
    const cx = L.left + (index + 0.5) * L.generationStep;
    ctx.drawImage(images.get(ROMAN_URIS[gen])!, cx - 20, L.generationTop, 40, 40);
    pick(byKey.get(cellKey('favorite', gen))!, cx, L.generationTop + 96);
  });
  const special = [cellKey('starter', 'favorite'), cellKey('legendary', 'legendary'),
    cellKey('gimmick', 'gimmick'), cellKey('favorite', 'favorite')];
  special.forEach((key, index) => {
    const entry = byKey.get(key)!;
    const cx = L.left + (index + 0.5) * (L.width - 2 * L.left) / special.length;
    ctx.fillText(t(`favorites.axis.${(['starter', 'legendary', 'gimmick', 'favorite'] as const)[index]}`), cx, L.specialTop);
    pick(entry, cx, L.specialTop + 76);
  });
  ctx.font = font(20, 500);
  ctx.fillStyle = '#71717a';
  ctx.fillText('my151.app', L.width / 2, L.height - EXPORT_FRAME_PX - 32);
  return encodeFavoritesCanvas(canvas);
}
