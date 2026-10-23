import { expect, test } from '@playwright/test';

const RECORDER = () => {
  (window as { __labels?: string[] }).__labels = [];
  const tick = () => {
    const el = document.querySelector<HTMLElement>('[data-i18n-exempt="pokemon-name"]');
    if (el) {
      const text = el.innerText.replace(/\s+/g, ' ').trim();
      const log = (window as { __labels?: string[] }).__labels!;
      if (text && (!log.length || log[log.length - 1] !== text)) log.push(text);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const labels = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as { __labels?: string[] }).__labels ?? []);

const looksLikeASlug = (text: string) => /^[a-z0-9-]+$/.test(text);

test.describe('name flash', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  for (const locale of ['en', 'ja', 'it'] as const) {
    test(`${locale}: no slug is shown on the way to the real names`, async ({ page }) => {
      await page.goto(`/pokedex-builder?lang=${locale}&demo=151`);
      await expect(page.locator('[data-i18n-exempt="pokemon-name"]').first()).toBeAttached();

      await page.addInitScript(RECORDER);
      await page.goto(`/pokedex-builder?lang=${locale}&demo=151`);
      await expect
        .poll(async () => (await labels(page)).length, { timeout: 20_000 })
        .toBeGreaterThan(0);
      await page.waitForTimeout(1500);

      const seen = await labels(page);
      expect(seen.filter(looksLikeASlug), `${locale} flashed a slug: ${seen.join(' -> ')}`).toEqual([]);
      expect(seen, `${locale} rewrote its labels: ${seen.join(' -> ')}`).toHaveLength(1);
    });
  }

  test('switching language goes straight to the new names', async ({ page }) => {
    await page.goto('/pokedex-builder?lang=en&demo=151');
    await expect(page.locator('[data-i18n-exempt="pokemon-name"]').first()).toBeAttached();
    await page.evaluate(RECORDER);

    await page.getByRole('button', { name: /language/i }).click();
    await page.getByRole('menuitemradio', { name: /日本語/ }).click();
    await expect
      .poll(async () => (await labels(page)).length, { timeout: 20_000 })
      .toBeGreaterThan(1);
    await page.waitForTimeout(1000);

    const seen = await labels(page);
    expect(seen.filter(looksLikeASlug), `flashed a slug: ${seen.join(' -> ')}`).toEqual([]);
    expect(seen, `expected one clean change, got: ${seen.join(' -> ')}`).toHaveLength(2);
  });

  test('a name that has not arrived renders a placeholder, never a slug', async ({ page }) => {
    let held = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/i18n/names/**', async (route) => {
      held += 1;
      await gate;
      await route.continue();
    });
    await page.goto('/pokedex-builder?lang=en&demo=151');

    const label = page.locator('[data-i18n-exempt="pokemon-name"]').first();
    await expect(label).toBeAttached({ timeout: 20_000 });

    const state = await label.evaluate((el: HTMLElement) => ({
      text: el.innerText.replace(/\s+/g, ' ').trim(),
      skeleton: !!el.querySelector('[data-name-skeleton]'),
      busy: el.getAttribute('aria-busy'),
      title: el.getAttribute('title'),
      aria: el.getAttribute('aria-label'),
    }));

    expect(held, 'the name catalog was never held, so nothing was tested').toBeGreaterThan(0);
    expect(state.skeleton, `expected a placeholder, got "${state.text}"`).toBe(true);
    expect(state.text, 'the placeholder is not empty of text').toBe('');
    expect(state.busy, 'a loading label should report itself busy').toBe('true');
    expect(state.title, 'the slug leaked into the tooltip').toBeNull();
    expect(state.aria, 'the slug leaked into the accessible name').toBeNull();

    release();
    await expect(label).not.toHaveText('', { timeout: 15_000 });
    const settled = (await label.innerText()).replace(/\s+/g, ' ').trim();
    expect(looksLikeASlug(settled), `settled on a slug: ${settled}`).toBe(false);
  });
});
