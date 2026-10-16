import { raw } from '@/i18n';
import { expandTemplate } from './richTemplate';
import { font } from '@/league/export/paint';

export function drawExportCredit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  prefix?: string,
): void {
  const segs = [
    ...(prefix ? [{ text: `${prefix} · `, color: '#737373' }] : []),
    ...expandTemplate<{ text: string; color: string }>(
      raw('poster.credit'),
      text => ({ text, color: '#a1a1aa' }),
      { app: () => [{ text: 'my151', color: '#DC2626' }, { text: '.app', color: '#0a0a0a' }] },
    ),
  ];
  ctx.save();
  ctx.font = font(size, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const total = segs.reduce((sum, seg) => sum + ctx.measureText(seg.text).width, 0);
  let x = cx - total / 2;
  for (const seg of segs) {
    ctx.fillStyle = seg.color;
    ctx.fillText(seg.text, x, cy);
    x += ctx.measureText(seg.text).width;
  }
  ctx.restore();
}
