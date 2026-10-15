import { describe, expect, it } from 'vitest';
import { splitImagePreloads } from './prerender-hub';

describe('hub screenshot preload discovery', () => {
  it.each([
    '<link rel="preload" as="image" href="/automatic.avif"/>',
    '<link rel="preload" href="/explicit.avif" as="image" type="image/avif"/>',
    '<link href="/reordered.avif" as="image" rel="preload"/>',
  ])('moves a React image hint before the inline stylesheet: %s', (hint) => {
    const { preloads, markup } = splitImagePreloads(`${hint}<main>Cards</main>`);
    expect(preloads).toEqual([hint]);
    expect(markup).toBe('<main>Cards</main>');
  });

  it('preserves non-image links and content while moving multiple screenshots', () => {
    const font = '<link rel="preload" as="font" href="/inter.woff2"/>';
    const prefetch = '<link rel="prefetch" as="image" href="/later.avif"/>';
    const first = '<link rel="preload" href="/first.avif" as="image"/>';
    const second = '<link rel="preload" as="image" href="/second.avif"/>';
    const { preloads, markup } = splitImagePreloads(`${font}${first}${prefetch}${second}<main>Cards</main>`);
    expect(preloads).toEqual([first, second]);
    expect(markup).toBe(`${font}${prefetch}<main>Cards</main>`);
  });
});
