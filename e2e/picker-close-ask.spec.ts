import { expect, test, type Page } from '@playwright/test';

const STORE_KEY = 'personal-151-pokedex-v3';
const SEED = JSON.stringify({
  state: {
    sections: { starter: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    milestoneMax: 9,
    milestoneCelebrated: [],
    localeNoticeSeen: true,
    locale: 'en',
  },
  version: 10,
});

const birds = (page: Page) =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? ((JSON.parse(raw).state.sections['early-bird'] as number[] | undefined)?.length ?? 0) : 0;
  }, STORE_KEY);

test.describe('mobile picker close', { tag: '@viewport' }, () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'the picker is a side pane at 1024px and up');

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await page.addInitScript(([k, v]) => {
      if (sessionStorage.getItem('close-ask-seeded')) return;
      sessionStorage.setItem('close-ask-seeded', '1');
      localStorage.setItem(k, v);
      localStorage.setItem('p151-league-promo-seen', '1');
      localStorage.setItem('p151-moved-notice-seen', '1');
    }, [STORE_KEY, SEED] as const);
    await page.goto('/pokedex-builder');
    await page.locator('[data-section-id="early-bird"] [data-add-slot]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  const sheet = (page: Page) => page.getByRole('dialog');
  const question = (page: Page) => page.getByRole('alertdialog');
  const tapScrim = async (page: Page) => {
    await page.mouse.click(page.viewportSize()!.width / 2, 20);
  };
  const stageFirstLine = async (page: Page) => {
    await sheet(page).getByTestId('verify-evo-card').first().click();
  };

  test('a close with picks staged asks; Escape keeps them, Add places them', async ({ page }, testInfo) => {
    await stageFirstLine(page);
    await tapScrim(page);
    await expect(question(page)).toBeVisible();
    await expect(sheet(page)).toBeVisible();
    const staged = Number(/\d+/.exec((await question(page).textContent()) ?? '')?.[0]);
    const placedWhileAsking = await birds(page);

    await page.keyboard.press('Escape');
    await expect(question(page)).toBeHidden();
    await expect(sheet(page)).toBeVisible();

    await tapScrim(page);
    await expect(question(page)).toBeVisible();
    await question(page).getByRole('button').last().click();
    await expect(sheet(page)).toBeHidden();
    const placed = await birds(page);

    const measured = { viewport: page.viewportSize(), staged, placedWhileAsking, placed };
    await testInfo.attach('close-ask-add.json', { body: JSON.stringify(measured, null, 2), contentType: 'application/json' });
    expect(staged).toBeGreaterThan(0);
    expect(placedWhileAsking).toBe(0);
    expect(placed).toBe(staged);
  });

  test('Discard closes the picker and places nothing', async ({ page }, testInfo) => {
    await stageFirstLine(page);
    await tapScrim(page);
    await expect(question(page)).toBeVisible();
    await question(page).getByRole('button').first().click();
    await expect(sheet(page)).toBeHidden();
    const placed = await birds(page);

    await page.locator('[data-section-id="early-bird"] [data-add-slot]').click();
    await expect(sheet(page)).toBeVisible();
    await tapScrim(page);
    await expect(sheet(page)).toBeHidden();
    const askedOnReopen = await question(page).isVisible();

    await testInfo.attach('close-ask-discard.json', {
      body: JSON.stringify({ viewport: page.viewportSize(), placed, askedOnReopen }, null, 2),
      contentType: 'application/json',
    });
    expect(placed).toBe(0);
    expect(askedOnReopen).toBe(false);
  });

  test('with nothing staged, a close just closes', async ({ page }, testInfo) => {
    await tapScrim(page);
    await expect(sheet(page)).toBeHidden();
    const asked = await question(page).isVisible();
    await testInfo.attach('close-ask-none.json', {
      body: JSON.stringify({ viewport: page.viewportSize(), asked, placed: await birds(page) }, null, 2),
      contentType: 'application/json',
    });
    expect(asked).toBe(false);
  });
});
