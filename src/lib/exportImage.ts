import type { Pokemon, TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';

const COLS = 10;
const TILE = 72;
const SPRITE = Math.round(TILE * 1.05); // slightly larger than tile, less overlap
const PAD_X = 16;
const PAD_TOP = 52;
const PAD_BOTTOM = 44;
const BG = '#ffffff';
const ROTATION = -30 * (Math.PI / 180); // match view page -rotate-[30deg]
const SCALE = 2; // 2x resolution for sharp export

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

/** Draw a type-colored pokeball behind a sprite tile, rotated to match view page. */
function drawPokeball(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  primary: string,
  secondary: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ROTATION);

  // Colored fills at reduced opacity
  ctx.globalAlpha = 0.33;

  // Top half — primary type
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = primary;
  ctx.fill();

  // Bottom half — secondary type
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = secondary;
  ctx.fill();

  ctx.globalAlpha = 1;

  // Gap strokes to cleanly separate halves (white to match background)
  ctx.strokeStyle = BG;
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.closePath();
  ctx.stroke();

  // Center button
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = BG;
  ctx.fill();
  ctx.strokeStyle = BG;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Divider line
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.strokeStyle = BG;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

/**
 * Render the user's Pokemon list as a sharp PNG image blob.
 * Mirrors the view page: 10-column grid, type-colored rotated pokeball
 * backgrounds, last row centered. No empty placeholders.
 * Rendered at 2x for crisp output.
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
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext('2d')!;

  // Scale everything by 2x for sharp rendering
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = false;

  // White background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // Header: title + count
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const headerY = PAD_TOP / 2;

  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#18181b'; // zinc-900
  const title = 'My Personal 151';
  const titleW = ctx.measureText(title).width;

  ctx.font = '600 14px system-ui, -apple-system, sans-serif';
  const countStr = `${count}/151`;
  const countW = ctx.measureText(countStr).width;

  const gap = 10;
  const totalTextW = titleW + gap + countW;
  const textStart = w / 2 - totalTextW / 2;

  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#18181b';
  ctx.textAlign = 'left';
  ctx.fillText(title, textStart, headerY);

  ctx.font = '600 14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#2563eb'; // blue-600 for contrast on white
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

  // Footer
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const footerY = PAD_TOP + totalRows * TILE + PAD_BOTTOM / 2;

  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#71717a'; // zinc-500
  ctx.fillText(`Build yours at ${siteUrl.replace(/^https?:\/\//, '')}`, w / 2, footerY - 8);

  ctx.font = '9px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#a1a1aa'; // zinc-400
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

/** Share via native share sheet (mobile gallery save) or fall back to file download. */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
