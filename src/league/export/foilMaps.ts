import type { FoilMapNeed } from './foilRecipe';

/**
 * Alpha maps derived from an export PNG so lighting can follow the print.
 *
 * sat  — ink. Chroma plus dark-on-paper. White paper stays 0.
 * edge — Sobel magnitude of luminance. Type, frames, sprite outlines.
 * gloss — chroma on mid-bright pixels. Specular and sparkle land here.
 *
 * Maps are RGBA with white RGB and the signal in alpha, so CSS
 * `mask-mode: alpha` can clip each lighting layer.
 */

export type RgbaBitmap = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type FoilMaps = {
  sat: RgbaBitmap;
  edge: RgbaBitmap;
  gloss: RgbaBitmap;
};

export type FoilMaskUrls = {
  sat: string;
  edge: string;
  gloss: string;
};

const CHROMA_FLOOR = 12;
const ALL_MAPS: FoilMapNeed = { sat: true, edge: true, gloss: true };

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function blank(width: number, height: number): RgbaBitmap {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function writeMaskPixel(out: Uint8ClampedArray, index: number, alpha: number): void {
  const o = index * 4;
  out[o] = 255;
  out[o + 1] = 255;
  out[o + 2] = 255;
  out[o + 3] = alpha;
}

function sampleLum(lum: Float32Array, width: number, height: number, x: number, y: number): number {
  const xx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const yy = y < 0 ? 0 : y >= height ? height - 1 : y;
  return lum[yy * width + xx]!;
}

/** Pure map derivation. Node tests call this with a hand-built buffer. */
export function deriveFoilMaps(src: RgbaBitmap, need: FoilMapNeed = ALL_MAPS): FoilMaps {
  const { width, height, data } = src;
  const count = width * height;
  const lum = need.edge ? new Float32Array(count) : null;
  const sat = blank(width, height);
  const gloss = blank(width, height);
  const edge = blank(width, height);

  if (need.sat || need.gloss || need.edge) {
    for (let i = 0; i < count; i++) {
      const o = i * 4;
      const r = data[o]!;
      const g = data[o + 1]!;
      const b = data[o + 2]!;
      const a = data[o + 3]!;
      const y = luma(r, g, b);
      if (lum) lum[i] = y;
      if (!need.sat && !need.gloss) continue;
      const maxc = Math.max(r, g, b);
      const minc = Math.min(r, g, b);
      const chroma = maxc - minc;
      const nearPaper = a === 0 || (y >= 248 && chroma < CHROMA_FLOOR);
      const chroma01 = nearPaper || chroma < CHROMA_FLOOR || maxc === 0 ? 0 : chroma / maxc;
      const dark01 = nearPaper || y >= 230 ? 0 : Math.min(1, (230 - y) / 160);
      const sat01 = nearPaper ? 0 : Math.max(chroma01, dark01 * 0.65);
      const satA = Math.round(Math.min(255, Math.pow(sat01, 0.72) * 255));
      if (need.sat) writeMaskPixel(sat.data, i, satA);
      if (need.gloss) {
        const mid = 1 - Math.abs(y - 168) / 168;
        writeMaskPixel(gloss.data, i, Math.round(satA * Math.max(0, mid)));
      }
    }
  }

  if (need.edge && lum) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const gx =
          -sampleLum(lum, width, height, x - 1, y - 1) +
          sampleLum(lum, width, height, x + 1, y - 1) +
          -2 * sampleLum(lum, width, height, x - 1, y) +
          2 * sampleLum(lum, width, height, x + 1, y) +
          -sampleLum(lum, width, height, x - 1, y + 1) +
          sampleLum(lum, width, height, x + 1, y + 1);
        const gy =
          -sampleLum(lum, width, height, x - 1, y - 1) +
          -2 * sampleLum(lum, width, height, x, y - 1) +
          -sampleLum(lum, width, height, x + 1, y - 1) +
          sampleLum(lum, width, height, x - 1, y + 1) +
          2 * sampleLum(lum, width, height, x, y + 1) +
          sampleLum(lum, width, height, x + 1, y + 1);
        const mag = Math.hypot(gx, gy) / 8;
        writeMaskPixel(edge.data, y * width + x, Math.round(Math.min(255, mag)));
      }
    }
  }

  return { sat, edge, gloss };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('foil map image failed'));
    img.src = src;
  });
}

function bitmapToPngUrl(bmp: RgbaBitmap): string {
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const imageData = ctx.createImageData(bmp.width, bmp.height);
  imageData.data.set(bmp.data);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Downsample the preview PNG and return CSS mask data URLs. */
export async function foilMaskUrlsFromImage(
  src: string,
  need: FoilMapNeed = ALL_MAPS,
  maxEdge = 384,
): Promise<FoilMaskUrls> {
  if (!need.sat && !need.edge && !need.gloss) {
    return { sat: '', edge: '', gloss: '' };
  }
  const img = await loadImage(src);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  const scale = Math.min(1, maxEdge / Math.max(nw, nh, 1));
  const width = Math.max(1, Math.round(nw * scale));
  const height = Math.max(1, Math.round(nh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { sat: '', edge: '', gloss: '' };
  }
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const maps = deriveFoilMaps({ width, height, data: imageData.data }, need);
  return {
    sat: need.sat ? bitmapToPngUrl(maps.sat) : '',
    edge: need.edge ? bitmapToPngUrl(maps.edge) : '',
    gloss: need.gloss ? bitmapToPngUrl(maps.gloss) : '',
  };
}

export function foilMaskCss(url: string): string {
  return url ? `url("${url}")` : 'none';
}
