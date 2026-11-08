import { expect, test, type Page } from './support/test';

const SEEDS: [string, string][] = [
  ['personal-151-pokedex-v3', JSON.stringify({ state: { sections: { starter: [1] } }, version: 10 })],
  ['league-builder', JSON.stringify({
    state: { name: '', cards: [{ type: null, theme: '', lines: [{ branch: [1, 2, 3], boundaries: [1, 3, 5] }], signatureSeat: null, tmMoveId: null, badgeName: '' }] },
    version: 1,
  })],
  ['favorite-picker', JSON.stringify({ state: { fills: { 'fire|1': 4 } }, version: 3 })],
];
const TOOL_PAGES = ['/', '/pokedex-builder', '/custom-gym-leader', '/favorite-pokemon-picker'];
const ENDPOINTS = ['submit', 'league', 'event', 'favorites'];

type Sent = { path: string; auto: unknown };

async function visitEveryTool(page: Page, asPerson: boolean): Promise<Sent[]> {
  if (asPerson) {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    });
  }
  await page.addInitScript((seeds) => {
    if (localStorage.getItem(seeds[0][0]) !== null) return;
    for (const [key, value] of seeds) localStorage.setItem(key, value);
  }, SEEDS);
  const sent: Sent[] = [];
  for (const path of ENDPOINTS) {
    await page.route(`**/api/${path}`, async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown> | null;
      sent.push({ path, auto: body?.auto });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
  }
  for (const path of TOOL_PAGES) {
    await page.goto(path);
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(400);
  }
  return sent;
}

test('automation sends the same requests as a person, each marked auto', async ({ browser }) => {
  const runs: Sent[][] = [];
  for (const asPerson of [false, true]) {
    const context = await browser.newContext();
    runs.push(await visitEveryTool(await context.newPage(), asPerson));
    await context.close();
  }
  const [automated, person] = runs;
  const paths = (sent: Sent[]) => sent.map((s) => s.path).sort();

  expect(automated.length).toBeGreaterThan(0);
  expect(paths(automated)).toEqual(paths(person));
  expect(new Set(paths(automated))).toEqual(new Set(ENDPOINTS));
  expect(automated.every((s) => s.auto === true)).toBe(true);
  expect(person.every((s) => s.auto === undefined)).toBe(true);
});
