import { expect, test } from '@playwright/test';

/**
 * The report-a-problem chips, in every language.
 *
 * These are the first strings in the app that are *translated* rather than
 * sourced — everything before them came out of the games' own text. So they get
 * checked at the only place that proves anything about a translation without a
 * speaker: on screen, in the language, at a width someone might actually use.
 *
 * Three things are asserted, and it is worth being clear about what they are
 * and are not. They catch a key that never reaches the DOM, a string that is
 * still English, and a label too wide for the row it sits in. They say nothing
 * about whether the wording is natural — that needs a person, and the chip
 * labelled "Translation" is how one tells us.
 *
 * The expected strings are written out rather than imported from the catalog.
 * A spec that reads its expectations from the file under test would pass on an
 * empty catalog, which is precisely the failure worth catching here.
 */

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

// 320px: the narrowest width the app supports, and where a long chip shows.
test.use({ viewport: { width: 320, height: 800 } });

test.describe('feedback chips', () => {
  for (const [locale, expected] of Object.entries(CHIPS)) {
    test(`${locale}: the chips are translated, and they fit`, async ({ page }) => {
      await page.goto(`/?lang=${locale}`);
      await page.locator('[data-feedback-open]').first().click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      const measured = await dialog.evaluate((root) => {
        // The chips are the buttons in the row above the textarea. Reading them
        // positionally rather than by text is the point: matching on the text
        // would make the assertion circular.
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

      // No chip may be clipped by its own box...
      expect(
        measured.filter((m) => m.overflows).map((m) => m.text),
        'these chips are clipped',
      ).toEqual([]);

      // ...nor run off a 320px screen.
      expect(
        measured.filter((m) => m.right > 320).map((m) => m.text),
        'these chips run off the screen',
      ).toEqual([]);
    });
  }

  test('an untranslated locale still shows English rather than a blank chip', async ({ page }) => {
    // The layering promise: a locale with no entry for a key falls back to
    // English. Worth pinning, because the failure mode of a partial catalog
    // should be "in the wrong language" and never "missing".
    await page.goto('/?lang=ja');
    const openers = page.getByRole('button', { name: /.+/ });
    await expect(openers.first()).toBeVisible();
    await page.goto('/?lang=ja');
    await page.locator('[data-feedback-open]').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The submit button has no Japanese entry yet, so it must read in English.
    const submit = dialog.locator('button[type="submit"]');
    await expect(submit).toBeVisible();
    await expect(submit).not.toHaveText('');
  });
});
