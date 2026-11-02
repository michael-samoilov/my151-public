import { expect, test, type Page } from '@playwright/test';

function summary(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-lg-league-root]')!;
    const pane = root.closest('[data-lg-viewport]')!;
    const fit = root.parentElement!;
    const remPx = Number(getComputedStyle(fit).zoom) * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const paneBox = pane.getBoundingClientRect();
    const sprites = [...root.querySelectorAll('img')].filter((i) => i.src.includes('/sprites/pokemon/'));
    const scales = sprites.map((i) => (i.getBoundingClientRect().width * devicePixelRatio) / i.naturalWidth);
    const rows = [...Array(14)].map((_, i) =>
      document.querySelector(`[data-testid="league-slot-${i}"]`)!.getBoundingClientRect());
    const sprite = sprites[0].getBoundingClientRect();
    const spriteBox = sprites[0].parentElement!.getBoundingClientRect();
    const visibleBottom = Math.min(paneBox.bottom, innerHeight) + 0.5;
    return {
      height: innerHeight,
      zoom: Number(getComputedStyle(fit).zoom),
      scaleMin: Math.min(...scales),
      scaleMax: Math.max(...scales),
      rendering: getComputedStyle(sprites[0]).imageRendering,
      rowsOnScreen: rows.filter((r) => r.top >= paneBox.top - 0.5 && r.bottom <= visibleBottom).length,
      spritesOnScreen: sprites.every((i) => i.getBoundingClientRect().bottom <= visibleBottom),
      cardOnScreen: root.getBoundingClientRect().bottom <= visibleBottom,
      paneScrolls: pane.scrollHeight > pane.clientHeight + 1,
      trimSourcePx: (Math.max(0, (sprite.height - spriteBox.height) / 2) * sprites[0].naturalWidth) / sprite.width,
      bandRem: (root.children[0].firstElementChild as HTMLElement).getBoundingClientRect().height / remPx,
      hintLines: fit.querySelectorAll('[data-fit-tail] > div').length,
    };
  });
}

async function openLeague(page: Page) {
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-13"]');
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('[data-lg-league-root] img')] as HTMLImageElement[];
    return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  });
}

const settle = (page: Page) => page.waitForTimeout(500);
const TIGHT_BAND_REM = 0.875;
const ROOMY_BAND_REM = 1.25;
const FLOOR = 0.55;

type Step = Awaited<ReturnType<typeof summary>>;

async function sweep(page: Page, width: number, heights: number[]) {
  const steps: Step[] = [];
  for (const height of heights) {
    await page.setViewportSize({ width, height });
    await settle(page);
    steps.push(await summary(page));
  }
  return steps;
}

const heights = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

function expectStagesInOrder(s: Step) {
  const at = `at ${s.height}px`;
  if (s.bandRem > TIGHT_BAND_REM + 0.01) {
    expect(s.trimSourcePx, `the sprite box is whole before the spacing returns ${at}`).toBeLessThan(0.01);
  }
  if (s.hintLines > 0) {
    expect(s.bandRem, `the spacing is whole before a hint line returns ${at}`).toBeCloseTo(ROOMY_BAND_REM, 2);
  }
}

function expectHeldAtTheFloor(down: Step[], up: Step[]) {
  for (const [i, s] of [...down, ...up].entries()) {
    const at = `at ${s.height}px`;
    expect(s.rowsOnScreen, `every row on screen ${at}`).toBe(14);
    expect(s.spritesOnScreen, `every sprite on screen ${at}`).toBe(true);
    expect(s.cardOnScreen, `the card's bottom edge on screen ${at}`).toBe(true);
    expect(s.zoom, `the zoom never goes below its floor ${at}`).toBeGreaterThanOrEqual(FLOOR - 1e-6);
    if (s.zoom > FLOOR + 1e-3) {
      expect(s.hintLines, `a zoom above the floor keeps both hint lines ${at}`).toBe(2);
      expect(s.bandRem, `and today's spacing ${at}`).toBeCloseTo(ROOMY_BAND_REM, 2);
    }
    expectStagesInOrder(s);
    if (i > 0 && i < down.length) {
      expect(s.trimSourcePx, `a shorter window never trims less ${at}`).toBeGreaterThanOrEqual(down[i - 1].trimSourcePx - 1e-6);
    }
  }
  const top = down[0];
  const back = up.at(-1)!;
  expect(top.zoom, 'the tallest window zooms above the floor').toBeGreaterThan(FLOOR + 0.02);
  expect(down.at(-1)!.trimSourcePx, 'the shortest window trims the sprite box').toBeGreaterThan(1);
  expect(back.height).toBe(top.height);
  expect(back.hintLines, 'back at the top, both hint lines return').toBe(2);
  expect(back.zoom, 'and the zoom returns').toBeCloseTo(top.zoom, 1);
}

test.describe('a Retina desktop', () => {
  test.use({ viewport: { width: 1470, height: 760 }, deviceScaleFactor: 2 });

  test('holds the sprites at 1x and spends each window height in order', async ({ page }, info) => {
    await openLeague(page);
    const steps = await sweep(page, 1470, heights(760, 1060, 20));
    await info.attach('sweep.json', { body: JSON.stringify(steps, null, 2), contentType: 'application/json' });

    for (const [i, s] of steps.entries()) {
      const at = `at ${s.height}px`;
      expect(s.rowsOnScreen, `every row on screen ${at}`).toBe(14);
      expect(s.paneScrolls, `no scroll ${at}`).toBe(false);
      if (s.height >= 800) {
        expect(s.scaleMin, `1x ${at}`).toBeCloseTo(1, 3);
        expect(s.scaleMax, `1x ${at}`).toBeCloseTo(1, 3);
      }
      expectStagesInOrder(s);
      if (i > 0) {
        expect(s.trimSourcePx, `a taller window never trims more ${at}`).toBeLessThanOrEqual(steps[i - 1].trimSourcePx + 1e-6);
      }
    }
    expect(steps.find((s) => s.height === 800)!.trimSourcePx, 'a short window trims the sprite box').toBeGreaterThan(1);
    expect(steps.at(-1)!.hintLines, 'a tall window has both hint lines').toBe(2);
  });

  test('follows the window to a 1080p screen and back', async ({ page, context }, info) => {
    await page.setViewportSize({ width: 1440, height: 790 });
    await openLeague(page);
    await settle(page);
    const cdp = await context.newCDPSession(page);
    const moveTo = async (deviceScaleFactor: number) => {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 790, deviceScaleFactor, mobile: false });
      // platform: Device-scale emulation sends no resolution media query change event, so the test also dispatches the resize the app listens for.
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await settle(page);
      return summary(page);
    };
    const retina = await summary(page);
    const standard = await moveTo(1);
    const back = await moveTo(2);
    await info.attach('screens.json', { body: JSON.stringify({ retina, standard, back }, null, 2), contentType: 'application/json' });

    expect(retina.scaleMin).toBeCloseTo(1, 3);
    expect(retina.trimSourcePx, 'a 790px Retina window trims the sprite box').toBeGreaterThan(1);
    expect(standard.scaleMax, '1080p zooms below 1x').toBeLessThan(1);
    expect(standard.rendering, 'and smooths the sprites there').toBe('auto');
    expect(standard.trimSourcePx, 'with the layout untrimmed').toBeLessThan(0.01);
    expect(standard.hintLines).toBe(2);
    expect(back.scaleMin, 'back on Retina, 1x again').toBeCloseTo(1, 3);
    expect(back.rowsOnScreen).toBe(14);
  });
});

async function cardSprites(page: Page, sizes: number[][]) {
  await openLeague(page);
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('[data-lg-card-root] img')] as HTMLImageElement[];
    return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  });
  const steps = [];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await settle(page);
    steps.push(await page.evaluate(() => {
      const card = document.querySelector('[data-lg-card-root]')!;
      const pane = card.closest('[data-lg-viewport]')!;
      const scales = [...card.querySelectorAll('img')]
        .filter((i) => i.src.includes('/sprites/pokemon/'))
        .map((i) => (i.getBoundingClientRect().width * devicePixelRatio) / i.naturalWidth);
      const hints = card.parentElement!.querySelector<HTMLElement>('[data-fit-tail]');
      const lastLine = hints ? [...hints.querySelectorAll('span')].at(-1)! : null;
      return {
        size: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
        scales: [...new Set(scales.map((s) => +s.toFixed(4)))],
        overflow: pane.scrollHeight - pane.clientHeight,
        cardHeight: card.getBoundingClientRect().height,
        hints: !!hints && hints.offsetHeight > 0,
        hintsPastEdge: lastLine ? lastLine.getBoundingClientRect().bottom - pane.getBoundingClientRect().bottom : 0,
      };
    }));
  }
  return steps;
}

function expectWholeAndInPane(steps: Awaited<ReturnType<typeof cardSprites>>) {
  for (const s of steps) {
    expect(s.overflow, `the pane scrolls 10% of the card or less at ${s.size}`).toBeLessThanOrEqual(0.1 * s.cardHeight + 1);
    if (s.hints) {
      expect(s.hintsPastEdge, `the hint lines are whole on screen at ${s.size}`).toBeLessThanOrEqual(0);
      expect(s.overflow, `and the pane does not scroll for them at ${s.size}`).toBe(0);
    }
    for (const scale of s.scales) {
      expect(scale, `a whole multiple of 1x at ${s.size}`).toBeGreaterThanOrEqual(1 - 1e-3);
      expect(Math.abs(scale - Math.round(scale)), `${scale}x is whole at ${s.size}`).toBeLessThan(1e-3);
    }
  }
}

test.describe('a Retina desktop with a gym card open', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });

  test('draws every card sprite at whole device pixels, with the hint lines only where they fit', async ({ page }, info) => {
    const steps = await cardSprites(page, [[1920, 1080], [1440, 900], [1440, 812], [1440, 790]]);
    await info.attach('card-sprites.json', { body: JSON.stringify(steps, null, 2), contentType: 'application/json' });
    expectWholeAndInPane(steps);
    expect(steps.find((s) => s.size.startsWith('1440x900'))!.hints, 'a pane with room shows the hint lines').toBe(true);
    expect(steps.find((s) => s.size.startsWith('1440x790'))!.hints, 'a pane without room hides them').toBe(false);
  });
});

test.describe('a 2560x1440 monitor at 1x with a gym card open', () => {
  test.use({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });

  test('draws every card sprite at whole device pixels, with the pane scrolling 10% at most', async ({ page }, info) => {
    const steps = await cardSprites(page, [[2560, 1440]]);
    await info.attach('card-sprites.json', { body: JSON.stringify(steps, null, 2), contentType: 'application/json' });
    expectWholeAndInPane(steps);
  });
});

test.describe('a short phone', () => {
  test.use({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('gives up its spacing at the zoom floor and keeps every row on screen', async ({ page }, info) => {
    await openLeague(page);
    const down = await sweep(page, 320, heights(568, 418, -10));
    const up = await sweep(page, 320, heights(438, 568, 26));
    await info.attach('sweep.json', { body: JSON.stringify({ down, up }, null, 2), contentType: 'application/json' });
    expectHeldAtTheFloor(down, up);
  });
});

test.describe('a short 1080p window', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test('gives up its spacing at the zoom floor and keeps every row on screen', async ({ page }, info) => {
    await openLeague(page);
    const down = await sweep(page, 1280, heights(720, 540, -20));
    const up = await sweep(page, 1280, heights(570, 720, 30));
    await info.attach('sweep.json', { body: JSON.stringify({ down, up }, null, 2), contentType: 'application/json' });
    expectHeldAtTheFloor(down, up);
    for (const s of [...down, ...up].filter((s) => s.zoom <= FLOOR + 1e-3)) {
      expect(s.paneScrolls, `no scroll at ${s.height}px`).toBe(false);
    }
  });
});
