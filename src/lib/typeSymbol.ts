import type { TypeName } from '@/types/pokemon';
import { typeIconPath } from '@/data/type-ids';

// The Gen IX "small" type icons are a solid-colour rounded square with the type
// symbol painted in white. There is no clean glyph-only asset, so we extract the
// white symbol into an alpha MASK (symbol opaque, background transparent) by
// reading the PNG through a canvas. The mask can then be recoloured for free via
// CSS `background-color` + `mask-image`.
//
// Whiteness = min(R, G, B): a pure-white symbol is 255 on every channel, while
// any saturated/coloured background has at least one channel well below 255.

const WHITE_T = 200; // min-channel above this counts as the white symbol

const cache = new Map<TypeName, string>();
const pending = new Map<TypeName, Promise<string>>();

function buildMask(type: TypeName): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) { reject(new Error('no 2d context')); return; }
        ctx.drawImage(img, 0, 0);
        const im = ctx.getImageData(0, 0, w, h);
        const p = im.data;
        // Threshold to the white symbol and record its bounding box so the mask
        // can be cropped tight — different type symbols have different built-in
        // padding, and cropping normalises them to one consistent rendered size.
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const mn = Math.min(p[i], p[i + 1], p[i + 2]);
            const a = mn <= WHITE_T ? 0 : Math.round(((mn - WHITE_T) / (255 - WHITE_T)) * 255);
            p[i] = p[i + 1] = p[i + 2] = 255; // colour comes from CSS; only alpha matters
            p[i + 3] = a;
            if (a > 20) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        ctx.putImageData(im, 0, 0);
        if (maxX < minX) { resolve(c.toDataURL()); return; } // no symbol found
        const cw = maxX - minX + 1, ch = maxY - minY + 1;
        const out = document.createElement('canvas');
        out.width = cw; out.height = ch;
        const octx = out.getContext('2d');
        if (!octx) { resolve(c.toDataURL()); return; }
        octx.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
        resolve(out.toDataURL());
      } catch (e) {
        reject(e as Error);
      }
    };
    img.onerror = () => reject(new Error(`failed to load ${typeIconPath(type)}`));
    img.src = typeIconPath(type);
  });
}

/** Cached mask data URL for a type, or undefined if not generated yet. */
export function getTypeMask(type: TypeName): string | undefined {
  return cache.get(type);
}

/** Generate (once) and cache the alpha-mask data URL for a type. */
export function ensureTypeMask(type: TypeName): Promise<string> {
  const got = cache.get(type);
  if (got) return Promise.resolve(got);
  let p = pending.get(type);
  if (!p) {
    p = buildMask(type).then((url) => {
      cache.set(type, url);
      pending.delete(type);
      return url;
    });
    pending.set(type, p);
  }
  return p;
}
