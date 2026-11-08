import { expect, test, type Browser } from './support/test';

const SAVED = {
  'p151-visited': '1',
  'personal-151-pokedex-v3': JSON.stringify({ state: { sections: { starter: [1, 4, 7] } }, version: 10 }),
  'league-builder': JSON.stringify({ state: { name: '', cards: [{ lines: [{ pokemonId: 25 }] }] }, version: 1 }),
  'favorite-picker': JSON.stringify({ state: { fills: { 'normal|1': 16, 'fire|1': 4, 'water|1': 7 } }, version: 3 }),
};
const NO_LEAGUE = { 'league-builder': JSON.stringify({ state: { name: '', cards: [] }, version: 1 }) };
const IN_NOTICE = '2026-10-10T12:00:00-04:00';
const AFTER_NOTICE = '2026-10-20T12:00:00-04:00';

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

test('the hub HTML holds the whole page without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, ...PHONE });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Make a custom Pokédex/);
  for (const href of ['/pokedex-builder', '/custom-gym-leader', '/favorite-pokemon-picker']) {
    await expect(page.locator(`#root a[data-card-panel][href="${href}"]`)).toBeVisible();
  }
  await expect(page.getByRole('img', { name: /^Custom Pokédex Maker: a custom regional Pokédex in progress/ })).toBeVisible();
  await expect(page.locator('.p151-boot')).toBeHidden();
  await context.close();
});

// platform: Firefox paints as soon as a script forces layout, even while the stylesheet still loads.
test('the hub HTML reads no layout before its stylesheet', async ({ request }, testInfo) => {
  const html = await (await request.get('/')).text();
  const styles = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)];
  const largest = styles.reduce((a, b) => (b[0].length > a[0].length ? b : a));
  const sheet = largest.index + largest[0].length;
  const reads = [...html.matchAll(/visualViewport|getBoundingClientRect|offsetWidth|clientWidth/g)].map((m) => m.index);
  await testInfo.attach('head-order.json', { body: JSON.stringify({ sheet, reads }), contentType: 'application/json' });
  expect(largest[0].length).toBeGreaterThan(10_000);
  for (const at of reads) expect(at).toBeGreaterThan(sheet);
});

test('the hub inlines its stylesheet and prefetches the file for the tools', async ({ page }) => {
  const response = await page.goto('/?notme');
  expect(await response!.text()).not.toContain('<link rel="stylesheet"');
  const href = await page.locator('link[rel="prefetch"][href$=".css"]').getAttribute('href');
  expect((await page.request.get(href!)).status()).toBe(200);
});

async function visit(
  browser: Browser,
  baseURL: string | undefined,
  options: Parameters<Browser['newContext']>[0],
  { seed, now, lines = 0 }: { seed?: Record<string, string>; now?: string; lines?: number } = {},
) {
  const context = await browser.newContext({ baseURL, ...options, serviceWorkers: 'block' });
  if (now) await context.clock.setFixedTime(new Date(now));
  await context.route('**/assets/*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fallback();
  });
  if (seed) {
    await context.addInitScript((entries) => {
      if (sessionStorage.getItem('seeded')) return;
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      sessionStorage.setItem('seeded', '1');
    }, seed);
  }
  await context.addInitScript(() => {
    const probe = { shifts: [] as [number, number][], tookOver: 0, rootShown: false, h1: null as Element | null };
    (window as unknown as { __probe: typeof probe }).__probe = probe;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!e.hadRecentInput) probe.shifts.push([e.startTime, e.value]);
      }
    }).observe({ type: 'layout-shift', buffered: true });
    document.addEventListener('DOMContentLoaded', () => {
      probe.rootShown = getComputedStyle(document.getElementById('root')!).display !== 'none';
      probe.h1 = document.querySelector('#root h1');
      new MutationObserver(() => {
        if (!probe.tookOver && !document.querySelector('.p151-boot')) probe.tookOver = performance.now();
      }).observe(document.body, { childList: true });
    });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const shot: string[] = [];
  page.on('request', (r) => {
    const name = new URL(r.url()).pathname.split('/').pop() ?? '';
    if (name.startsWith('home-mobile-dex-') || name.startsWith('tool-dex') && !name.startsWith('tool-dex-b')) shot.push(name);
  });
  await page.goto('/?notme');
  await expect(page.locator('.p151-boot')).toHaveCount(0);
  const mobileArtwork = await page.locator('html').getAttribute('data-home-scene') === 'mobile';
  const dexImage = page.locator(mobileArtwork ? '[data-card-scene="dex"][data-scene-slot="0"]' : '[data-home-picture="dex-0"] img');
  await expect(dexImage).toHaveJSProperty('complete', true);
  await expect.poll(() => dexImage.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(1);
  await expect(page.locator('[data-card-progress]:not([data-empty])')).toHaveCount(lines);
  await page.waitForTimeout(500);
  const seen = await page.evaluate(() => {
    const probe = (window as unknown as { __probe: { shifts: [number, number][]; tookOver: number; rootShown: boolean; h1: Element | null } }).__probe;
    return {
      rootShownBeforeApp: probe.rootShown,
      keptHeading: probe.h1 !== null && probe.h1 === document.querySelector('#root h1'),
      shiftBeforeApp: probe.shifts.filter(([t]) => t <= probe.tookOver).reduce((sum, [, v]) => sum + v, 0),
      shiftTotal: probe.shifts.reduce((sum, [, v]) => sum + v, 0),
      progress: [...document.querySelectorAll('[data-card-progress]')].map((p) => ({
        tool: p.getAttribute('data-card-progress'),
        shown: getComputedStyle(p).display !== 'none',
        text: p.querySelector(':scope > span:not([aria-hidden])')?.textContent ?? '',
      })),
      lang: document.documentElement.lang,
      waiting: document.documentElement.classList.contains('p151-wait'),
    };
  });
  await context.close();
  return { ...seen, errors, shot };
}

for (const [name, device] of [['phone', PHONE], ['desktop', DESKTOP]] as const) {
  test(`a first English visit on a ${name} keeps the prerendered hub`, async ({ browser, baseURL }, testInfo) => {
    const seen = await visit(browser, baseURL, { ...device, locale: 'en-US' }, { seed: NO_LEAGUE });
    await testInfo.attach(`first-visit-${name}.json`, { body: JSON.stringify(seen, null, 1), contentType: 'application/json' });
    expect(seen.rootShownBeforeApp).toBe(true);
    expect(seen.keptHeading).toBe(true);
    expect(seen.shiftTotal).toBe(0);
    expect(seen.errors).toEqual([]);
    expect(seen.shot).toHaveLength(1);
    expect(seen.progress).toEqual([
      { tool: 'dex', shown: true, text: '0/151 entries saved in this browser' },
      { tool: 'league', shown: true, text: '0/14 trainers saved in this browser' },
      { tool: 'favorites', shown: true, text: '0/257 picks saved in this browser' },
    ]);
  });

  test(`a returning English visitor with saved work on a ${name} keeps the prerendered hub, and the saved lines arrive in place`, async ({ browser, baseURL }, testInfo) => {
    const seen = await visit(browser, baseURL, { ...device, locale: 'en-US' }, { seed: SAVED, now: AFTER_NOTICE, lines: 3 });
    await testInfo.attach(`returning-visit-${name}.json`, { body: JSON.stringify(seen, null, 1), contentType: 'application/json' });
    expect(seen.rootShownBeforeApp).toBe(true);
    expect(seen.keptHeading).toBe(true);
    expect(seen.shiftTotal).toBe(0);
    expect(seen.errors).toEqual([]);
    expect(seen.progress.map((p) => p.text)).toEqual([
      '3/151 entries saved in this browser',
      '1/14 trainers saved in this browser',
      '3/257 picks saved in this browser',
    ]);
  });
}

test('before the app runs, the hub already shows the saved counts', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, ...PHONE, locale: 'en-US', serviceWorkers: 'block' });
  await context.clock.setFixedTime(new Date(AFTER_NOTICE));
  await context.route('**/assets/*.js', (route) => route.abort());
  await context.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, { ...NO_LEAGUE, 'personal-151-pokedex-v3': SAVED['personal-151-pokedex-v3'] });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#root h1')).toBeVisible();
  await expect(page.locator('[data-card-progress="league"]')).toBeVisible();
  await expect(page.locator('[data-card-progress="favorites"]')).toBeVisible();
  const lines = await page.evaluate(() => [...document.querySelectorAll('[data-card-progress]')].map((p) => {
    const count = p.querySelector('[data-progress-count]')!;
    return {
      tool: p.getAttribute('data-card-progress'),
      text: getComputedStyle(count).visibility === 'hidden' ? '' : count.textContent,
      height: Math.round(p.getBoundingClientRect().height),
    };
  }));
  await testInfo.attach('before-app.json', { body: JSON.stringify(lines, null, 1), contentType: 'application/json' });
  await context.close();
  expect(lines.map(({ tool, text }) => ({ tool, text }))).toEqual([
    { tool: 'dex', text: '3/151 entries saved in this browser' },
    { tool: 'league', text: '0/14 trainers saved in this browser' },
    { tool: 'favorites', text: '0/257 picks saved in this browser' },
  ]);
  for (const line of lines) expect(line.height).toBeGreaterThan(0);
});

test('before the app runs, the picks line shows only the count the app recorded for the same picks', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, ...PHONE, locale: 'en-US', serviceWorkers: 'block' });
  await context.clock.setFixedTime(new Date(AFTER_NOTICE));
  let appRuns = false;
  await context.route('**/assets/*.js', (route) => (appRuns ? route.fallback() : route.abort()));
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate((picks) => localStorage.setItem('favorite-picker', picks), SAVED['favorite-picker']);
  const picksLine = async () => {
    await page.goto('/');
    await expect(page.locator('#root h1')).toBeVisible();
    const count = page.locator('[data-card-progress="favorites"] [data-progress-count]');
    return count.evaluate((el) => (getComputedStyle(el).visibility === 'hidden' ? '' : el.textContent));
  };
  const seen: Record<string, string | null> = {};
  seen['before the app has counted these picks'] = await picksLine();
  appRuns = true;
  await page.goto('/');
  await expect(page.locator('[data-card-progress="favorites"] [data-progress-count]')).toHaveText('3/257 picks saved in this browser');
  appRuns = false;
  seen['after the app counted these picks'] = await picksLine();
  await page.evaluate(() => localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: { 'normal|1': 16 } }, version: 4 })));
  seen['after the picks changed elsewhere'] = await picksLine();
  await testInfo.attach('picks-before-app.json', { body: JSON.stringify(seen, null, 1), contentType: 'application/json' });
  await context.close();
  expect(seen).toEqual({
    'before the app has counted these picks': '',
    'after the app counted these picks': '3/257 picks saved in this browser',
    'after the picks changed elsewhere': '',
  });
});

for (const [name, options, settings] of [
  ['in another language', { ...PHONE, locale: 'ja-JP' }, { seed: NO_LEAGUE }],
  ['who visited before, while the favorites notice runs', { ...PHONE, locale: 'en-US' }, { seed: { ...NO_LEAGUE, 'p151-visited': '1' }, now: IN_NOTICE }],
] as const) {
  test(`a visitor ${name} waits for the app instead`, async ({ browser, baseURL }, testInfo) => {
    const seen = await visit(browser, baseURL, options, settings);
    await testInfo.attach('waiting-visit.json', { body: JSON.stringify(seen, null, 1), contentType: 'application/json' });
    expect(seen.rootShownBeforeApp).toBe(false);
    expect(seen.keptHeading).toBe(false);
    expect(seen.waiting).toBe(false);
    expect(seen.lang).toBe(options.locale === 'ja-JP' ? 'ja' : 'en');
    expect(seen.errors).toEqual([]);
  });
}

// platform: With the stylesheet cached, a browser can paint the hub while its HTML still arrives.
test('a hub whose HTML has only partly arrived shows none of it yet', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, ...PHONE, javaScriptEnabled: false });
  const page = await context.newPage();
  const html = await (await page.request.get('/')).text();
  const cut = html.indexOf('data-card-caption');
  expect(cut).toBeGreaterThan(0);
  await page.route((url) => url.pathname === '/', (route) => route.fulfill({ body: html.slice(0, cut), contentType: 'text/html' }));
  await page.goto('/');
  await expect(page.locator('#root')).toHaveCSS('visibility', 'hidden');
  await expect(page.getByRole('heading', { level: 1 })).toBeHidden();
  await context.close();
});
