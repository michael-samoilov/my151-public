import confetti from 'canvas-confetti';
import { TYPE_COLORS } from '@/data/type-colors';
import GLYPH_PATHS from '@/data/typeGlyphPaths.json';
import { TYPE_NAMES, type TypeName } from '@/types/pokemon';

const BURST = { particleCount: 60, spread: 65, startVelocity: 28, origin: { x: 0.5, y: 0.35 }, ticks: 160, zIndex: 300 };
const PLAIN_PIECES = { colors: ['#dc2626', '#7ac74c', '#ee8130', '#6390f0', '#f7d02c'], scalar: 0.9 };

const FRAME_PX = 22.5;
const EDGE_PX = 1.5;
const PAD = 1.5;
const SUPERSAMPLE = 2;

const GLYPHS: Record<TypeName, readonly string[]> = GLYPH_PATHS;

/**
 * One bitmap piece per type. canvas-confetti fills a square of side
 * `bitmap.width * scalar` around each piece and maps the bitmap into it
 * through `matrix`. With `scalar = 1 / SUPERSAMPLE` and a matrix that only
 * centers the bitmap, that square is the sticker's own box.
 */
async function stickerShapes(dpr: number): Promise<Map<TypeName, confetti.BitmapShape>> {
  const framePx = FRAME_PX * dpr * SUPERSAMPLE;
  const side = Math.ceil(framePx * PAD);
  const unit = framePx / 100;
  const center = new DOMMatrix([1, 0, 0, 1, -side / 2, -side / 2]);
  const entries = await Promise.all(TYPE_NAMES.map(async (type) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(side / 2, side / 2);
    ctx.scale(unit, unit);
    const shapes = GLYPHS[type].map((d) => new Path2D(d));
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = (2 * EDGE_PX * dpr * SUPERSAMPLE) / unit;
    for (const shape of shapes) ctx.stroke(shape);
    ctx.fillStyle = TYPE_COLORS[type];
    for (const shape of shapes) ctx.fill(shape);
    const bitmap = await createImageBitmap(canvas);
    const shape: confetti.BitmapShape = { type: 'bitmap', bitmap, matrix: center };
    return [type, shape] as const;
  }));
  return new Map(entries);
}

function evenMix(count: number): Map<TypeName, number> {
  const n = TYPE_NAMES.length;
  const base = Math.floor(count / n);
  const extra = count % n;
  const start = Math.floor(Math.random() * n);
  return new Map(TYPE_NAMES.map((type, i) => [type, base + ((i - start + n) % n < extra ? 1 : 0)]));
}

/**
 * Fires the burst on a full-screen canvas of its own, and removes the canvas
 * when the last piece has faded. Browsers without `OffscreenCanvas` (Safari
 * before 16.4) cannot draw bitmap pieces, so they get the plain pieces.
 */
export async function burstTypeStickers(): Promise<void> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
    await confetti({ ...BURST, ...PLAIN_PIECES });
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const shapes = await stickerShapes(dpr);
  const { clientWidth: width, clientHeight: height } = document.documentElement;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.dataset.testid = 'completion-confetti';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', top: '0px', left: '0px', width: `${width}px`, height: `${height}px`,
    pointerEvents: 'none', zIndex: String(BURST.zIndex),
  });
  document.body.appendChild(canvas);
  const fire = confetti.create(canvas, { resize: false, useWorker: false });
  const bursts = [...evenMix(BURST.particleCount)].map(([type, particleCount]) => fire({
    particleCount,
    spread: BURST.spread,
    origin: BURST.origin,
    ticks: BURST.ticks,
    startVelocity: BURST.startVelocity * dpr,
    gravity: dpr,
    scalar: 1 / SUPERSAMPLE,
    shapes: [shapes.get(type)!],
  }));
  try {
    await Promise.all(bursts);
  } finally {
    canvas.remove();
    for (const { bitmap } of shapes.values()) bitmap.close();
  }
}
