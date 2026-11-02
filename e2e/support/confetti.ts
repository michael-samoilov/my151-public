import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

export interface Burst {
  scale: number;
  // platform: canvas-confetti's own worker canvas cannot be read, so types is null there.
  types?: string[] | null;
}

const TYPE_COLORS = Object.fromEntries(
  [...readFileSync('src/data/type-colors.ts', 'utf8').matchAll(/^\s+([a-z]+): '#([0-9A-Fa-f]{6})',$/gm)]
    .map((m) => [m[1], m[2]]),
);
if (Object.keys(TYPE_COLORS).length !== 18) throw new Error('Expected 18 type colors in src/data/type-colors.ts');

export async function watchConfetti(page: Page): Promise<void> {
  await page.addInitScript((colors) => {
    const MIN_PIXELS = 20;
    const MAX_DISTANCE_SQ = 24 * 24;
    const palette = Object.entries(colors).map(([type, hex]) => ({
      type,
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    }));
    const found: { scale: number; types?: string[] | null }[] = [];
    (window as unknown as { __bursts: typeof found }).__bursts = found;

    const readTypes = (canvas: HTMLCanvasElement): string[] | null => {
      try {
        const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        const counts = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          let best: string | null = null;
          let bestSq = MAX_DISTANCE_SQ;
          for (const c of palette) {
            const sq = (data[i] - c.r) ** 2 + (data[i + 1] - c.g) ** 2 + (data[i + 2] - c.b) ** 2;
            if (sq < bestSq) { bestSq = sq; best = c.type; }
          }
          if (best) counts.set(best, (counts.get(best) ?? 0) + 1);
        }
        return [...counts].filter(([, n]) => n >= MIN_PIXELS).map(([type]) => type).sort();
      } catch {
        return null;
      }
    };

    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLCanvasElement) || node.parentNode !== document.body) continue;
          if (node.style.position !== 'fixed' || node.style.pointerEvents !== 'none') continue;
          const burst: (typeof found)[number] = { scale: node.width / document.documentElement.clientWidth };
          found.push(burst);
          let frames = 0;
          const tick = () => {
            if (++frames < 12) requestAnimationFrame(tick);
            else burst.types = readTypes(node);
          };
          requestAnimationFrame(tick);
        }
      }
    }).observe(document, { childList: true, subtree: true });
  }, TYPE_COLORS);
}

export function bursts(page: Page): Promise<Burst[]> {
  return page.evaluate(() => (window as unknown as { __bursts?: Burst[] }).__bursts ?? []);
}

export async function settledBursts(page: Page): Promise<Burst[]> {
  await page.waitForFunction(() => {
    const found = (window as unknown as { __bursts?: Burst[] }).__bursts ?? [];
    return found.length > 0 && found.every((b) => b.types !== undefined);
  }, null, { timeout: 10_000 });
  return bursts(page);
}
