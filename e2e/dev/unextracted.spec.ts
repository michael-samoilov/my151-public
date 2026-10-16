import { expect, test } from '@playwright/test';
import { NAV_PAGES, seedDex } from '../support/dexSeed';

const ALLOWED = [
  'my151',
  '.app',
  'Nintendo / Game Freak / Creatures',
];

const HAS_LETTERS = /[A-Za-z]{3,}/;

async function unextractedText(page: import('@playwright/test').Page): Promise<string[]> {
  const found = await page.evaluate(() => {
    const out: { text: string; where: string }[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.children.length > 0) continue;
      if (el.closest('[data-i18n-exempt]')) continue;
      const text = (el.textContent ?? '').trim();
      if (!text) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push({ text, where: el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0] });
    }
    return out;
  });

  return found
    .filter(
      (n) =>
        HAS_LETTERS.test(n.text) &&
        !n.text.includes('[') &&
        !ALLOWED.some((a) => n.text.includes(a)),
    )
    .map((n) => `${n.text.slice(0, 60)}  <${n.where}>`);
}

test.describe('extraction coverage', () => {
  for (const nav of NAV_PAGES) {
    test(`${nav}: no visible text bypasses the catalog`, async ({ page }) => {
      await page.goto('/pokedex-builder?tune&lang=en-XA');
      await seedDex(page);
      await page.locator(`[data-nav="${nav}"]`).click();
      await page.waitForTimeout(500);

      const report = await unextractedText(page);
      expect(report, `strings not routed through t() on the ${nav} page`).toEqual([]);
    });
  }

  test('no visible text bypasses the catalog in the browser filters', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/pokedex-builder?lang=en-XA');
    await expect(page.locator('h1')).toContainText('[');
    await page.locator('[data-add-slot]').first().click();

    const chips = page.locator('[data-filter-chip]').filter({ visible: true, has: page.locator('.lucide-chevron-down') });
    const count = await chips.count();
    expect(count, 'the browser should offer filter panels to open').toBeGreaterThan(5);

    const report: string[] = await unextractedText(page);
    for (let i = 0; i < count; i++) {
      const chip = chips.nth(i);
      const name = (await chip.getAttribute('data-filter-chip')) ?? String(i);
      await chip.click();
      await page.waitForTimeout(150);
      report.push(...(await unextractedText(page)).map((r) => `${name}: ${r}`));
      await chip.click();
    }
    expect(report, 'strings not routed through t() inside the browser filters').toEqual([]);
    await testInfo.attach('filter-extraction', { body: JSON.stringify({ panels: count, report }), contentType: 'application/json' });
  });
});
