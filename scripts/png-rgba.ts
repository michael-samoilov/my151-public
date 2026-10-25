import { crc32, deflateSync, inflateSync } from 'node:zlib';

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
    if (type === 'IEND') break;
    pos += 12 + length;
  }
  return out;
}

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** Adam7 passes as [first column, first row, column step, row step]. */
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/** Reverses the scanline filters of one `height`-row image of `stride` bytes per row, read from `raw` at `start`. */
function unfilter(raw: Buffer, start: number, height: number, stride: number, pixelBytes: number): Uint8Array {
  const lines = new Uint8Array(height * stride);
  let src = start;
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
  return lines;
}

/**
 * Decode a PNG to RGBA: 8-bit RGBA, RGB, gray and gray-alpha, and palette or
 * gray at 1, 2, 4 or 8 bits, with tRNS transparency, plain or Adam7-interlaced.
 * That covers every upstream icon and every Pokémon sprite (asserted below
 * rather than assumed). A general decoder would be a dependency or several
 * hundred lines.
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
  if (!channels || interlace > 1 || !(depth === 8 || (indexed && [1, 2, 4].includes(depth)))) {
    throw new Error(`unsupported PNG: depth=${depth} colorType=${colorType} interlace=${interlace}`);
  }

  const palette = parts.get('PLTE')?.[0];
  const trns = parts.get('tRNS')?.[0];
  if (colorType === 3 && !palette) throw new Error('palette PNG without PLTE');
  const raw = inflateSync(Buffer.concat(parts.get('IDAT') ?? []));
  const pixelBytes = Math.max(1, (channels * depth) >> 3);
  const max = (1 << depth) - 1;
  const data = new Uint8Array(width * height * 4);
  let src = 0;
  for (const [x0, y0, dx, dy] of interlace ? ADAM7 : [[0, 0, 1, 1]]) {
    const passWidth = Math.ceil((width - x0) / dx);
    const passHeight = Math.ceil((height - y0) / dy);
    if (passWidth <= 0 || passHeight <= 0) continue;
    const stride = Math.ceil((passWidth * channels * depth) / 8);
    const lines = unfilter(raw, src, passHeight, stride, pixelBytes);
    src += passHeight * (stride + 1);
    const sample = (row: number, x: number): number => {
      if (depth === 8) return lines[row + x];
      const bit = x * depth;
      return (lines[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & max;
    };
    for (let y = 0; y < passHeight; y++) {
      const row = y * stride;
      for (let x = 0; x < passWidth; x++) {
        const out = ((y0 + y * dy) * width + x0 + x * dx) * 4;
        if (colorType === 6) {
          data.set(lines.subarray(row + x * 4, row + x * 4 + 4), out);
        } else if (colorType === 3) {
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
  }
  return { width, height, data };
}

/** Whether two rasters show the same pixels. Fully transparent pixels match whatever color they store. */
export function samePixels(a: Raster, b: Raster): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i + 3] === 0 && b.data[i + 3] === 0) continue;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) return false;
  }
  return true;
}

/**
 * How many pixels are see-through in one raster and not the other, or null when
 * the sizes differ. A shiny with 0 has the same outline as its normal sprite.
 */
export function maskDifference(a: Raster, b: Raster): number | null {
  if (a.width !== b.width || a.height !== b.height) return null;
  let count = 0;
  for (let i = 3; i < a.data.length; i += 4) if ((a.data[i] === 0) !== (b.data[i] === 0)) count++;
  return count;
}

/** Encode RGBA as an 8-bit RGBA PNG. scripts/optimize-sprites.py shrinks the result. */
export function encode({ width, height, data }: Raster): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rows.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
