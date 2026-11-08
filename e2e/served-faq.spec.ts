import { expect, test } from './support/test';
import { en } from '../src/i18n/catalogs/en';
import { FAQ_KEYS, type FaqPage } from '../src/components/shared/faqKeys';

const PAGES: [string, FaqPage][] = [
  ['/pokedex-builder', 'dex'],
  ['/custom-gym-leader', 'league'],
  ['/favorite-pokemon-picker', 'favorites'],
];

for (const [path, page] of PAGES) {
  test(`${path} serves its FAQ without JavaScript and never paints it early`, async ({ browser, baseURL }, info) => {
    const expected = FAQ_KEYS[page].map(([q, a]) => ({ q: en[q], a: en[a] }));

    const noScripts = await browser.newContext({ javaScriptEnabled: false });
    const served = await noScripts.newPage();
    await served.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' });
    await served.waitForTimeout(80);
    const early = await served.evaluate(() => {
      const faq = document.querySelector('.p151-faq');
      let opacity = 1;
      for (let n: Element | null = faq; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      return {
        items: [...document.querySelectorAll('.p151-faq section')].map((s) => ({
          q: s.querySelector('h2')?.textContent ?? '',
          a: s.querySelector('p')?.textContent ?? '',
        })),
        opacity,
      };
    });
    expect(early.items, 'the served FAQ is the catalog copy').toEqual(expected);
    expect(early.opacity, 'held back in the first 80ms').toBe(0);
    await served.waitForTimeout(1500);
    const later = await served.evaluate(() => {
      let opacity = 1;
      for (let n: Element | null = document.querySelector('.p151-faq summary'); n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      return opacity;
    });
    expect(later, 'shown once a second has passed, for a slow load').toBe(1);
    await noScripts.close();

    const app = await browser.newContext();
    const mounted = await app.newPage();
    await mounted.goto(`${baseURL}${path}`);
    await mounted.waitForSelector('[data-testid="faq"]');
    const after = await mounted.evaluate(() => ({
      served: document.querySelectorAll('.p151-faq').length,
      app: [...document.querySelectorAll('[data-testid="faq"] h2')].map((h) => h.textContent),
    }));
    await app.close();
    expect(after.served, 'the app replaces the served copy').toBe(0);
    expect(after.app, 'and renders the same questions').toEqual(expected.map((e) => e.q));

    await info.attach('served-faq.json', { body: JSON.stringify({ path, early, later, after }, null, 2), contentType: 'application/json' });
  });
}
