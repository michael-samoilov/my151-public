import { inflateSync } from 'node:zlib';

export interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

function chunks(png: Buffer): Map<string, Buffer[]> {
  const out = new Map<string, Buffer[]>();
  let pos = 8;
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const list = out.get(type) ?? [];
    list.push(png.subarray(pos + 8, pos + 8 + length));
    out.set(type, list);
    pos += 12 + length;
  }
  return out;
}

/**
 * Decode 8-bit RGBA, non-interlaced PNG — which is what every upstream icon is
 * (asserted below rather than assumed). A general decoder would be a dependency
 * or several hundred lines; this is the one shape we actually have.
 */
export function decode(png: Buffer): Raster {
  const parts = chunks(png);
  const ihdr = parts.get('IHDR')?.[0];
  if (!ihdr) throw new Error('no IHDR');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [depth, colorType, , , interlace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
  if (depth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG: depth=${depth} colorType=${colorType} interlace=${interlace}`);
  }

  const raw = inflateSync(Buffer.concat(parts.get('IDAT') ?? []));
  const stride = width * 4;
  const data = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = y * stride;
    const prior = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? data[row + x - 4] : 0;
      const b = y > 0 ? data[prior + x] : 0;
      const c = x >= 4 && y > 0 ? data[prior + x - 4] : 0;
      let value = raw[src + x];
      switch (filter) {
        case 1: value += a; break;
        case 2: value += b; break;
        case 3: value += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
      }
      data[row + x] = value & 0xff;
    }
    src += stride;
  }
  return { width, height, data };
}
