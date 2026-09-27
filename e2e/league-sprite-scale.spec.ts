import { expect, test, type Page } from '@playwright/test';

/**
 * How the league summary draws its sprites on a desktop screen.
 *
 * On a Retina screen (2 device px per CSS px) the summary holds every sprite
 * at exactly 1x and keeps all 14 rows on screen. A short window takes the
 * height out of the summary's own spacing, and a taller one gives it back in
 * a fixed order: first the trimmed sprite box, then the spacing, then the
 * hint lines (`src/league/homeLayout.ts`). On a 1080p screen the summary
 * keeps today's layout and zoom, and smooths a sprite drawn below 1x.
 *
 * Both tests pin their own viewport and device pixel ratio, so they run once,
 * in the desktop project.
 */

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
    return {
      height: innerHeight,
      scaleMin: Math.min(...scales),
      scaleMax: Math.max(...scales),
      rendering: getComputedStyle(sprites[0]).imageRendering,
      rowsOnScreen: rows.filter((r) => r.top >= paneBox.top - 0.5 && r.bottom <= Math.min(paneBox.bottom, innerHeight) + 0.5).length,
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

test.describe('a Retina desktop', () => {
  test.use({ viewport: { width: 1470, height: 760 }, deviceScaleFactor: 2 });

  test('holds the sprites at 1x and spends each window height in order', async ({ page }, info) => {
    await openLeague(page);
    const steps: Awaited<ReturnType<typeof summary>>[] = [];
    for (let height = 760; height <= 1060; height += 20) {
      await page.setViewportSize({ width: 1470, height });
      await settle(page);
      steps.push(await summary(page));
    }
    await info.attach('sweep.json', { body: JSON.stringify(steps, null, 2), contentType: 'application/json' });

    // 760px is too short for even the tightest layout at 1x; the zoom takes
    // over there, and the rows still fit.
    for (const [i, s] of steps.entries()) {
      const at = `at ${s.height}px`;
      expect(s.rowsOnScreen, `every row on screen ${at}`).toBe(14);
      expect(s.paneScrolls, `no scroll ${at}`).toBe(false);
      if (s.height >= 800) {
        expect(s.scaleMin, `1x ${at}`).toBeCloseTo(1, 3);
        expect(s.scaleMax, `1x ${at}`).toBeCloseTo(1, 3);
      }
      if (s.bandRem > TIGHT_BAND_REM + 0.01) {
        expect(s.trimSourcePx, `the sprite box is whole before the spacing returns ${at}`).toBeLessThan(0.01);
      }
      if (s.hintLines > 0) {
        expect(s.bandRem, `the spacing is whole before a hint line returns ${at}`).toBeCloseTo(ROOMY_BAND_REM, 2);
      }
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
