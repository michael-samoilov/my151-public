import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

const QUERIES: Record<string, { display: string; queries: string[] }> = {
  en: { display: 'Pikachu', queries: ['pikachu', 'pika'] },
  ja: { display: 'ピカチュウ', queries: ['ピカチュウ', 'ピカ', 'pikachu', 'ＰＩＫＡ'] },
  ko: { display: '피카츄', queries: ['피카츄', 'ㅍㅋㅊ', 'pikachu'] },
  'zh-Hans': { display: '皮卡丘', queries: ['皮卡丘', 'pikaqiu', 'pkq', 'pikachu'] },
  'zh-Hant': { display: '皮卡丘', queries: ['皮卡丘', 'pikaqiu', 'pkq'] },
  fr: { display: 'Pikachu', queries: ['pikachu'] },
  de: { display: 'Pikachu', queries: ['pikachu'] },
  es: { display: 'Pikachu', queries: ['pikachu'] },
  it: { display: 'Pikachu', queries: ['pikachu'] },
};

interface LocalizedBrowser {
  search: Locator;
  results: Locator;
  count: Locator;
}

async function openBrowser(page: Page, locale: string, display: string): Promise<LocalizedBrowser> {
  await page.goto(`/pokedex-builder?lang=${locale}`);
  await page.locator('[data-add-slot]').first().click();
  const root = page.locator('div.border-l').filter({ has: page.locator('[data-result-count]') });
  const browser = {
    search: root.getByRole('textbox'),
    results: root.locator('.overflow-y-auto'),
    count: root.locator('[data-result-count]'),
  };
  await expect(browser.search).toBeVisible();
  await browser.search.fill('pikachu');
  await expect(browser.results.getByTestId('verify-evo-card').getByRole('img', { name: display, exact: true }).first()).toBeVisible();
  return browser;
}

async function expectLocalizedQuery(browser: LocalizedBrowser, query: string, display: string) {
  await browser.search.fill('zzzznotapokemon');
  await expect(browser.count).toHaveAttribute('data-result-count', '0');
  await browser.search.fill(query);
  const result = browser.results.getByTestId('verify-evo-card').getByRole('img', { name: display, exact: true }).first();
  await expect(result).toBeVisible();
  return result.getAttribute('alt');
}

test.describe('localized search', () => {
  for (const [locale, { display, queries }] of Object.entries(QUERIES)) {
    test(`${locale}: every way a person might type Pikachu finds it`, async ({ page }, testInfo) => {
      const browser = await openBrowser(page, locale, display);
      const observed: { query: string; species: string | null }[] = [];

      for (const query of queries) {
        observed.push({ query, species: await expectLocalizedQuery(browser, query, display) });
      }
      await testInfo.attach('localized-query-results', { body: JSON.stringify({ locale, observed }), contentType: 'application/json' });
    });
  }

  test('accents never have to be typed', async ({ page }, testInfo) => {
    const browser = await openBrowser(page, 'fr', QUERIES.fr.display);
    const species = await expectLocalizedQuery(browser, 'flabebe', 'Flabébé');
    await expect(browser.count).toHaveAttribute('data-result-count', '3');
    await testInfo.attach('accent-query-results', {
      body: JSON.stringify({ species, count: await browser.count.getAttribute('data-result-count') }), contentType: 'application/json',
    });
  });

  test('a query that matches nothing still matches nothing', async ({ page }, testInfo) => {
    const browser = await openBrowser(page, 'ja', QUERIES.ja.display);
    await browser.search.fill('zzzznotapokemon');
    await expect(browser.count).toHaveAttribute('data-result-count', '0');
    await testInfo.attach('no-match-query-results', {
      body: JSON.stringify({ count: await browser.count.getAttribute('data-result-count') }), contentType: 'application/json',
    });
  });
});
