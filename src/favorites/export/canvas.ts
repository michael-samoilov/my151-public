import { ULTRA_BAND, MASTER_OUTLINE, MASTER_MARKS, type BallKind } from '../components/ballShape';
import { clipExportCanvas, exportInnerCornerRadius, EXPORT_FRAME_PX } from '@/lib/exportPngShape';
import { fillTracked, font } from '@/league/export/paint';
import { BAR_H, BAR_TEXT_X, CREDIT_PX, FOOT, FRAME, TITLE_PX, TITLE_TRACK } from '@/league/export/layout';
import { drawExportCredit } from '@/lib/exportCredit';
import { encodeCanvasPng } from '@/lib/encodeCanvas';
import { t } from '@/i18n';

export function image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load export image: ${url}`));
    img.src = url;
  });
}

export function drawBall(ctx: CanvasRenderingContext2D, kind: BallKind, cx: number, cy: number, size = 48) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 6);
  ctx.scale(size / 40, size / 40);
  ctx.translate(-20, -20);
  ctx.strokeStyle = 'rgba(10,10,10,0.14)';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.5;
  if (kind === 'master') ctx.stroke(new Path2D(MASTER_OUTLINE));
  else { ctx.beginPath(); ctx.arc(20, 20, 18, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(2, 20); ctx.lineTo(14, 20); ctx.moveTo(26, 20); ctx.lineTo(38, 20); ctx.stroke();
  ctx.beginPath(); ctx.arc(20, 20, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(20, 20, 2.5, 0, Math.PI * 2); ctx.fill();
  if (kind === 'ultra') ctx.stroke(new Path2D(ULTRA_BAND));
  if (kind === 'master') {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(new Path2D(MASTER_MARKS));
  }
  ctx.restore();
}

export function createFavoritesCanvas(width: number, height: number, title: string) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  clipExportCanvas(ctx, width, height);
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  const radius = exportInnerCornerRadius(width, height, EXPORT_FRAME_PX);
  ctx.beginPath();
  ctx.roundRect(EXPORT_FRAME_PX, BAR_H, width - 2 * EXPORT_FRAME_PX,
    height - BAR_H - EXPORT_FRAME_PX, [0, 0, radius, radius]);
  ctx.fill();
  ctx.font = font(TITLE_PX, 800);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText('H');
  const cap = metrics.actualBoundingBoxAscent || TITLE_PX * 0.72;
  fillTracked(ctx, title, FRAME + BAR_TEXT_X, BAR_H / 2 + cap / 2, TITLE_TRACK);
  return { canvas, ctx };
}

export function drawFavoritesCredit(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  drawExportCredit(ctx, width / 2, height - EXPORT_FRAME_PX - FOOT / 2, CREDIT_PX, t('tools.favorites'));
}

export function encodeFavoritesCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return encodeCanvasPng(canvas, { failure: 'PNG encoding failed' });
}
