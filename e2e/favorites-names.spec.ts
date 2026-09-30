import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const locales = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'fr', 'de', 'es', 'it'] as const;
const { forms: table } = JSON.parse(readFileSync('docs/i18n/sources/pokemon-formnames.json', 'utf8')) as {
  forms: Record<string, { species: string; names: Record<string, string> }>;
};

for (const locale of locales) {
  test(`picker form names use official ${locale} text in tooltip and accessible labels`, async ({ page }, testInfo) => {
    await page.goto(`/favorite-pokemon-by-type?lang=${locale}`);
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
    await expect(hoopa.locator('img')).toHaveAttribute('alt', label);
    await hoopa.hover();
    await expect(page.getByRole('tooltip')).toHaveText(label);
    await testInfo.attach('official-form-labels.json', {
      body: JSON.stringify({ locale, active: await active.getAttribute('aria-label'), neutral: await neutral.getAttribute('aria-label'), hoopa: label }),
      contentType: 'application/json',
    });
  });
}

test('picker identity shifts retain the correct localized species', async ({ page }, testInfo) => {
  await page.goto('/favorite-pokemon-by-type?lang=en');
  await page.getByTestId('favorites-cell-ground-8').click();
  const yamask = page.getByTestId('favorites-pick-10179');
  const stunfisk = page.getByTestId('favorites-pick-10180');
  await expect(yamask).toHaveAttribute('aria-label', 'Yamask — Galarian Form');
  await expect(stunfisk).toHaveAttribute('aria-label', 'Stunfisk — Galarian Form');
  await testInfo.attach('shifted-species.json', {
    body: JSON.stringify({ yamask: await yamask.getAttribute('aria-label'), stunfisk: await stunfisk.getAttribute('aria-label') }),
    contentType: 'application/json',
  });
});
