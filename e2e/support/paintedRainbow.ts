import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

export type RgbImage = { w: number; h: number; rgb: Uint8Array };

const MIN_CHANGED_INK_RATIO = 0.01;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decode an 8-bit RGB or RGBA PNG. Playwright card screenshots use this form. */
export function decodePng(buf: Buffer): RgbImage {
  if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('not a png');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 2;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      colorType = data[9] ?? 2;
      if (depth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`png ${depth}/${colorType}`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const rgb = new Uint8Array(width * height * 3);
  let i = 0;
  const prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[i] ?? 0;
    i += 1;
    row.set(raw.subarray(i, i + stride));
    i += stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? row[x - bpp]! : 0;
      const up = prev[x]!;
      const ul = x >= bpp ? prev[x - bpp]! : 0;
      const v = row[x]!;
      if (filter === 1) row[x] = (v + left) & 255;
      else if (filter === 2) row[x] = (v + up) & 255;
      else if (filter === 3) row[x] = (v + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (v + paeth(left, up, ul)) & 255;
      else if (filter !== 0) throw new Error(`png filter ${filter}`);
    }
    prev.set(row);
    for (let x = 0; x < width; x++) {
      const s = x * bpp;
      const d = (y * width + x) * 3;
      rgb[d] = row[s]!;
      rgb[d + 1] = row[s + 1]!;
      rgb[d + 2] = row[s + 2]!;
    }
  }
  return { w: width, h: height, rgb };
}

/** Share of interior pixels the gleam layer changes. The red frame is excluded. */
export function interiorChangeRatio(live: RgbImage, hidden: RgbImage): number {
  const w = Math.min(live.w, hidden.w);
  const h = Math.min(live.h, hidden.h);
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.08));
  let n = 0;
  let changed = 0;
  for (let y = band; y < h - band; y++) {
    for (let x = band; x < w - band; x++) {
      const ia = (y * live.w + x) * 3;
      const ib = (y * hidden.w + x) * 3;
      const d =
        Math.abs(live.rgb[ia]! - hidden.rgb[ib]!) +
        Math.abs(live.rgb[ia + 1]! - hidden.rgb[ib + 1]!) +
        Math.abs(live.rgb[ia + 2]! - hidden.rgb[ib + 2]!);
      n += 1;
      if (d > 24) changed += 1;
    }
  }
  return n === 0 ? 0 : changed / n;
}

async function cardClip(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-export-preview]');
    if (!(el instanceof HTMLElement)) return { x: 0, y: 0, width: 1, height: 1 };
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.max(1, r.width), height: Math.max(1, r.height) };
  });
}

/**
 * Open-state rainbow: hide the gleam layer and count interior pixels that change.
 * A frame-only mask leaves the ink unchanged.
 */
export async function paintedInkRainbow(page: Page): Promise<{ ok: boolean; reason: string }> {
  await page.evaluate(() => {
    const win = window as Window & { __rafFrozen?: boolean };
    if (win.__rafFrozen) return;
    win.__rafFrozen = true;
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(80);
  const clip = await cardClip(page);
  const live = decodePng(await page.screenshot({ clip, animations: 'disabled' }));
  await page.evaluate(() => {
    const holo = document.querySelector('[data-foil-layer="gleam"]');
    if (holo instanceof HTMLElement) holo.style.visibility = 'hidden';
  });
  const hidden = decodePng(await page.screenshot({ clip, animations: 'disabled' }));
  await page.evaluate(() => {
    const holo = document.querySelector('[data-foil-layer="gleam"]');
    if (holo instanceof HTMLElement) holo.style.visibility = '';
  });
  const ratio = interiorChangeRatio(live, hidden);
  const amount = await page.evaluate(() => {
    const card = document.querySelector('[data-export-preview]');
    if (!(card instanceof HTMLElement)) return 0;
    return Number(getComputedStyle(card).getPropertyValue('--foil-gleam'));
  });
  if (Math.abs(amount - 0.6) > 0.02) return { ok: false, reason: `amount ${amount}` };
  if (ratio < MIN_CHANGED_INK_RATIO) return { ok: false, reason: `ink unchanged ${(ratio * 100).toFixed(2)}%` };
  return { ok: true, reason: `ink ${(ratio * 100).toFixed(1)}%` };
}
