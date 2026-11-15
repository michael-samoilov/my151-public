import { TYPE_COLORS } from '@/data/type-colors';
import { cardShades } from '@/league/theme';
import { DEX_EXPORT_FRAME_RED } from '@/lib/exportImage';
import { clipExportCanvas, exportInnerCornerRadius } from '@/lib/exportPngShape';
import { encodeCanvasPng } from '@/lib/encodeCanvas';
import type { TypeName } from '@/types/pokemon';

const W = 1500;
const H = 1120;
const FRAME = 24;
const LABEL_W = 230;
const PAD = 56;
const FONT = '"Inter Variable", system-ui, sans-serif';

export async function renderFoilTestCard(): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');

  clipExportCanvas(ctx, W, H);
  ctx.fillStyle = DEX_EXPORT_FRAME_RED;
  ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  ctx.roundRect(FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME, exportInnerCornerRadius(W, H, FRAME));
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = '#18181b';
  ctx.font = `700 44px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Foil test card', PAD, PAD + 44);

  const types = Object.keys(TYPE_COLORS) as TypeName[];
  const left = PAD + LABEL_W;
  const cellW = (W - PAD - left) / types.length;
  const rowH = 96;
  let y = PAD + 88;

  const label = (text: string) => {
    ctx.fillStyle = '#3f3f46';
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(text, PAD, y + rowH / 2 + 9);
  };

  label('Ink');
  types.forEach((t, i) => {
    ctx.fillStyle = TYPE_COLORS[t];
    ctx.fillRect(left + i * cellW + 3, y + 8, cellW - 6, rowH - 16);
  });
  y += rowH;

  label('Dex circle');
  types.forEach((t, i) => {
    ctx.save();
    ctx.globalAlpha = 0.33;
    ctx.fillStyle = TYPE_COLORS[t];
    ctx.beginPath();
    ctx.arc(left + (i + 0.5) * cellW, y + rowH / 2, Math.min(cellW, rowH) / 2 - 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  y += rowH;

  label('League row');
  types.forEach((t, i) => {
    ctx.fillStyle = cardShades(t).base;
    ctx.fillRect(left + i * cellW, y + 8, cellW, rowH - 16);
  });
  y += rowH;

  label('Gray');
  const grays = 12;
  const grayW = (W - PAD - left) / grays;
  for (let i = 0; i < grays; i++) {
    const v = Math.round((i / (grays - 1)) * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(left + i * grayW, y + 8, grayW, rowH - 16);
  }
  ctx.strokeStyle = '#d4d4d8';
  ctx.lineWidth = 2;
  ctx.strokeRect(left, y + 8, W - PAD - left, rowH - 16);
  y += rowH;

  label('Hue');
  const hue = ctx.createLinearGradient(left, 0, W - PAD, 0);
  for (let i = 0; i <= 12; i++) hue.addColorStop(i / 12, `hsl(${i * 30}, 100%, 50%)`);
  ctx.fillStyle = hue;
  ctx.fillRect(left, y + 8, W - PAD - left, rowH - 16);
  y += rowH;

  label('Pastel hue');
  const pastel = ctx.createLinearGradient(left, 0, W - PAD, 0);
  for (let i = 0; i <= 12; i++) pastel.addColorStop(i / 12, `hsl(${i * 30}, 100%, 92%)`);
  ctx.fillStyle = pastel;
  ctx.fillRect(left, y + 8, W - PAD - left, rowH - 16);
  y += rowH;

  label('Blocks');
  const blocks = ['#111111', '#777777', '#dddddd', '#ffffff'];
  const blockW = (W - PAD - left) / blocks.length;
  blocks.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(left + i * blockW + 4, y + 8, blockW - 8, rowH * 1.6);
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 2;
    ctx.strokeRect(left + i * blockW + 4, y + 8, blockW - 8, rowH * 1.6);
  });
  y += rowH * 1.6 + 24;

  label('Text');
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = '#18181b';
  ctx.fillText('The quick brown fox, 0123456789', left, y + rowH / 2 + 12);
  ctx.fillStyle = DEX_EXPORT_FRAME_RED;
  ctx.fillText('my151.app', left + 700, y + rowH / 2 + 12);

  return encodeCanvasPng(canvas, { failure: 'toBlob failed' });
}

export async function renderFoilFlatCard(shape: 'wide' | 'league' | 'tall' = 'wide'): Promise<Blob> {
  const [w, h] = shape === 'tall' ? [1100, 1800] : shape === 'league' ? [1260, 1700] : [W, H];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');

  clipExportCanvas(ctx, w, h);
  ctx.fillStyle = DEX_EXPORT_FRAME_RED;
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  ctx.roundRect(FRAME, FRAME, w - 2 * FRAME, h - 2 * FRAME, exportInnerCornerRadius(w, h, FRAME));
  ctx.fillStyle = '#777777';
  ctx.fill();

  return encodeCanvasPng(canvas, { failure: 'toBlob failed' });
}
