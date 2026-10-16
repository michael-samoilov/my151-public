import { expect, test, type Page } from '@playwright/test';
import { auditLayout } from '../support/layoutAudit';

const KEYBOARD_HEIGHTS = [null, 338, 300, 260, 220] as const;

const LOCALES = ['en', 'de', 'ja'] as const;

const ALL_LOCALES = [
  'en',
  'ja',
  'ko',
  'zh-Hans',
  'zh-Hant',
  'fr',
  'de',
  'es',
  'it',
] as const;

async function openSheet(page: Page, locale: string) {
  await page.goto(`/pokedex-builder?demo&lang=${locale}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('lang', locale, { timeout: 15_000 });
  await page.locator('[data-feedback-open]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Report the keyboard the way iOS does: a shorter visual viewport, and a scale
 *  that is fractionally off 1 rather than exactly 1. */
async function raiseKeyboard(page: Page, visible: number | null) {
  if (visible === null) return;
  await page.evaluate((v) => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, 'height', { value: v, configurable: true });
    Object.defineProperty(vv, 'scale', { value: 0.9999999403953552, configurable: true });
    vv.dispatchEvent(new Event('resize'));
  }, visible);
  await expect
    .poll(() =>
      page.locator('[data-overlay]').evaluate((el) =>
        Math.round(el.getBoundingClientRect().height),
      ),
    )
    .toBe(visible);
}

async function expectClean(page: Page, state: string) {
  const problems = await auditLayout(page, '[role="dialog"]');
  expect(problems.map((p) => `${p.kind}: ${p.detail}`), `${state} is not laid out cleanly`).toEqual(
    [],
  );
}

test.describe('feedback sheet layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const locale of LOCALES) {
    for (const visible of KEYBOARD_HEIGHTS) {
      const label = visible === null ? 'no keyboard' : `keyboard leaves ${visible}px`;

      test(`${locale} · ${label}`, async ({ page }) => {
        await openSheet(page, locale);
        await raiseKeyboard(page, visible);
        await expectClean(page, `${locale} · ${label}`);
      });
    }
  }

  test('the field keeps a usable height at every keyboard height', async ({ page }) => {
    const FLOOR = 56;
    await openSheet(page, 'en');

    const fieldHeight = () =>
      page.getByRole('dialog').locator('textarea').evaluate((el) => el.getBoundingClientRect().height);
    const fieldLines = () =>
      page.getByRole('dialog').locator('textarea').evaluate((el) => {
        const style = getComputedStyle(el);
        const innerHeight =
          el.getBoundingClientRect().height
          - Number.parseFloat(style.paddingTop)
          - Number.parseFloat(style.paddingBottom);
        return innerHeight / Number.parseFloat(style.lineHeight);
      });

    expect(await fieldHeight(), 'the field is undersized with no keyboard').toBeGreaterThanOrEqual(90);

    for (const visible of [500, 400, 338, 300, 260, 220]) {
      await raiseKeyboard(page, visible);
      expect(
        await fieldHeight(),
        `the field collapsed below its floor with ${visible}px of viewport`,
      ).toBeGreaterThanOrEqual(FLOOR - 1);
    }

    await raiseKeyboard(page, 338);
    await expect
      .poll(fieldLines, {
        message: 'the field is too cramped to read a message back on a 15 Pro',
      })
      .toBeGreaterThanOrEqual(4.9);

    await raiseKeyboard(page, 500);
    await expect
      .poll(fieldHeight, { message: 'the field does not grow into spare space' })
      .toBeGreaterThan(150);
  });

  test('scrolling the field does not drag the page under the sheet', async ({ page }) => {
    // Reported from a real phone: dragging inside the field to read back what
    // you had typed scrolled nothing, then pulled the whole sheet off the
    // bottom of the screen. A textarea is a scroll container, so once its own
    // scroll ends iOS hands the rest of the gesture to the nearest ancestor
    // that can take it — the document, which the sheet is positioned against.
    //
    // Chromium will not reproduce the chaining, but the property that stops it
    // is exactly testable, the same way the 16px font-size check stands in for
    // a zoom this engine never performs.
    await openSheet(page, 'en');
    await raiseKeyboard(page, 338);
    const behaviour = await page
      .getByRole('dialog')
      .locator('textarea')
      .evaluate((el) => getComputedStyle(el).overscrollBehaviorY);
    expect(behaviour, 'the field chains its scroll into the page').toBe('contain');
  });

  test('the category chips stay on one row at phone width', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const locale of ALL_LOCALES) {
      await openSheet(page, locale);
      const rows = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('[role="dialog"] form > div');
        if (!row) throw new Error('no chip row found');
        const tops = Array.from(row.children).map((c) =>
          Math.round(c.getBoundingClientRect().top),
        );
        return new Set(tops).size;
      });
      expect(rows, `the ${locale} chips wrap onto ${rows} rows at 390px`).toBe(1);
    }
  });

  test('every category chip keeps the form clean', async ({ page }) => {
    await openSheet(page, 'de');
    await raiseKeyboard(page, 300);
    const chips = page.getByRole('dialog').locator('button[aria-pressed]');
    const count = await chips.count();
    expect(count, 'no category chips found').toBeGreaterThan(1);
    for (let i = 0; i < count; i++) {
      await chips.nth(i).click();
      await page.waitForTimeout(120);
      await expectClean(page, `category ${i}`);
    }
  });

  test('expanding "what gets sent" keeps the form clean', async ({ page }) => {
    await openSheet(page, 'en');
    await raiseKeyboard(page, 338);
    await page.getByRole('dialog').locator('details summary').click();
    await page.waitForTimeout(200);
    await expectClean(page, 'disclosure open');
  });

  test('a typed message and the failure notice keep the form clean', async ({ page }) => {
    await page.route('**/api/feedback', (route) => route.fulfill({ status: 500, body: '{}' }));
    await openSheet(page, 'en');
    await raiseKeyboard(page, 338);

    const field = page.getByRole('dialog').locator('textarea');
    await field.fill('The type badge on Pikachu shows the wrong word in German, it reads as English.');
    await expectClean(page, 'long message typed');

    await page.getByRole('dialog').locator('button[type="submit"]').click();
    await expect(page.getByRole('dialog').locator('[role="alert"]')).toBeVisible();
    await expectClean(page, 'send failed');
  });

  test('the thank-you state keeps the form clean', async ({ page }) => {
    await page.route('**/api/feedback', (route) =>
      route.fulfill({ status: 200, body: '{"ok":true}' }),
    );
    await openSheet(page, 'en');
    await raiseKeyboard(page, 338);
    await page.getByRole('dialog').locator('textarea').fill('Everything works, thank you.');
    await page.getByRole('dialog').locator('button[type="submit"]').click();
    await page.waitForTimeout(300);
    await expectClean(page, 'sent');
  });

  test('the desktop card is laid out too', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSheet(page, 'de');
    await expectClean(page, 'desktop card');
  });

  test('the desktop card opens beside the control that opened it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSheet(page, 'en');

    const box = await page.evaluate(() => {
      const card = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
      const anchor = document.querySelector('[data-feedback-open]')!.getBoundingClientRect();
      return {
        dx: card.right - anchor.right,
        dy: card.top - anchor.bottom,
        inside:
          card.left >= 0 &&
          card.top >= 0 &&
          card.right <= window.innerWidth &&
          card.bottom <= window.innerHeight,
      };
    });

    expect(Math.abs(box.dx), 'the card is not aligned to the icon').toBeLessThanOrEqual(2);
    expect(box.dy, 'the card is not directly under the icon').toBeGreaterThanOrEqual(0);
    expect(box.dy, 'the card is not directly under the icon').toBeLessThanOrEqual(16);
    expect(box.inside, 'the card hangs outside the viewport').toBe(true);
  });

  test('the desktop card has a close button that dismisses it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSheet(page, 'en');
    await page.locator('[data-feedback-close]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the desktop chips stay on one row', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });

    for (const locale of ALL_LOCALES) {
      await openSheet(page, locale);
      const rows = await page.evaluate(() => {
        const row = document.querySelector<HTMLElement>('[role="dialog"] form > div');
        if (!row) throw new Error('no chip row found');
        return new Set(Array.from(row.children).map((c) => Math.round(c.getBoundingClientRect().top)))
          .size;
      });
      expect(rows, `the ${locale} chips wrap onto ${rows} rows on desktop`).toBe(1);
    }
  });
});

test.describe('other overlays', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const locale of LOCALES) {
    test(`${locale}: the language picker is laid out cleanly`, async ({ page }) => {
      await page.goto(`/pokedex-builder?demo&lang=${locale}`);
      await page.getByRole('button', { name: /language|sprache|言語/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectClean(page, `${locale} language picker`);
    });
  }

  test('the language picker survives a keyboard being up', async ({ page }) => {
    await page.goto('/pokedex-builder?demo');
    await page.getByRole('button', { name: /language/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await raiseKeyboard(page, 300);
    await expectClean(page, 'language picker with keyboard');
  });
});
