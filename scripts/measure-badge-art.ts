import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

interface Raster { width: number; height: number; data: Uint8Array }

function decode(png: Buffer): Raster {
  let pos = 8;
  let width = 0, height = 0, colorType = 6;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + length;
  }
  // Playwright writes opaque RGB; the sprite art is RGBA. Both are handled so
  // the reference and our rendering go through one measurement path.
  if (colorType !== 6 && colorType !== 2) throw new Error(`colorType ${colorType}`);
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = y * stride, prior = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[row + x - channels] : 0;
      const b = y > 0 ? out[prior + x] : 0;
      const c = x >= channels && y > 0 ? out[prior + x - channels] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[row + x] = v & 0xff;
    }
    src += stride;
  }
  if (channels === 4) {

    for (let i = 0; i < out.length; i += 4) {
      const a = out[i + 3] / 255;
      out[i] = Math.round(out[i] * a);
      out[i + 1] = Math.round(out[i + 1] * a);
      out[i + 2] = Math.round(out[i + 2] * a);
      out[i + 3] = 255;
    }
    return { width, height, data: out };
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < out.length; i += 3, j += 4) {
    rgba[j] = out[i]; rgba[j + 1] = out[i + 1]; rgba[j + 2] = out[i + 2]; rgba[j + 3] = 255;
  }
  return { width, height, data: rgba };
}

const at = (r: Raster, x: number, y: number) => {
  const i = (y * r.width + x) * 4;
  return { r: r.data[i], g: r.data[i + 1], b: r.data[i + 2], a: r.data[i + 3] };
};
const isInk = (r: Raster, x: number, y: number) => {
  const p = at(r, x, y);
  return p.a > 140 && Math.min(p.r, p.g, p.b) > 170;
};

function cornerRadius(r: Raster): number {
  const fill = at(r, 4, r.height >> 1);
  const near = (p: { r: number; g: number; b: number; a: number }) =>
    p.a > 200 && Math.abs(p.r - fill.r) < 24 && Math.abs(p.g - fill.g) < 24 && Math.abs(p.b - fill.b) < 24;
  for (let x = 0; x < 40; x++) if (near(at(r, x, 0))) return x;
  return -1;
}

interface Box { x0: number; y0: number; x1: number; y1: number }

function inkBox(r: Raster, xFrom: number, xTo: number): Box {
  const box: Box = { x0: r.width, y0: r.height, x1: -1, y1: -1 };
  for (let x = xFrom; x <= xTo; x++) {
    for (let y = 0; y < r.height; y++) {
      if (!isInk(r, x, y)) continue;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
    }
  }
  return box;
}

function inkRuns(r: Raster, gap: number): Box[] {
  const cols: number[] = [];
  for (let x = 0; x < r.width; x++) {
    let n = 0;
    for (let y = 0; y < r.height; y++) if (isInk(r, x, y)) n++;
    if (n > 0) cols.push(x);
  }
  const runs: Box[] = [];
  let prev = -99;
  for (const x of cols) {
    if (x - prev > gap) runs.push({ x0: x, y0: r.height, x1: x, y1: -1 });
    else runs[runs.length - 1].x1 = x;
    prev = x;
  }
  for (const run of runs) {
    for (let x = run.x0; x <= run.x1; x++) {
      for (let y = 0; y < r.height; y++) {
        if (!isInk(r, x, y)) continue;
        if (y < run.y0) run.y0 = y;
        if (y > run.y1) run.y1 = y;
      }
    }
  }
  return runs;
}

const CAPS_NO_DESCENDER: Record<number, string> = {
  1: 'NORMAL', 7: 'BUG', 10: 'FIRE', 12: 'GRASS', 13: 'ELECTRIC', 16: 'DRAGON',
};

const GLYPH_TEXT_SPLIT = 46;

const DIR = process.argv[2] ?? '/tmp/badgeref';

function main() {
  console.log(`${DIR}`);
  console.log('badge  size     radius  bg        glyph box            text box             capH  gaps');
  const summary: { id: number; glyph: Box; text: Box; capH: number; letters: number[]; coverage: number }[] = [];

  for (const id of Object.keys(CAPS_NO_DESCENDER).map(Number)) {
    const r = decode(readFileSync(`${DIR}/${id}.png`));
    const radius = cornerRadius(r);
    const bg = at(r, 4, r.height >> 1);

    const glyph = inkBox(r, 0, GLYPH_TEXT_SPLIT - 1);
    const text = inkBox(r, GLYPH_TEXT_SPLIT, r.width - 1);
    const letters = inkRuns(r, 2).filter((run) => run.x0 >= GLYPH_TEXT_SPLIT);

    let inked = 0;
    for (let x = text.x0; x <= text.x1; x++) {
      for (let y = text.y0; y <= text.y1; y++) if (isInk(r, x, y)) inked++;
    }
    const coverage = inked / ((text.x1 - text.x0 + 1) * (text.y1 - text.y0 + 1));
    const capH = text.y1 - text.y0 + 1;
    const gaps = letters.slice(1).map((l, i) => l.x0 - letters[i].x1 - 1);

    if (text.x0 <= GLYPH_TEXT_SPLIT) console.log(`   ! ${id}: text reaches the symbol`);

    console.log(
      `${String(id).padStart(3)}    ${r.width}x${r.height}  ${String(radius).padStart(4)}   ` +
      `#${[bg.r, bg.g, bg.b].map((v) => v.toString(16).padStart(2, '0')).join('')}   ` +
      `x ${String(glyph.x0).padStart(3)}-${String(glyph.x1).padEnd(3)} y ${String(glyph.y0).padStart(2)}-${String(glyph.y1).padEnd(2)}  ` +
      `x ${String(text.x0).padStart(3)}-${String(text.x1).padEnd(3)} y ${String(text.y0).padStart(2)}-${String(text.y1).padEnd(2)}  ` +
      `${String(capH).padStart(4)}  ${gaps.join(',')}`,
    );
    summary.push({ id, glyph, text, capH, letters: gaps, coverage });
  }

  const capHs = summary.map((s) => s.capH);
  const glyphW = summary.map((s) => s.glyph.x1 - s.glyph.x0 + 1);
  const glyphH = summary.map((s) => s.glyph.y1 - s.glyph.y0 + 1);
  const textMid = summary.map((s) => (s.text.y0 + s.text.y1 + 1) / 2);
  const gaps = summary.flatMap((s) => s.letters);

  const stat = (name: string, xs: number[]) =>
    console.log(`  ${name.padEnd(22)} min ${Math.min(...xs)}  max ${Math.max(...xs)}  mean ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)}`);

  console.log('\nacross the sample:');
  stat('cap height', capHs);
  stat('glyph width', glyphW);
  stat('glyph height', glyphH);
  stat('text vertical centre', textMid);
  stat('letter gap', gaps);
  console.log(`\n  text left edge:  ${summary.map((s) => s.text.x0).join(', ')}`);
  console.log(`  text right edge: ${summary.map((s) => s.text.x1).join(', ')}`);
  console.log(`  text centre x:   ${summary.map((s) => ((s.text.x0 + s.text.x1 + 1) / 2).toFixed(1)).join(', ')}`);
  console.log(`  glyph centre:    x ${summary.map((s) => ((s.glyph.x0 + s.glyph.x1 + 1) / 2).toFixed(1)).join(', ')}`);
  console.log(`                   y ${summary.map((s) => ((s.glyph.y0 + s.glyph.y1 + 1) / 2).toFixed(1)).join(', ')}`);
  console.log(`  text width:      ${summary.map((s) => s.text.x1 - s.text.x0 + 1).join(', ')}`);
  console.log(`  ink coverage:    ${summary.map((s) => s.coverage.toFixed(3)).join(', ')}  mean ${(summary.reduce((a, b) => a + b.coverage, 0) / summary.length).toFixed(3)}`);
}

main();
