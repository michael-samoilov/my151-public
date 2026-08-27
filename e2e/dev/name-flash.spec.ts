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
 * The fallback is now a placeholder rather than the slug, so the wait is a
 * belt to the braces rather than the only defence. That matters because the
 * wait is bounded: a fetch slower than the timeout still paints before the
 * names, and under two-worker load this spec caught it doing exactly that.
 * A skeleton makes the slow path honest — the label is visibly not-yet-loaded
 * instead of confidently wrong — and `renders a placeholder, never a slug`
 * below pins that, with the frame-by-frame specs still holding the fast path
 * to no visible change at all.
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
      // Warm the locale chunk first. This runs against the dev server, which
      // compiles each locale's names on first request — several seconds for
      // Japanese. That compile is not what is being measured, and counting it
      // makes a passing app look like a failing one: boot races the names
      // against a timeout precisely so a slow fetch cannot hold the first paint,
      // so a cold chunk legitimately degrades to the slug. This measures the
      // normal path, which is the one that must never flash.
      await page.goto(`/?lang=${locale}&demo=151`);
      await expect(page.locator('[data-i18n-exempt="pokemon-name"]').first()).toBeAttached();

      await page.addInitScript(RECORDER);
      await page.goto(`/?lang=${locale}&demo=151`);
      // A generous readiness wait, not a statement about speed. Boot legitimately
      // takes a while here: it waits for the catalog and the names, the demo dex
      // is seeded, and 151 tiles render — and the suite runs two workers against
      // one dev server, so the default 5s times out under load while the same
      // test passes alone. What is being asserted is the *sequence* below, which
      // this only has to arrive at.
      await expect
        .poll(async () => (await labels(page)).length, { timeout: 20_000 })
        .toBeGreaterThan(0);
      await page.waitForTimeout(1500);

      const seen = await labels(page);
      expect(seen.filter(looksLikeASlug), `${locale} flashed a slug: ${seen.join(' -> ')}`).toEqual([]);
      // And it settled on exactly one thing, rather than rewriting itself.
      expect(seen, `${locale} rewrote its labels: ${seen.join(' -> ')}`).toHaveLength(1);
    });
  }

  test('switching language goes straight to the new names', async ({ page }) => {
    await page.goto('/?lang=en&demo=151');
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
    // English, then Japanese. Anything in between is the bug.
    expect(seen, `expected one clean change, got: ${seen.join(' -> ')}`).toHaveLength(2);
  });

  test('a name that has not arrived renders a placeholder, never a slug', async ({ page }) => {
    // The slow path, held open on purpose. Every other test here covers the
    // case where the names win their race; this one covers the case where they
    // lose it, which is the one a real phone on a real network actually hits
    // and the one that was still showing `bulbasaur` under load.
    // Matched against the dev server's own URL for the catalog, which is the
    // module path rather than a hashed `/assets/` chunk. The first version of
    // this test routed `**/assets/**`, matched nothing, and passed by taking
    // the branch for "the names arrived in time" — a test of the slow path that
    // never once made the path slow. Hence the assertion below that the
    // placeholder was genuinely reached, so it cannot go quiet again.
    // Held on a gate rather than a timer. A fixed delay has to be longer than
    // however long the dev server takes to compile and boot, which is not a
    // number this test can know — at 4s it lost that race and measured a label
    // that had already resolved. The gate makes the slow path last exactly as
    // long as the assertions need and not one frame longer.
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
    // `demo=151` seeds the demo dex, the same way every other test in this
    // file does. A bare `?demo` seeds nothing: the flag needs its value, so
    // the page had no tiles of its own and this read the off-screen browser
    // panel instead, which used to be mounted for the whole session and is
    // now built only while it is open.
    await page.goto('/?lang=en&demo=151');

    const label = page.locator('[data-i18n-exempt="pokemon-name"]').first();
    await expect(label).toBeAttached({ timeout: 20_000 });

    const state = await label.evaluate((el: HTMLElement) => ({
      text: el.innerText.replace(/\s+/g, ' ').trim(),
      skeleton: !!el.querySelector('[data-name-skeleton]'),
      busy: el.getAttribute('aria-busy'),
      // The slug must not survive as a tooltip or an accessible name either —
      // hiding it visually and then announcing it is not hiding it.
      title: el.getAttribute('title'),
      aria: el.getAttribute('aria-label'),
    }));

    expect(held, 'the name catalog was never held, so nothing was tested').toBeGreaterThan(0);
    expect(state.skeleton, `expected a placeholder, got "${state.text}"`).toBe(true);
    expect(state.text, 'the placeholder is not empty of text').toBe('');
    expect(state.busy, 'a loading label should report itself busy').toBe('true');
    expect(state.title, 'the slug leaked into the tooltip').toBeNull();
    expect(state.aria, 'the slug leaked into the accessible name').toBeNull();

    // And it resolves on its own once the catalog lands — a placeholder that
    // never leaves is a worse bug than the one it replaced. Which species
    // lands first is the seeded dex's business, so this asserts what the test
    // is about: the placeholder clears, and what replaces it is a real name
    // rather than the slug.
    release();
    await expect(label).not.toHaveText('', { timeout: 15_000 });
    const settled = (await label.innerText()).replace(/\s+/g, ' ').trim();
    expect(looksLikeASlug(settled), `settled on a slug: ${settled}`).toBe(false);
  });
});
