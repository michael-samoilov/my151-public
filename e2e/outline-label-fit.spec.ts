import { test, expect } from '@playwright/test';
import { LOCALES } from '../src/i18n/config';

/**
 * Every section's outline label stays readable in a one-cell slot, in every
 * language. A section holding one Pokémon gets a one-cell slot, and a label
 * that does not fit there is squeezed sideways. Below 70% of its natural
 * width it reads as crushed, so each language's shortest section name
 * (`sectionTiny.*`) must fit one cell at 70% or wider.
 */

const MIN_SCALE = 0.7;

// One Pokémon per Build section, so every outline is one cell wide.
const ONE_EACH: Record<string, number[]> = {
  starter: [1], 'early-bug': [10], 'early-bird': [16], 'early-rodent': [19],
  'pikachu-clone': [25], 'early-normal': [52], forest: [43], meadow: [187],
  'cave-pokemon': [41], swamp: [194], dojo: [66], haunted: [92], ruins: [201],
  beach: [98], 'fishing-pokemon': [129], ocean: [72], desert: [27], volcanic: [58],
  tundra: [86], industrial: [81], mimic: [132], 'rivalry-pair': [311],
  'evil-team': [109], other: [133], fossil: [138], 'pseudo-legendary': [147],
  legendary: [144], mythical: [151],
};
const SECTION_COUNT = Object.keys(ONE_EACH).length;

test('one-cell outline labels keep 70% of their width in every language', async ({ page }, testInfo) => {
  await page.addInitScript((sections) => {
    for (const k of ['p151-league-promo-seen', 'p151-moved-notice-seen', 'p151-favorites-launch-seen', 'p151-intro-seen']) localStorage.setItem(k, '1');
    localStorage.setItem('personal-151-pokedex-v3', JSON.stringify({
      state: { sections, milestoneMax: 28, milestoneCelebrated: [25], localeNoticeSeen: true, viewShowSections: true, viewSortOption: 'build-order' },
      version: 10,
    }));
  }, ONE_EACH);

  const report: Record<string, { section: string; text: string; scale: number }[]> = {};
  for (const locale of LOCALES) {
    await page.goto(`/pokedex-builder?lang=${locale}`);
    await page.locator('[data-nav="view"]').click();
    const labels = page.locator('[data-outline-label]');
    await expect(labels).toHaveCount(SECTION_COUNT);
    await page.evaluate(() => document.fonts.ready);
    // Fitting runs once the fonts are ready, so read until two reads agree.
    const read = () => labels.evaluateAll((els) => els.map((el) => ({
      section: el.getAttribute('data-outline-label')!,
      text: el.textContent ?? '',
      scale: Number(/scaleX\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)?.[1] ?? 1),
    })));
    let rows = await read();
    await expect.poll(async () => {
      const next = await read();
      const same = JSON.stringify(next) === JSON.stringify(rows);
      rows = next;
      return same;
    }).toBe(true);
    report[locale] = rows;
  }

  await testInfo.attach('one-cell-labels.json', { body: JSON.stringify(report, null, 1), contentType: 'application/json' });
  const crushed = Object.entries(report).flatMap(([locale, rows]) =>
    rows.filter((r) => r.scale < MIN_SCALE).map((r) => `${locale} ${r.section} "${r.text}" at ${r.scale.toFixed(2)}`));
  expect(crushed).toEqual([]);
});
