import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** One completion burst, as the page saw it. */
export interface Burst {
  /** Canvas pixels per CSS pixel: the screen's pixel ratio when the pieces are sharp. */
  scale: number;
  /**
   * The types whose color covers at least `MIN_PIXELS` canvas pixels, 12
   * frames into the burst. Null when the canvas cannot be read, as with
   * canvas-confetti's own worker canvas. Undefined until the frame is read.
   */
  types?: string[] | null;
}

/** The app's 18 type colors, from `src/data/type-colors.ts`. */
const TYPE_COLORS = Object.fromEntries(
  [...readFileSync('src/data/type-colors.ts', 'utf8').matchAll(/^\s+([a-z]+): '#([0-9A-Fa-f]{6})',$/gm)]
    .map((m) => [m[1], m[2]]),
);
if (Object.keys(TYPE_COLORS).length !== 18) throw new Error('Expected 18 type colors in src/data/type-colors.ts');

/**
 * Records each confetti burst the page starts in `window.__bursts`. A burst
 * is a canvas added to `<body>` with fixed position and no pointer events:
 * the canvas-confetti library's own canvas and the sticker canvas both are.
 *
 * Twelve frames in, it counts the opaque pixels nearest to each type color.
 * A sticker is its type color inside a thin white edge, so a burst of
 * stickers shows most of the 18 colors, and the old five-color burst none.
 *
 * Call before `page.goto`. Each page load starts a new record.
 */
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

/** The bursts this page load has started so far. */
export function bursts(page: Page): Promise<Burst[]> {
  return page.evaluate(() => (window as unknown as { __bursts?: Burst[] }).__bursts ?? []);
}

/** Waits until the first burst's frame has been read, and returns every burst. */
export async function settledBursts(page: Page): Promise<Burst[]> {
  await page.waitForFunction(() => {
    const found = (window as unknown as { __bursts?: Burst[] }).__bursts ?? [];
    return found.length > 0 && found.every((b) => b.types !== undefined);
  }, null, { timeout: 10_000 });
  return bursts(page);
}
