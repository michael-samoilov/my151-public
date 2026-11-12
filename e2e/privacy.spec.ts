import { expect, test, type Page } from './support/test';

const OPT_OUT_KEY = 'p151-opt-out';
const SEEDS: [string, string][] = [
  ['personal-151-pokedex-v3', JSON.stringify({ state: { sections: { starter: [1] } }, version: 10 })],
  ['league-builder', JSON.stringify({
    state: { name: '', cards: [{ type: null, theme: '', lines: [{ branch: [1, 2, 3], boundaries: [1, 3, 5] }], signatureSeat: null, tmMoveId: null, badgeName: '' }] },
    version: 1,
  })],
  ['favorite-picker', JSON.stringify({ state: { fills: { 'fire|1': 4 } }, version: 3 })],
];

async function openPrivacy(page: Page) {
  const link = page.getByRole('button', { name: 'Privacy', exact: true }).last();
  await link.scrollIntoViewIfNeeded();
  await link.click();
  const dialog = page.getByRole('dialog', { name: 'Privacy' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('the privacy panel', { tag: '@viewport' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/event', (route) => route.fulfill({ status: 200, body: '{}' }));
  });

  test('opens from the footer, and its switch turns counting off and on', async ({ page }, testInfo) => {
    await page.goto('/');
    let dialog = await openPrivacy(page);
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveText(['What my151 does not keep', 'What we keep', 'How long we keep it', 'Who handles the data', 'Questions']);
    await expect(dialog.getByRole('heading', { name: 'What my151 does not keep' }).locator('xpath=..').getByRole('listitem')).toHaveText([/^Your name/, /^Your city/, /^Your IP address/]);
    const toggle = () => dialog.getByRole('switch', { name: "Don't count my visits" });
    const flag = () => page.evaluate((key) => localStorage.getItem(key), OPT_OUT_KEY);

    await expect(toggle()).toHaveAttribute('aria-checked', 'false');
    await expect(dialog.getByText('This browser is counted.')).toBeVisible();
    await toggle().click();
    await expect(toggle()).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByText(/^This browser is not counted\./)).toBeVisible();
    const afterOn = await flag();

    await page.reload();
    dialog = await openPrivacy(page);
    await expect(toggle()).toHaveAttribute('aria-checked', 'true');
    await dialog.getByText("Don't count my visits").click();
    await expect(toggle()).toHaveAttribute('aria-checked', 'false');
    const afterOff = await flag();

    const evidence = { afterOn, afterOff };
    await testInfo.attach('privacy-switch.json', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    expect(evidence).toEqual({ afterOn: '1', afterOff: null });

    await dialog.getByRole('button', { name: 'Report a problem' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'What happened?' })).toBeVisible();
  });

  test('opens from a ?privacy link on every page with the footer, and counts each load once', async ({ page }, testInfo) => {
    await page.addInitScript((seeds) => {
      if (localStorage.getItem(seeds[0][0]) !== null) return;
      for (const [key, value] of seeds) localStorage.setItem(key, value);
    }, SEEDS);
    const visits: string[] = [];
    await page.route('**/api/visit', async (route) => {
      visits.push(String((route.request().postDataJSON() as { page?: unknown }).page));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    const opened: Record<string, { panel: boolean; visits: number }> = {};
    for (const path of ['/', '/pokedex-builder', '/custom-gym-leader', '/favorite-pokemon-picker']) {
      visits.length = 0;
      await page.goto(`${path}?privacy`);
      const dialog = page.getByRole('dialog', { name: 'Privacy' });
      await expect(dialog.getByRole('switch', { name: "Don't count my visits" })).toBeVisible();
      await page.waitForTimeout(3500);
      opened[path] = { panel: (await dialog.count()) === 1, visits: visits.filter((v) => v === path).length };
    }
    await testInfo.attach('privacy-link.json', { body: JSON.stringify(opened, null, 2), contentType: 'application/json' });
    expect(Object.values(opened)).toEqual(Array(4).fill({ panel: true, visits: 1 }));
  });

  test('opening the panel from the footer adds no visit and keeps the address', async ({ page }) => {
    const sent: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/') || path.startsWith('/_vercel/')) sent.push(path);
    });
    await page.route('**/api/visit', (route) => route.fulfill({ status: 200, body: '{"ok":true}' }));
    await page.goto('/');
    await page.waitForTimeout(3500);
    const before = { url: page.url(), sent: sent.length };
    await openPrivacy(page);
    await page.waitForTimeout(1500);
    expect({ url: page.url(), sent: sent.length }).toEqual(before);
  });

  test('shows the switch on and locked when the browser sends Global Privacy Control', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });
    });
    await page.goto('/');
    const dialog = await openPrivacy(page);
    const toggle = dialog.getByRole('switch', { name: "Don't count my visits" });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeDisabled();
    await expect(dialog.getByText('Your browser sends Global Privacy Control, so my151 never counts it.')).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), OPT_OUT_KEY)).toBeNull();
  });
});
