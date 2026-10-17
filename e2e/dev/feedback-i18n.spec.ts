import { expect, test, type Page } from '@playwright/test';

const CHIPS: Record<string, { bug: string; translation: string; idea: string; other: string }> = {
  en: { bug: 'Bug', translation: 'Translation', idea: 'Idea', other: 'Other' },
  ja: { bug: '不具合', translation: '誤訳', idea: '提案', other: 'その他' },
  ko: { bug: '버그', translation: '번역', idea: '제안', other: '기타' },
  'zh-Hans': { bug: '程序错误', translation: '翻译', idea: '建议', other: '其他' },
  'zh-Hant': { bug: '程式錯誤', translation: '翻譯', idea: '建議', other: '其他' },
  fr: { bug: 'Bug', translation: 'Traduction', idea: 'Idée', other: 'Autre' },
  de: { bug: 'Fehler', translation: 'Übersetzung', idea: 'Idee', other: 'Anderes' },
  es: { bug: 'Error', translation: 'Traducción', idea: 'Idea', other: 'Otro' },
  it: { bug: 'Errore', translation: 'Traduzione', idea: 'Idea', other: 'Altro' },
};

async function gotoLocale(page: Page, locale: string) {
  await page.goto(`/pokedex-builder?lang=${locale}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('lang', locale, { timeout: 15_000 });
}

test.use({ viewport: { width: 320, height: 800 } });

test.describe('feedback chips', () => {
  for (const [locale, expected] of Object.entries(CHIPS)) {
    test(`${locale}: the chips are translated, and they fit`, async ({ page }) => {
      await gotoLocale(page, locale);
      await page.locator('[data-feedback-open]').first().click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      const measured = await dialog.evaluate((root) => {
        const row = root.querySelector('form')?.querySelector('div');
        const chips = Array.from(row?.querySelectorAll('button') ?? []);
        return chips.map((c) => ({
          text: (c as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
          overflows: c.scrollWidth > c.clientWidth + 1,
          right: c.getBoundingClientRect().right,
        }));
      });

      expect(measured.length, 'expected the four category chips').toBe(4);

      const texts = measured.map((m) => m.text);
      for (const want of Object.values(expected)) {
        expect(texts, `${locale} is missing "${want}"`).toContain(want);
      }

      expect(
        measured.filter((m) => m.overflows).map((m) => m.text),
        'these chips are clipped',
      ).toEqual([]);

      expect(
        measured.filter((m) => m.right > 320).map((m) => m.text),
        'these chips run off the screen',
      ).toEqual([]);
    });
  }

  test('an untranslated locale still shows English rather than a blank chip', async ({ page }) => {
    await gotoLocale(page, 'ja');
    const openers = page.getByRole('button', { name: /.+/ });
    await expect(openers.first()).toBeVisible();
    await gotoLocale(page, 'ja');
    await page.locator('[data-feedback-open]').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const submit = dialog.locator('button[type="submit"]');
    await expect(submit).toBeVisible();
    await expect(submit).not.toHaveText('');
  });
});
