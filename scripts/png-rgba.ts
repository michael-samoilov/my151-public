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

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Decode a non-interlaced PNG to RGBA: 8-bit RGBA, RGB, gray and gray-alpha,
 * and palette or gray at 1, 2, 4 or 8 bits, with tRNS transparency. That covers
 * every upstream icon and every Pokémon sprite (asserted below rather than
 * assumed). A general decoder would be a dependency or several hundred lines.
 */
export function decode(png: Buffer): Raster {
  const parts = chunks(png);
  const ihdr = parts.get('IHDR')?.[0];
  if (!ihdr) throw new Error('no IHDR');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [depth, colorType, , , interlace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
  const channels = CHANNELS[colorType];
  const indexed = colorType === 0 || colorType === 3;
  if (!channels || interlace !== 0 || !(depth === 8 || (indexed && [1, 2, 4].includes(depth)))) {
    throw new Error(`unsupported PNG: depth=${depth} colorType=${colorType} interlace=${interlace}`);
  }

  const raw = inflateSync(Buffer.concat(parts.get('IDAT') ?? []));
  const pixelBytes = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((width * channels * depth) / 8);
  const lines = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = y * stride;
    const prior = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= pixelBytes ? lines[row + x - pixelBytes] : 0;
      const b = y > 0 ? lines[prior + x] : 0;
      const c = x >= pixelBytes && y > 0 ? lines[prior + x - pixelBytes] : 0;
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
      lines[row + x] = value & 0xff;
    }
    src += stride;
  }
  if (colorType === 6) return { width, height, data: lines };

  const palette = parts.get('PLTE')?.[0];
  const trns = parts.get('tRNS')?.[0];
  if (colorType === 3 && !palette) throw new Error('palette PNG without PLTE');
  const max = (1 << depth) - 1;
  const sample = (row: number, x: number): number => {
    if (depth === 8) return lines[row + x];
    const bit = x * depth;
    return (lines[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & max;
  };
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      if (colorType === 3) {
        const index = sample(row, x);
        data.set(palette!.subarray(index * 3, index * 3 + 3), out);
        data[out + 3] = trns && index < trns.length ? trns[index] : 255;
      } else if (colorType === 0) {
        const gray = sample(row, x);
        data.fill(Math.round((gray * 255) / max), out, out + 3);
        data[out + 3] = trns && trns.readUInt16BE(0) === gray ? 0 : 255;
      } else if (colorType === 4) {
        data.fill(lines[row + x * 2], out, out + 3);
        data[out + 3] = lines[row + x * 2 + 1];
      } else {
        const rgb = lines.subarray(row + x * 3, row + x * 3 + 3);
        data.set(rgb, out);
        data[out + 3] = trns && trns.readUInt16BE(0) === rgb[0] && trns.readUInt16BE(2) === rgb[1] && trns.readUInt16BE(4) === rgb[2] ? 0 : 255;
      }
    }
  }
  return { width, height, data };
}
