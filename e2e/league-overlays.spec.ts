import { expect, test, type Locator, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

const seatLine = async (page: Page, query: string) => {
  await page.click('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
  await page.evaluate((q) => {
    const inputs = [...document.querySelectorAll('input')];
    const el = inputs[inputs.length - 1];
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await page.waitForTimeout(600);
  await page.click('[data-testid="verify-evo-card"]');
  await page.waitForTimeout(400);
};

async function overlayExtent(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const anchor = document.querySelector(sel)!;
    let node: HTMLElement | null = anchor as HTMLElement;
    let root: HTMLElement = anchor as HTMLElement;
    while (node) {
      if (getComputedStyle(node).position === 'fixed') root = node;
      node = node.parentElement;
    }
    const r = root.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, vw: window.innerWidth };
  }, selector);
}

/**
 * Every `position: fixed` element whose containing block is not the viewport.
 *
 * This is the defect's root rather than one of its symptoms. A transformed,
 * filtered or perspective ancestor becomes the containing block for its fixed
 * descendants, so the element stops measuring against the window — and the
 * league's mobile shell is one 200%-wide track that the camera translates, so
 * anything fixed inside it lands at twice the width and the wrong offset.
 * Checking the property itself catches an overlay nobody thought to measure.
 */
async function fixedUnderATransform(page: Page) {
  return page.evaluate(() => {
    const offenders: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      if (getComputedStyle(el).position !== 'fixed') continue;
      // Only things a person can see. dnd-kit parks a 1x1 clipped live region
      // inside whatever tree its context sits in, for screen readers; where
      // that lands cannot be wrong, because it is never painted.
      const box = el.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) continue;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const containing =
          style.transform !== 'none' ||
          style.perspective !== 'none' ||
          style.filter !== 'none' ||
          style.willChange.split(',').some((v) => ['transform', 'perspective', 'filter'].includes(v.trim()));
        if (!containing) continue;
        const name = el.getAttribute('data-overlay') !== null
          ? '[data-overlay]'
          : `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`;
        offenders.push(`${name} under ${parent.tagName.toLowerCase()}.${String(parent.className).split(' ')[0]}`);
        break;
      }
    }
    return offenders;
  });
}

async function overlayBoxes(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-overlay], [role="dialog"], [role="menu"]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.getAttribute('data-overlay') !== null ? 'overlay' : (el.getAttribute('role') ?? 'box'),
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        vw: window.innerWidth, vh: window.innerHeight,
      };
    }),
  );
}

test.describe('league overlays', { tag: '@viewport' }, () => {
  test('every picker opens onto the viewport, not the pane track', async ({ page }) => {
    await blankLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);

    const inside = (box: { left: number; right: number; vw: number }, what: string) => {
      expect(box.left, `${what} starts left of the viewport`).toBeGreaterThanOrEqual(-1);
      expect(box.right, `${what} runs past the viewport`).toBeLessThanOrEqual(box.vw + 1);
    };

    await page.click('[aria-label^="Gym type"]');
    await page.waitForSelector('svg[aria-label="No type"]');
    inside(await overlayExtent(page, 'svg[aria-label="No type"]'), 'the type picker');
    await page.click('svg[data-type="water"]');
    await page.waitForTimeout(300);

    await page.click('[data-testid="card-cell-1-1"]');
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    inside(await overlayExtent(page, '[data-filter-chip="my-dex"]'), 'the selection pane');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    await page.click('text=Pick a move');
    await page.waitForSelector('[data-testid="tm-filter-category"]');
    inside(await overlayExtent(page, '[data-testid="tm-filter-category"]'), 'the TM picker');
  });

  test('nothing the league can open escapes the viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'the pane track is the mobile shell');
    await blankLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.waitForTimeout(400);

    const measurements: Record<string, Awaited<ReturnType<typeof overlayBoxes>>> = {};
    const sweep = async (what: string, overlay: Locator, open: () => Promise<void>, close: () => Promise<void>) => {
      await open();
      await expect(overlay).toBeVisible();
      await page.waitForTimeout(600);
      expect(await fixedUnderATransform(page), `${what}: fixed under a transformed ancestor`).toEqual([]);
      const boxes = await overlayBoxes(page);
      for (const box of boxes) {
        expect(box.left, `${what}: ${box.tag} starts left of the viewport`).toBeGreaterThanOrEqual(-1);
        expect(box.right, `${what}: ${box.tag} runs past the viewport`).toBeLessThanOrEqual(box.vw + 1);
        expect(box.bottom, `${what}: ${box.tag} runs past the bottom`).toBeLessThanOrEqual(box.vh + 1);
      }
      measurements[what] = boxes;
      await close();
      await expect(overlay).toBeHidden();
    };

    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);

    const typePicker = page.locator('.fixed.inset-0')
      .filter({ has: page.getByText('Gym type', { exact: true }) })
      .filter({ has: page.locator('svg[aria-label="No type"]') });
    await sweep('type picker', typePicker, () => page.click('[aria-label^="Gym type"]'),
      () => typePicker.getByRole('button', { name: 'Close', exact: true }).click());

    const linePicker = page.getByRole('dialog', { name: 'Adding to Gym 1', exact: true });
    const myDex = linePicker.locator('[data-filter-chip="my-dex"]');
    await sweep('line picker', linePicker, async () => {
      await page.click('[data-testid="card-cell-1-1"]');
      await expect(myDex).toBeVisible();
    }, async () => {
      await linePicker.getByRole('button', { name: 'Adding to Gym 1', exact: true }).click();
      await expect(myDex).toBeHidden();
    });

    const tmPicker = page.getByRole('dialog', { name: 'TM for Gym 1', exact: true });
    const tmCategory = tmPicker.getByTestId('tm-filter-category');
    await sweep('TM picker', tmPicker, async () => {
      await page.click('text=Pick a move');
      await expect(tmCategory).toBeVisible();
    }, async () => {
      await tmPicker.getByRole('button', { name: 'TM for Gym 1', exact: true }).click();
      await expect(tmCategory).toBeHidden();
    });
    await testInfo.attach('overlay-viewport-boxes', { body: JSON.stringify(measurements), contentType: 'application/json' });
  });

  test('seating a line leaves the card inside the viewport', async ({ page }) => {
    await blankLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);
    await seatLine(page, 'chinchou');
    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth + 2);
  });
});
