import { expect, test } from '@playwright/test';

/**
 * The league entry's static shell is the app's own first paint.
 *
 * The page is served as real HTML for crawlers, and React replaces it on
 * mount. For the 80ms in between, a person arriving from the dex builder saw
 * the shell's own smaller header and a block of copy, and then both jumped
 * to the app's. Measured with scripts off (the shell alone) against the
 * mounted app: the site header and the tool bar are the same height at the
 * same place, the h1 sits where the tool bar's eyebrow sits at the same
 * size, and the copy is invisible until a second has passed.
 */

interface Paint {
  rootFont: string;
  header: { top: number; height: number } | null;
  bar: { top: number; height: number } | null;
  h1: { top: number; height: number; font: string } | null;
  copyOpacity: string | null;
}

const MEASURE = (animationTime: number | null) => {
  const copy = document.querySelector('.lg-copy');
  if (copy && animationTime !== null) {
    const animations = copy.getAnimations();
    if (!animations.length) throw new Error('The shell copy reveal animation is missing.');
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = animationTime;
    }
  }
  const box = (el: Element | null) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: +r.top.toFixed(1), height: +r.height.toFixed(1) };
  };
  const header = document.querySelector('header');
  const bar = document.querySelector('[data-testid="league-tool-bar"]') ?? document.querySelector('.lg-bar');
  const h1 = document.querySelector('h1');
  return {
    rootFont: getComputedStyle(document.documentElement).fontSize,
    header: box(header),
    bar: box(bar),
    h1: h1 ? { ...box(h1)!, font: getComputedStyle(h1).fontSize } : null,
    copyOpacity: copy ? getComputedStyle(copy).opacity : null,
  } as Paint;
};

test('the static shell paints the app\'s header and tool bar', { tag: '@viewport' }, async ({ browser, baseURL }, info) => {
  const viewport = info.project.use.viewport ?? { width: 393, height: 852 };
  const scripts = await browser.newContext({ ...info.project.use, viewport, javaScriptEnabled: false });
  const shellPage = await scripts.newPage();
  await shellPage.goto(`${baseURL}/custom-gym-leader`, { waitUntil: 'domcontentloaded' });
  // Tracing and protocol delays can outlast the reveal delay. Sample the real
  // CSS animation timeline so host scheduling cannot change the measured state.
  const shell = await shellPage.evaluate(MEASURE, 80);
  expect(shell.copyOpacity, 'the copy is held back in the first 80ms').toBe('0');
  const revealed = await shellPage.evaluate(MEASURE, 1500);
  expect(revealed.copyOpacity, 'the copy shows after its reveal transition').toBe('1');
  await scripts.close();

  const app = await browser.newContext({ ...info.project.use, viewport });
  const appPage = await app.newPage();
  await appPage.goto(`${baseURL}/custom-gym-leader`);
  await appPage.waitForSelector('[data-testid="league-slot-0"]');
  await appPage.waitForTimeout(400);
  const mounted = await appPage.evaluate(MEASURE, null);
  await app.close();

  expect(shell.header, 'the shell has a header').not.toBeNull();
  expect(mounted.header, 'the app has a header').not.toBeNull();
  expect(Math.abs(shell.header!.height - mounted.header!.height), `header ${shell.header!.height} vs ${mounted.header!.height}`).toBeLessThanOrEqual(1);
  expect(Math.abs(shell.bar!.top - mounted.bar!.top), `tool bar top ${shell.bar!.top} vs ${mounted.bar!.top}`).toBeLessThanOrEqual(1);
  expect(Math.abs(shell.bar!.height - mounted.bar!.height), `tool bar ${shell.bar!.height} vs ${mounted.bar!.height}`).toBeLessThanOrEqual(1);
  expect(shell.h1!.font, 'the h1 is the eyebrow\'s size').toBe(mounted.h1!.font);
  expect(Math.abs(shell.h1!.top - mounted.h1!.top), `h1 top ${shell.h1!.top} vs ${mounted.h1!.top}`).toBeLessThanOrEqual(1.5);
  await info.attach('league-shell-paint', {
    body: JSON.stringify({ shellAt80ms: shell, shellAt1500ms: revealed, mounted }, null, 2),
    contentType: 'application/json',
  });
});
