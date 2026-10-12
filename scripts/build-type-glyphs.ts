import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decode, type Raster } from './png-rgba';

/**
 * Extract the white type symbol from each Gen IX "small" icon into a
 * glyph-only PNG: white pixels, alpha from the symbol, cropped to its bounding
 * box.
 *
 * The type badge always draws the symbol white, and a badge grid renders up
 * to ~300 of them. Referencing one cached URL 300 times is free; inlining a
 * ~3 kB data URL into 300 style attributes is not.
 *
 * Output is committed, so this never runs in CI or on Vercel. Re-run it if the
 * upstream icons are ever refreshed:  npm run build-type-glyphs
 */

const SRC_DIR = 'public/sprites/types/small';
const OUT_DIR = 'public/sprites/types/glyph';

/** min(R,G,B) above this counts as the white symbol. */
const WHITE_T = 200;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encode({ width, height, data }: Raster): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Filter 0 on every row: these are tiny, and a filter search would only save
  // a few hundred bytes on an asset that is already under 2 kB.
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The symbol, white with a soft alpha edge, cropped to its bounding box. */
function extractGlyph(src: Raster): Raster {
  const { width, height, data } = src;
  const alpha = new Uint8Array(width * height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    // Fully transparent source pixels are the icon's rounded corners, not symbol.
    const mn = data[p + 3] < 128 ? 0 : Math.min(data[p], data[p + 1], data[p + 2]);
    const a = mn <= WHITE_T ? 0 : Math.round(((mn - WHITE_T) / (255 - WHITE_T)) * 255);
    alpha[i] = a;
    if (a > 20) {
      const x = i % width, y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) throw new Error('no white symbol found');
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = 255;
      out[o + 3] = alpha[(y + minY) * width + (x + minX)];
    }
  }
  return { width: w, height: h, data: out };
}

/** The icon's fill, read well inside the rounded square, as `#rrggbb`. */
function backgroundColor({ width, height, data }: Raster): string {
  const p = ((height >> 1) * width + 4) * 4;
  return `#${[data[p], data[p + 1], data[p + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows: string[] = [];
  for (let id = 1; id <= 18; id++) {
    const src = decode(readFileSync(`${SRC_DIR}/${id}.png`));
    const glyph = extractGlyph(src);
    const png = encode(glyph);
    writeFileSync(`${OUT_DIR}/${id}.png`, png);
    rows.push(
      `  ${String(id).padStart(2)}  ${String(glyph.width).padStart(2)}x${String(glyph.height).padStart(2)}  ` +
        `${String(png.length).padStart(4)} B  bg ${backgroundColor(src)}`,
    );
  }
  console.log(`${OUT_DIR}/: 18 glyphs`);
  for (const row of rows) console.log(row);
}

main();
