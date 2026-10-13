import type { FoilMapNeed } from './foilRecipe';

export type RgbaBitmap = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

type FoilMaps = {
  sat: RgbaBitmap;
  edge: RgbaBitmap;
  gloss: RgbaBitmap;
};

type FoilMaskUrls = {
  sat: string;
  edge: string;
  gloss: string;
};

/**
 * Chroma ramp from paper to ink. At or below PASTEL_CHROMA a pixel is paper
 * or a pastel fill; from INK_CHROMA up it counts in full. A ramp, not a
 * floor: the league rows' tints sit at chroma 7-16, and a hard floor at 12
 * lit the water, electric, fire, ice, and fighting rows but not the rest.
 */
const PASTEL_CHROMA = 18;
const INK_CHROMA = 30;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
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
      const clear = a === 0;
      const chroma01 = clear || maxc === 0 ? 0 : (chroma / maxc) * smoothstep(PASTEL_CHROMA, INK_CHROMA, chroma);
      const dark01 = clear || y >= 230 ? 0 : Math.min(1, (230 - y) / 160);
      const sat01 = clear ? 0 : Math.max(chroma01, dark01 * 0.65);
      const satA = Math.round(Math.min(255, Math.pow(sat01, 0.72) * 255));
      if (need.sat) writeMaskPixel(sat.data, i, satA);
      if (need.gloss) {
        const mid = 1 - Math.abs(y - 168) / 168;
        writeMaskPixel(gloss.data, i, Math.round(satA * Math.max(0, mid)));
      }
    }
  }

  // A blend over a partly transparent pixel shows some of the layer's own
  // color, so the gleam's dark gaps darkened the anti-aliased rim of the
  // card's rounded corners. Ink masks stop one pixel inside that rim; the
  // extra pixel covers the bilinear blur when the preview scales the mask up.
  if (need.sat || need.gloss) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (sat.data[o + 3] === 0 && gloss.data[o + 3] === 0) continue;
        let rim = false;
        for (let dy = -1; dy <= 1 && !rim; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < width && data[(yy * width + xx) * 4 + 3]! < 255) {
              rim = true;
              break;
            }
          }
        }
        if (rim) {
          sat.data[o + 3] = 0;
          gloss.data[o + 3] = 0;
        }
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
