import { expect, test } from '@playwright/test';

/**
 * A Pokémon's name must never be shown as its slug — not for a frame.
 *
 * Species names live in a lazily-fetched chunk, and the label falls back to the
 * app's own slug until it arrives. That fallback is right for the case it was
 * written for (a stalled fetch on a bad connection should show *something*) and
 * wrong as a normal-path behaviour: the slug is lowercase, hyphenated,
 * untranslated English — `bulbasaur`, `mr-mime` — so across a 151-tile grid the
 * whole page visibly rewrites itself a moment after it paints.
 *
 * Both routes into a locale have to be covered, and only one of them is boot:
 *
 *  - **Startup.** `initLocale` now waits for the names, bounded by the same
 *    timeout the UI catalog already used, so the fallback still applies when
 *    the fetch is genuinely slow.
 *  - **Switching.** `applyLocale` waits too. It previously committed the new
 *    catalog and let the names land whenever, which meant picking a language
 *    flashed English slugs on the way to the new names.
 *
 * Sampled every animation frame from before navigation, rather than checked
 * once at the end: the flash is a frame or two and a settled assertion would
 * pass straight through it. Reverting either await makes these fail with
 * `["bulbasaur", "フシギダネ"]`, which is the exact sequence this exists to stop.
 */

/** Record every distinct text the first tile label shows, frame by frame. */
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

/** The app's slugs are lowercase; every real name in every locale starts upper. */
const looksLikeASlug = (text: string) => /^[a-z0-9-]+$/.test(text);

test.describe('name flash', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  for (const locale of ['en', 'ja', 'it'] as const) {
    test(`${locale}: no slug is shown on the way to the real names`, async ({ page }) => {
      await page.addInitScript(RECORDER);
      await page.goto(`/?lang=${locale}&demo`);
      await expect.poll(async () => (await labels(page)).length).toBeGreaterThan(0);
      await page.waitForTimeout(1500);

      const seen = await labels(page);
      expect(seen.filter(looksLikeASlug), `${locale} flashed a slug: ${seen.join(' -> ')}`).toEqual([]);
      // And it settled on exactly one thing, rather than rewriting itself.
      expect(seen, `${locale} rewrote its labels: ${seen.join(' -> ')}`).toHaveLength(1);
    });
  }

  test('switching language goes straight to the new names', async ({ page }) => {
    await page.goto('/?lang=en&demo');
    await expect(page.locator('[data-i18n-exempt="pokemon-name"]').first()).toBeAttached();
    await page.evaluate(RECORDER);

    await page.getByRole('button', { name: /language/i }).click();
    await page.getByRole('menuitemradio', { name: /日本語/ }).click();
    await expect.poll(async () => (await labels(page)).length).toBeGreaterThan(1);
    await page.waitForTimeout(1000);

    const seen = await labels(page);
    expect(seen.filter(looksLikeASlug), `flashed a slug: ${seen.join(' -> ')}`).toEqual([]);
    // English, then Japanese. Anything in between is the bug.
    expect(seen, `expected one clean change, got: ${seen.join(' -> ')}`).toHaveLength(2);
  });
});
