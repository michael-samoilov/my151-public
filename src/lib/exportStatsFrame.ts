import { BAR_H, BAR_TEXT_X, CREDIT_PX, FOOT, FRAME, TITLE_PX, TITLE_TRACK } from '@/league/export/layout';
import { fillTracked, font, trackedWidth } from '@/league/export/paint';
import { exportCornerRadius } from './exportPngShape';
import { drawExportCredit } from './exportCredit';

const PAD = 24;
const MAX_CANVAS_AREA = 16_000_000;

export async function composeStatsExport(
  main: Blob,
  naturalSize: { w: number; h: number },
  title: string,
  draw: (ctx: CanvasRenderingContext2D) => void,
  credit: { size?: number; bottomOffset?: number; prefix?: string } = {},
): Promise<Blob> {
  const url = URL.createObjectURL(main);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const picture = new Image();
      picture.onload = () => resolve(picture);
      picture.onerror = () => reject(new Error('Could not load export image'));
      picture.src = url;
    });
    const height = image.height;
    const scale = (height - BAR_H - FRAME - FOOT - PAD * 2) / naturalSize.h;
    if (!(scale > 0)) throw new Error('Export is too short for detailed stats');
    const panelWidth = Math.ceil(naturalSize.w * scale + 2 * (FRAME + PAD));
    const panelX = image.width - FRAME;
    const width = panelX + panelWidth;
    const outputScale = Math.min(1, Math.sqrt(MAX_CANVAS_AREA / (width * height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * outputScale);
    canvas.height = Math.round(height * outputScale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.scale(outputScale, outputScale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    ctx.save();
    ctx.translate(panelX, 0);
    const radius = exportCornerRadius(image.width, height);
    ctx.beginPath();
    ctx.roundRect(0, 0, panelWidth, height, radius);
    ctx.clip();
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(0, 0, panelWidth, height);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(FRAME, BAR_H, panelWidth - FRAME * 2, height - BAR_H - FRAME,
      [0, 0, Math.max(0, radius - FRAME), Math.max(0, radius - FRAME)]);
    ctx.fill();
    ctx.font = font(TITLE_PX, 800);
    const rail = FRAME + BAR_TEXT_X;
    const titleWidth = trackedWidth(ctx, title, TITLE_TRACK);
    const titleScale = titleWidth > 0 ? Math.min(1, (panelWidth - rail * 2) / titleWidth) : 1;
    ctx.font = font(TITLE_PX * titleScale, 800);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const cap = ctx.measureText('H').actualBoundingBoxAscent || TITLE_PX * titleScale * .72;
    fillTracked(ctx, title, rail, BAR_H / 2 + cap / 2, TITLE_TRACK * titleScale);
    ctx.save();
    ctx.translate(FRAME + PAD, BAR_H + PAD);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    draw(ctx);
    ctx.restore();
    drawExportCredit(ctx, panelWidth / 2, height - (credit.bottomOffset ?? FRAME + FOOT / 2), credit.size ?? CREDIT_PX, credit.prefix);
    ctx.restore();
    return await new Promise<Blob>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Canvas toBlob timed out')), 15000);
      canvas.toBlob(blob => {
        window.clearTimeout(timeout);
        if (blob) resolve(blob);
        else reject(new Error('PNG encoding failed'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
