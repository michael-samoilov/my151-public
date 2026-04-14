import type { Pokemon, TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';

const COLS = 10;
const TILE = 72;
const SPRITE = Math.round(TILE * 1.2); // match view page 1.2x scale
const PAD_X = 16;
const PAD_TOP = 52;
const PAD_BOTTOM = 44;
const BG = '#18181b'; // zinc-900

/** Load an image by URL, returns a promise. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Draw a type-colored pokeball behind a sprite tile. */
function drawPokeball(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  primary: string,
  secondary: string,
) {
  ctx.save();
  ctx.globalAlpha = 0.33;

  // Top half — primary type
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = primary;
  ctx.fill();

  // Bottom half — secondary type
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = secondary;
  ctx.fill();
  ctx.restore();

  // Gap strokes to separate halves
  ctx.strokeStyle = BG;
  ctx.lineWidth = 2.5;

  // Top half outline
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.closePath();
  ctx.stroke();

  // Bottom half outline
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI);
  ctx.closePath();
  ctx.stroke();

  // Center button
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = BG;
  ctx.fill();
  ctx.strokeStyle = BG;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Divider line
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.strokeStyle = BG;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

/**
 * Render the user's Pokemon list as a PNG image blob.
 * Mirrors the view page grid: 10-column layout, type-colored pokeball
 * backgrounds, last row centered. No empty placeholders.
 */
export async function generateExportImage(
  pokemon: Pokemon[],
  siteUrl: string,
  year: number,
): Promise<Blob> {
  const count = pokemon.length;
  if (count === 0) throw new Error('No Pokemon to export');

  const fullRows = Math.floor(count / COLS);
  const lastRowCount = count % COLS;
  const totalRows = fullRows + (lastRowCount > 0 ? 1 : 0);

  const gridW = COLS * TILE;
  const w = gridW + PAD_X * 2;
  const h = PAD_TOP + totalRows * TILE + PAD_BOTTOM;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // Header: title + count
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const headerY = PAD_TOP / 2;

  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  const title = 'My Personal 151';
  const titleW = ctx.measureText(title).width;

  ctx.font = '600 14px system-ui, -apple-system, sans-serif';
  const countStr = `${count}/151`;
  const countW = ctx.measureText(countStr).width;

  const gap = 10;
  const totalTextW = titleW + gap + countW;
  const textStart = w / 2 - totalTextW / 2;

  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(title, textStart, headerY);

  ctx.font = '600 14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#3b82f6';
  ctx.fillText(countStr, textStart + titleW + gap, headerY);

  // Load all sprites in parallel
  const sprites = await Promise.all(
    pokemon.map((p) => loadImage(p.sprite).catch(() => null)),
  );

  // Draw full rows (left-aligned in grid)
  for (let i = 0; i < fullRows * COLS; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD_X + col * TILE;
    const y = PAD_TOP + row * TILE;
    drawTile(ctx, x, y, pokemon[i], sprites[i]);
  }

  // Draw last partial row (centered)
  if (lastRowCount > 0) {
    const lastRowW = lastRowCount * TILE;
    const lastRowX = (w - lastRowW) / 2;
    for (let i = 0; i < lastRowCount; i++) {
      const idx = fullRows * COLS + i;
      const x = lastRowX + i * TILE;
      const y = PAD_TOP + fullRows * TILE;
      drawTile(ctx, x, y, pokemon[idx], sprites[idx]);
    }
  }

  // Footer: URL + copyright
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const footerY = PAD_TOP + totalRows * TILE + PAD_BOTTOM / 2;

  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#71717a'; // zinc-500
  ctx.fillText(`Build yours at ${siteUrl.replace(/^https?:\/\//, '')}`, w / 2, footerY - 8);

  ctx.font = '9px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#52525b'; // zinc-600
  ctx.fillText(
    `Pokémon © 1995\u2013${year} Nintendo / Game Freak / Creatures`,
    w / 2,
    footerY + 8,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pokemon: Pokemon,
  sprite: HTMLImageElement | null,
) {
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  const r = TILE * 0.42;
  const primary = TYPE_COLORS[pokemon.types[0] as TypeName];
  const secondary = TYPE_COLORS[(pokemon.types[1] ?? pokemon.types[0]) as TypeName];

  drawPokeball(ctx, cx, cy, r, primary, secondary);

  if (sprite) {
    const sx = cx - SPRITE / 2;
    const sy = cy - SPRITE / 2;
    ctx.drawImage(sprite, sx, sy, SPRITE, SPRITE);
  }
}

/** Trigger a file download from a blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
