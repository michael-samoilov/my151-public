import { ROMAN_URIS } from '../components/romanDiscAssets';
import { localeTypeLabels } from '@/components/shared/typeBadgeSvg';
import { typeGlyphPath, typeIconPath } from '@/data/type-ids';
import { TYPE_COLORS } from '@/data/type-colors';
import { localeUppercase, t } from '@/i18n';
import { drawTypeBadge } from '@/lib/drawTypeBadge';
import { clipExportCanvas, exportInnerCornerRadius, EXPORT_FRAME_PX, EXPORT_SPRITE_PX } from '@/lib/exportPngShape';
import { TYPE_BADGE } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit, typeBadgeFontStack } from '@/lib/typeBadgeFit';
import { drawEmptyBall, drawPokeballBg, drawSprite, font, roundRect } from '@/league/export/paint';
import { AXIS_FILL, type BadgeStops } from '../components/badgeStyle';
import favoriteIcon from '../icons/favorite.svg?url';
import gimmickIcon from '../icons/gimmick.svg?url';
import legendaryIcon from '../icons/legendary.svg?url';
import starterIcon from '../icons/starter.svg?url';
import { GEN_AXIS, TYPE_AXIS, isGenNumber, isTypeName, type ExtraTypeAxis } from '../model/cells';
import type { FavoritesSnapshot } from './snapshot';

// Native 96px sprites, with 12px breathing room on each side. The shared
// frame and corner geometry are the same as Dex and League PNGs.
export const FULL_CHART_CELL = EXPORT_SPRITE_PX + 24;
export const FULL_CHART_LAYOUT = {
  width: 2 * EXPORT_FRAME_PX + 48 + (TYPE_AXIS.length + 1) * FULL_CHART_CELL,
  height: 2 * EXPORT_FRAME_PX + 64 + 72 + (GEN_AXIS.length + 1) * FULL_CHART_CELL + 56,
  gridX: EXPORT_FRAME_PX + 24,
  gridY: EXPORT_FRAME_PX + 32 + 72,
};
const EXTRA_ICONS: Record<ExtraTypeAxis, string> = {
  favorite: favoriteIcon, gimmick: gimmickIcon, legendary: legendaryIcon, starter: starterIcon,
};

function image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load export image: ${url}`));
    img.src = url;
  });
}

/** No-symbol axis pills use the app's colors, font fitter and 200×40 units. */
function axisBadge(ctx: CanvasRenderingContext2D, axis: ExtraTypeAxis, x: number, y: number, width: number) {
  const fill: string | BadgeStops = AXIS_FILL[axis];
  const label = localeUppercase(t(`favorites.axis.${axis}`));
  const fit = typeBadgeFit(label, localeTypeLabels(), 156);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(width / 200, width / 200);
  if (typeof fill === 'string') ctx.fillStyle = fill;
  else {
    const gradient = ctx.createLinearGradient(0, 0, 120, 120);
    for (const [offset, color] of fill) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;
  }
  roundRect(ctx, 0, 0, 200, 40, TYPE_BADGE.radius);
  ctx.fill();
  ctx.translate(100, 0);
  ctx.scale(fit.scaleX, 1);
  ctx.font = `${TYPE_BADGE.fontWeight} ${fit.fontSize}px ${typeBadgeFontStack()}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, 0, fit.baseline);
  ctx.restore();
}

/** Paint a validated snapshot; empty and incomplete charts are valid exports. */
export async function renderFullChart(snapshot: FavoritesSnapshot): Promise<Blob> {
  await document.fonts.ready;
  const urls = new Set<string>([
    ...snapshot.cells.flatMap(cell => cell.mon ? [cell.mon.sprite] : []),
    ...TYPE_AXIS.flatMap(axis => isTypeName(axis) ? [typeIconPath(axis), typeGlyphPath(axis)] : [EXTRA_ICONS[axis]]),
    ...GEN_AXIS.filter(isGenNumber).map(gen => ROMAN_URIS[gen]),
  ]);
  const images = new Map(await Promise.all([...urls].map(async url => [url, await image(url)] as const)));
  const { width, height, gridX, gridY } = FULL_CHART_LAYOUT;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  clipExportCanvas(ctx, width, height);
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, EXPORT_FRAME_PX, EXPORT_FRAME_PX, width - 2 * EXPORT_FRAME_PX,
    height - 2 * EXPORT_FRAME_PX, exportInnerCornerRadius(width, height, EXPORT_FRAME_PX));
  ctx.fill();
  ctx.font = font(40, 700);
  ctx.fillStyle = '#18181b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('favorites.title'), width / 2, EXPORT_FRAME_PX + 58);

  const cell = FULL_CHART_CELL;
  const badgeW = cell * 0.9;
  const badgeY = gridY + cell * 0.76;
  TYPE_AXIS.forEach((axis, index) => {
    const x = gridX + (index + 1) * cell;
    const mark = images.get(isTypeName(axis) ? typeIconPath(axis) : EXTRA_ICONS[axis])!;
    ctx.drawImage(mark, x + 17, gridY + 3, 86, 86);
    if (isTypeName(axis)) drawTypeBadge(ctx, axis, images.get(typeGlyphPath(axis))!, x + 6, badgeY, badgeW / 5);
    else axisBadge(ctx, axis, x + 6, badgeY, badgeW);
  });
  GEN_AXIS.forEach((gen, index) => {
    const y = gridY + (index + 1) * cell;
    if (isGenNumber(gen)) ctx.drawImage(images.get(ROMAN_URIS[gen])!, gridX + 17, y + 17, 86, 86);
    else {
      ctx.drawImage(images.get(EXTRA_ICONS[gen])!, gridX + 17, y + 3, 86, 86);
      axisBadge(ctx, gen, gridX + 6, y + cell * 0.76, badgeW);
    }
  });
  snapshot.cells.forEach((entry, index) => {
    const col = index % TYPE_AXIS.length;
    const row = Math.floor(index / TYPE_AXIS.length);
    const x = gridX + (col + 1) * cell;
    const y = gridY + (row + 1) * cell;
    ctx.fillStyle = entry.kind === 'disabled' || entry.kind === 'null' ? '#fafafa' : '#ffffff';
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = '#e4e4e7';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    if (entry.mon) {
      drawPokeballBg(ctx, TYPE_COLORS[entry.mon.types[0]], entry.mon.types[1] ? TYPE_COLORS[entry.mon.types[1]] : '#ffffff',
        EXPORT_SPRITE_PX * 0.84, x + cell / 2, y + cell / 2);
      drawSprite(ctx, images.get(entry.mon.sprite)!, x + cell / 2, y + cell / 2, EXPORT_SPRITE_PX);
    } else if (entry.kind === 'pick' || entry.kind === 'pointer') drawEmptyBall(ctx, 48, x + cell / 2, y + cell / 2);
    else {
      ctx.font = font(24, 500);
      ctx.fillStyle = '#a1a1aa';
      ctx.fillText('—', x + cell / 2, y + cell / 2);
    }
  });
  ctx.font = font(20, 500);
  ctx.fillStyle = '#71717a';
  const footer = gridY + (GEN_AXIS.length + 1) * cell + 32;
  ctx.fillText(`${t('favorites.completion.label', snapshot.completion)} · my151.app`, width / 2, footer);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
}
