import confetti from 'canvas-confetti';
import { TYPE_COLORS } from '@/data/type-colors';
import GLYPH_PATHS from '@/data/typeGlyphPaths.json';
import { TYPE_NAMES, type TypeName } from '@/types/pokemon';

/**
 * The completion burst, with type stickers for pieces: each type's glyph in
 * its type color inside a thin white edge, so a piece reads over any
 * background. Loaded on demand by `completionConfetti.ts`.
 *
 * The motion is the burst the Pokédex Maker fired before stickers: the same
 * canvas-confetti options, physics and fade. Two things differ, and neither
 * changes a piece's path:
 * - The canvas is sized in device pixels, so the stickers stay sharp. Every
 *   distance option is multiplied by the pixel ratio, so each piece covers
 *   the same CSS pixels on the same frame.
 * - Each type gets its own call, so the mix is exact: 3 or 4 of each type in
 *   60. canvas-confetti draws the same random numbers for a piece in any
 *   call, so the pieces follow the paths of one 60-piece call.
 */

/** One restrained burst, in CSS px: it registers as a celebration without covering the screen. */
const BURST = { particleCount: 60, spread: 65, startVelocity: 28, origin: { x: 0.5, y: 0.35 }, ticks: 160, zIndex: 300 };
/** The pieces of the burst before stickers, for browsers that cannot draw bitmap pieces. */
const PLAIN_PIECES = { colors: ['#dc2626', '#7ac74c', '#ee8130', '#6390f0', '#f7d02c'], scalar: 0.9 };

/**
 * Side of a sticker's glyph frame, in CSS px. Every glyph shares one frame,
 * so each symbol keeps its in-game size: fire stays smaller than grass.
 */
const FRAME_PX = 22.5;
/** White edge outside the glyph, in CSS px. */
const EDGE_PX = 1.5;
/** Bitmap side per frame side: room for a rotated frame's corners. */
const PAD = 1.5;
/** Bitmap pixels per device pixel, so rotation and squash stay smooth. */
const SUPERSAMPLE = 2;

/** Fails to compile when the generated file lacks a type. */
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
    // Every edge first, then every fill, so the edge stays outside the
    // glyph where its shapes overlap.
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

/** `count / 18` of each type, and one more of `count % 18` types from a random start. */
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
  // Capped at 3: a denser canvas looks no sharper on a phone and costs memory.
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
    // Velocity and gravity (1 by default) are distances per frame.
    startVelocity: BURST.startVelocity * dpr,
    gravity: dpr,
    // Sets the drawn size only, not the path: see stickerShapes.
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
