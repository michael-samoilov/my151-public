import { expect, test, type Page } from '@playwright/test';

/**
 * Finding a Pokémon in the language you are reading it in.
 *
 * A localized name you cannot type is a name you cannot search for, so each
 * locale gets the affixes its keyboard actually produces: Hepburn romaji for
 * Japanese, jamo initials for Korean, pinyin and its initials for Chinese,
 * accent-free spellings for the Latin languages. The English slug stays
 * indexed everywhere — a Japanese user on a Latin keyboard typing `pikachu` is
 * the common case, not the exception.
 */

test.use({ viewport: { width: 1280, height: 900 } });

/** Pikachu, and how someone might reach it in each language. */
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

async function openBrowser(page: Page, locale: string) {
  await page.goto(`/?lang=${locale}`);
  await page.locator('[data-add-slot]').first().click();
  // The name catalog is a separate lazy chunk that resolves after the locale
  // does; until it lands only the English slug is searchable.
  await page.waitForTimeout(600);
}

test.describe('localized search', () => {
  for (const [locale, { queries }] of Object.entries(QUERIES)) {
    test(`${locale}: every way a person might type Pikachu finds it`, async ({ page }) => {
      await openBrowser(page, locale);
      const box = page.getByRole('textbox').first();

      for (const query of queries) {
        await box.fill(query);
        await page.waitForTimeout(200);
        const count = Number(
          await page.locator('[data-result-count]').first().getAttribute('data-result-count'),
        );
        expect(count, `"${query}" found nothing in ${locale}`).toBeGreaterThan(0);
      }
    });
  }

  test('accents never have to be typed', async ({ page }) => {
    // Flabébé in French, reached without reaching for the accents.
    await openBrowser(page, 'fr');
    const box = page.getByRole('textbox').first();
    await box.fill('flabebe');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-result-count]').first()).toHaveAttribute('data-result-count', '3');
  });

  test('a query that matches nothing still matches nothing', async ({ page }) => {
    // Guards the obvious failure of a too-eager index: if everything matched,
    // every assertion above would pass for the wrong reason.
    await openBrowser(page, 'ja');
    const box = page.getByRole('textbox').first();
    await box.fill('zzzznotapokemon');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-result-count]').first()).toHaveAttribute('data-result-count', '0');
  });
});
