import { expect, test, type Page } from '@playwright/test';
import { auditLayout } from '../support/layoutAudit';

/**
 * The feedback sheet, in every state it can actually be in.
 *
 * The bug this file was written for: the sheet fitted above the keyboard, every
 * element reported a bottom above the keyboard line, the spec was green — and
 * the textarea was drawn on top of the disclosure and the submit button. The
 * cause was a `min-h-0` that let the field's wrapper shrink past the field's own
 * floor. Bounds checks cannot see that. `auditLayout` can.
 *
 * The matrix is the point. A form has more states than the one it opens in, and
 * the keyboard-open ones are exactly the states nobody looks at while building,
 * because a desktop browser has no keyboard to raise.
 *
 * Lives under `e2e/dev/` with the rest of the specs that need `?tune`.
 */

/**
 * Heights the visible viewport takes with a keyboard up.
 *
 * `null` is no keyboard. 338 is an iPhone 15 Pro. 300 is a smaller phone or a
 * taller keyboard. 220 is below the form's measured 178px floor plus the sheet
 * header — it cannot fit, and the requirement there is that it scrolls rather
 * than overlaps. That last row is the one that would have caught this bug.
 */
const KEYBOARD_HEIGHTS = [null, 338, 300, 260, 220] as const;

/**
 * en is the baseline. de has the longest chip labels in the set, so it wraps to
 * the most rows and leaves the least for the field. ja is the CJK case, whose
 * line box is taller than Latin at the same font size.
 */
const LOCALES = ['en', 'de', 'ja'] as const;

/** Every locale the app ships, for the checks that have to hold in all of them. */
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
  await page.goto(`/?demo&tune&lang=${locale}`);
  // By attribute, not by accessible name: the name is translated, and a regex
  // of nine translations stops matching the first time one is reworded.
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
  await page.waitForTimeout(350);
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
    // Fitting is not the only requirement, and on its own it has a degenerate
    // solution: a `<textarea>` is a scroll container, so with no floor of its
    // own a flex column will happily compress it to nothing and report that
    // everything fits. It does fit. There is just nowhere left to type.
    //
    // Measured on the built layout: 110px at rest, 149 at an iPhone 15 Pro's
    // keyboard, 111 at 300, 71 at 260, and pinned to its 56px floor below about
    // 240 — where the sheet starts scrolling instead, which the matrix above
    // proves it does without overlapping anything.
    const FLOOR = 56;
    await openSheet(page, 'en');

    const fieldHeight = () =>
      page.getByRole('dialog').locator('textarea').evaluate((el) => el.getBoundingClientRect().height);

    expect(await fieldHeight(), 'the field is undersized with no keyboard').toBeGreaterThanOrEqual(90);

    for (const visible of [500, 400, 338, 300, 260, 220]) {
      await raiseKeyboard(page, visible);
      expect(
        await fieldHeight(),
        `the field collapsed below its floor with ${visible}px of viewport`,
      ).toBeGreaterThanOrEqual(FLOOR - 1);
    }

    // The floor is survival, not the target. On the phone this was reported
    // from, the field has to be worth typing into — five or six lines, not two
    // — and fitting alone was satisfied at two.
    await raiseKeyboard(page, 338);
    expect(
      await fieldHeight(),
      'the field is too cramped to read a message back on a 15 Pro',
    ).toBeGreaterThanOrEqual(140);

    // And it takes the room when there is room to take, rather than staying at
    // its four rows and leaving the space blank.
    await raiseKeyboard(page, 500);
    expect(await fieldHeight(), 'the field does not grow into spare space').toBeGreaterThan(150);
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
    // A second row of chips costs the field 38px, which is most of a line of
    // typing. Holding the row to one line is why there are four categories
    // rather than five and why the labels are nouns rather than sentences —
    // "Wrong translation" was "Erreur de traduction" in French and
    // "Übersetzungsfehler" in German, and both wrapped at every width.
    //
    // 390px is the check because that is a modern phone. It does not hold at
    // 320: nothing short of dropping the icons fits four chips there, and the
    // wrap is harmless — the field still clears its floor, and the matrix above
    // covers 320 for the faults that are not harmless. German is the tightest
    // pass and clears 390 by 10px, so a longer German label is the thing most
    // likely to break this.
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
    // Selecting a chip re-renders the row and can change how it wraps, which
    // changes how much is left for the field.
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
    // The disclosure is many lines of monospace context. Opened in the space a
    // keyboard leaves, it is the largest single thing in the sheet.
    await openSheet(page, 'en');
    await raiseKeyboard(page, 338);
    await page.getByRole('dialog').locator('details summary').click();
    await page.waitForTimeout(200);
    await expectClean(page, 'disclosure open');
  });

  test('a typed message and the failure notice keep the form clean', async ({ page }) => {
    // The failed state inserts a `role="alert"` paragraph the layout has never
    // had to make room for, in the tightest space it ever has.
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
    // A different shape entirely — an anchored card, not a sheet — so it needs
    // its own pass rather than being assumed to follow.
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSheet(page, 'de');
    await expectClean(page, 'desktop card');
  });
});

/**
 * The app's other overlays, held to the same standard.
 *
 * A harness that only covers the surface that happened to break is a
 * regression test wearing a harness's clothes. These share `BottomSheet` with
 * the feedback form, so they share its failure modes.
 */
test.describe('other overlays', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const locale of LOCALES) {
    test(`${locale}: the language picker is laid out cleanly`, async ({ page }) => {
      await page.goto(`/?demo&tune&lang=${locale}`);
      await page.getByRole('button', { name: /language|sprache|言語/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectClean(page, `${locale} language picker`);
    });
  }

  test('the language picker survives a keyboard being up', async ({ page }) => {
    // It has no field of its own, but a keyboard raised elsewhere and left up
    // still resizes every open sheet.
    await page.goto('/?demo&tune');
    await page.getByRole('button', { name: /language/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await raiseKeyboard(page, 300);
    await expectClean(page, 'language picker with keyboard');
  });
});
