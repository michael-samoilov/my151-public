import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const locales = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'fr', 'de', 'es', 'it'] as const;
const { forms: table } = JSON.parse(readFileSync('docs/i18n/sources/pokemon-formnames.json', 'utf8')) as {
  forms: Record<string, { species: string; names: Record<string, string> }>;
};

for (const locale of locales) {
  test(`picker form names use official ${locale} text in tooltip and accessible labels`, async ({ page }, testInfo) => {
    await page.goto(`/favorite-pokemon-picker?lang=${locale}`);
    await page.getByTestId('favorites-cell-legendary-6').click();
    const active = page.getByTestId('favorites-pick-716');
    const neutral = page.getByTestId('favorites-pick-11001');
    const hoopa = page.getByTestId('favorites-pick-10086');
    const activeMode = table['sv.zkn_form.ZKN_FORM_716_001'].names[locale];
    const neutralMode = table['sv.zkn_form.ZKN_FORM_716_000'].names[locale];
    const hoopaForm = table['sv.zkn_form.ZKN_FORM_720_001'].names[locale];
    await expect(active).toHaveAttribute('aria-label', new RegExp(activeMode));
    await expect(neutral).toHaveAttribute('aria-label', new RegExp(neutralMode));
    await expect(hoopa).toHaveAttribute('aria-label', new RegExp(hoopaForm));
    const label = (await hoopa.getAttribute('aria-label'))!;
    await expect(hoopa.getByRole('img', { name: label, exact: true })).toHaveAttribute('alt', label);
    await hoopa.hover();
    await expect(page.getByRole('tooltip')).toHaveText(label);
    await testInfo.attach('official-form-labels.json', {
      body: JSON.stringify({ locale, active: await active.getAttribute('aria-label'), neutral: await neutral.getAttribute('aria-label'), hoopa: label }),
      contentType: 'application/json',
    });
  });
}

test('picker identity shifts retain the correct localized species', async ({ page }, testInfo) => {
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-cell-ground-8').click();
  const yamask = page.getByTestId('favorites-pick-10178');
  const stunfisk = page.getByTestId('favorites-pick-10179');
  await expect(yamask).toHaveAttribute('aria-label', 'Galarian Yamask');
  await expect(stunfisk).toHaveAttribute('aria-label', 'Galarian Stunfisk');
  await testInfo.attach('shifted-species.json', {
    body: JSON.stringify({ yamask: await yamask.getAttribute('aria-label'), stunfisk: await stunfisk.getAttribute('aria-label') }),
    contentType: 'application/json',
  });
});

test('picker awaits form overlays before switching language and reuses loaded locales', async ({ page }, testInfo) => {
  await page.goto('/favorite-pokemon-picker?lang=en');
  await page.getByTestId('favorites-cell-legendary-6').click();
  const neutral = page.getByTestId('favorites-pick-11001');
  const english = (await neutral.getAttribute('aria-label'))!;
  await neutral.click();
  const image = page.getByTestId('favorites-cell-legendary-6').locator('img');
  let release!: () => void;
  let intercepted!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const arrived = new Promise<void>(resolve => { intercepted = resolve; });
  await page.route(/\/assets\/ja-[^/]+\.js$/, async route => {
    const response = await route.fetch();
    if ((await response.text()).includes('11001')) {
      intercepted();
      await gate;
    }
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: /language/i }).click();
  await page.getByRole('menuitemradio', { name: '日本語' }).click();
  await arrived;
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(image).toHaveAttribute('alt', english);
  release();
  const japanese = table['sv.zkn_form.ZKN_FORM_716_000'].names.ja;
  await expect(image).toHaveAttribute('alt', new RegExp(japanese));
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  for (const endonym of ['English', '日本語']) {
    await page.locator('button[aria-haspopup="menu"]').filter({ has: page.locator('svg.lucide-globe') }).click();
    await page.getByRole('menuitemradio', { name: endonym, exact: true }).click();
    await expect(image).toHaveAttribute('alt', endonym === 'English' ? english : new RegExp(japanese));
  }
  await testInfo.attach('awaited-overlay-switch.json', {
    body: JSON.stringify({ whileOverlayPending: english, final: await image.getAttribute('alt'), cachedLocaleRoundTrip: true }),
    contentType: 'application/json',
  });
});
