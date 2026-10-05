import { expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { seedDex, TUNE_URL } from './dexSeed';
export type StatsTool = 'picker' | 'dex';
export const filledPicker = JSON.parse(readFileSync('docs/favorite-picker-work/export/seed.json', 'utf8')).fills as Record<string, number>;
export async function openStatsFlow(page: Page, tool: StatsTool, lang = 'en') {
  await page.addInitScript(() => {
    const target = window as unknown as { frameTexts: { text: string; color: string; width: number; height: number; bounds: { left: number; right: number; top: number; bottom: number } }[] };
    target.frameTexts = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
      const metrics = this.measureText(text), matrix = this.getTransform();
      const corners = [new DOMPoint(x - metrics.actualBoundingBoxLeft, y - metrics.actualBoundingBoxAscent), new DOMPoint(x + metrics.actualBoundingBoxRight, y + metrics.actualBoundingBoxDescent)].map(point => point.matrixTransform(matrix));
      target.frameTexts.push({ text, color: String(this.fillStyle), width: this.canvas.width, height: this.canvas.height, bounds: { left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)), top: Math.min(...corners.map(point => point.y)), bottom: Math.max(...corners.map(point => point.y)) } });
      if (maxWidth === undefined) original.call(this, text, x, y); else original.call(this, text, x, y, maxWidth);
    };
  });
  if (tool === 'picker') {
    await page.addInitScript(fills => localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills }, version: 3 })), filledPicker);
    await page.goto(`/favorite-pokemon-by-type?notme&lang=${lang}`);
    await page.getByTestId('favorites-export-open').click();
  } else {
    await page.goto(`${TUNE_URL}&notme&lang=${lang}`);
    await seedDex(page);
    await page.locator('[data-nav="view"]').click();
    await page.locator('[data-dex-export]').waitFor();
    await page.locator('[data-dex-export]').click();
  }
}
export async function nativeImage(page: Page, tool: StatsTool) {
  const save = tool === 'picker' ? page.getByTestId('favorites-export-save') : page.locator('[data-dex-export-confirm]');
  await expect(save).toBeEnabled({ timeout: 45000 });
  const image = page.locator('[data-export-preview-layer] img[src^="blob:"]').first();
  return image.evaluate(async el => {
    const image = el as HTMLImageElement;
    await image.decode();
    const cv = document.createElement('canvas'); cv.width = image.naturalWidth; cv.height = image.naturalHeight;
    const ctx = cv.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const bytes = new Uint8Array(await (await fetch(image.src)).arrayBuffer());
    let binary = ''; for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { width: cv.width, height: cv.height, png: btoa(binary), sha256: [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('') };
  });
}
export async function framePixels(page: Page, mainWidth: number) {
  return page.locator('[data-export-preview-layer] img[src^="blob:"]').first().evaluate(async (el, mainWidth) => {
    const image = el as HTMLImageElement; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const pixel = (x: number, y: number) => [...ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data];
    const y = Math.floor(canvas.height / 2);
    const statsX = mainWidth - 12;
    const statsWidth = canvas.width - statsX;
    const seam = ctx.getImageData(statsX, y, 12, 1).data;
    const seamPixels = Array.from({ length: 12 }, (_, index) => [...seam.slice(index * 4, index * 4 + 4)]);
    let whiteHeaderPixels = 0;
    const header = ctx.getImageData(statsX + 16, 16, Math.max(1, statsWidth - 32), 48).data;
    for (let i = 0; i < header.length; i += 4) if (header[i] > 245 && header[i + 1] > 245 && header[i + 2] > 245 && header[i + 3] === 255) whiteHeaderPixels++;
    const target = window as unknown as { frameTexts?: { text: string; color: string; width: number; height: number; bounds: { left: number; right: number; top: number; bottom: number } }[] };
    return { width: canvas.width, height: canvas.height, mainWidth, statsX, statsWidth, seamPixels, seamNotch: pixel(statsX + 6, 0),
      corners: [pixel(0, 0), pixel(canvas.width - 1, 0), pixel(0, canvas.height - 1), pixel(canvas.width - 1, canvas.height - 1)],
      mainTop: pixel(mainWidth / 2, 2), statsTop: pixel(statsX + statsWidth / 2, 2), statsSide: pixel(statsX + 2, y), mainBottom: pixel(mainWidth / 2, canvas.height - 2), statsBottom: pixel(statsX + statsWidth / 2, canvas.height - 2),
      statsWhiteBody: pixel(statsX + 16, 120), whiteHeaderPixels,
      headerGlyphs: (target.frameTexts ?? []).filter(record => record.width === canvas.width && record.height === canvas.height && record.color.toLowerCase() === '#ffffff' && record.bounds.left > statsX && record.bounds.top >= 0 && record.bounds.bottom < 74),
      texts: [...new Map((target.frameTexts ?? []).map(record => [`${record.text}|${record.color}`, record])).values()] };
  }, mainWidth);
}
export async function toggleStats(page: Page, tool: StatsTool) {
  if (tool === 'picker') await page.getByTestId('favorites-export-stats').check();
  else await page.locator('[data-export-stats]').click();
}
export function saveNative(phase: string, tool: StatsTool, kind: string, image: Awaited<ReturnType<typeof nativeImage>>) {
  const directory = 'docs/favorite-picker-work/stats-framing/local'; mkdirSync(directory, { recursive: true });
  const path = `${directory}/${phase}-${tool}-${kind}.png`; writeFileSync(path, Buffer.from(image.png, 'base64')); return path;
}
