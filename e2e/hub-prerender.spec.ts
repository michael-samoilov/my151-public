import { expect, test, type Browser } from '@playwright/test';

// The build writes the hub's English first render into index.html
// (scripts/prerender-hub.ts), so the page paints before its JavaScript runs.
// These tests hold the promises that make that safe: the markup is complete
// without JavaScript, the app adopts it without redrawing or moving it, and a
// visitor who would get a different page waits behind the spinner instead.

// Saved work in all three tools, in the shapes the tools save. The hub shows
// a "saved in this browser" line under each card for it.
const SAVED = {
  'p151-visited': '1',
  'personal-151-pokedex-v3': JSON.stringify({ state: { sections: { starter: [1, 4, 7] } }, version: 10 }),
  'league-builder': JSON.stringify({ state: { name: '', cards: [{ lines: [{ pokemonId: 25 }] }] }, version: 1 }),
  'favorite-picker': JSON.stringify({ state: { fills: { 'normal|1': 16, 'fire|1': 4, 'water|1': 7 } }, version: 3 }),
};
// A preview build gives a first visitor a demo league (src/league/store/
// seedLeague.ts), which adds a saved line to the hub after it loads. A
// production build does not. An empty saved league starts a first visit as
// production does.
const NO_LEAGUE = { 'league-builder': JSON.stringify({ state: { name: '', cards: [] }, version: 1 }) };
// The Tools menu's favorites notice runs October 6–13 (src/lib/launchFlags.ts).
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

// Firefox paints a page as soon as a script forces its layout, even with the
// stylesheet still loading. `visualViewport.width` forces layout, so a read
// before the stylesheet link showed the hub unstyled for about 600 ms on every
// Firefox load. Every such read must come after the link, where the browser
// holds the script until the stylesheet has loaded.
test('the hub HTML reads no layout before its stylesheet', async ({ request }, testInfo) => {
  const html = await (await request.get('/')).text();
  const sheet = html.indexOf('<link rel="stylesheet"');
  const reads = [...html.matchAll(/visualViewport|getBoundingClientRect|offsetWidth|clientWidth/g)].map((m) => m.index);
  await testInfo.attach('head-order.json', { body: JSON.stringify({ sheet, reads }), contentType: 'application/json' });
  expect(sheet).toBeGreaterThan(0);
  for (const at of reads) expect(at).toBeGreaterThan(sheet);
});

/**
 * Loads the hub and reports what the visitor saw: whether #root showed before
 * the app ran, whether the app kept the prerendered heading, the layout shifts
 * before the app took over, and the console errors.
 */
async function visit(
  browser: Browser,
  baseURL: string | undefined,
  options: Parameters<Browser['newContext']>[0],
  { seed, now, lines = 0 }: { seed?: Record<string, string>; now?: string; lines?: number } = {},
) {
  const context = await browser.newContext({ baseURL, ...options, serviceWorkers: 'block' });
  if (now) await context.clock.setFixedTime(new Date(now));
  // On a phone the prerendered page paints well before the app takes it over.
  // Locally the app can take over before the first paint, which would hide a
  // shift, so the scripts wait until the page has painted.
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
      // src/home/main.tsx removes the spinner when the app takes over.
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
    if (name.startsWith('tool-dex') && !name.startsWith('tool-dex-b')) shot.push(name);
  });
  await page.goto('/?notme');
  await expect(page.locator('.p151-boot')).toHaveCount(0);
  // The dex card's front shot. Its alt text is translated, so it is found by
  // its file and by having alt text at all (the shadow and hit copies have none).
  await expect(page.locator('img[alt]:not([alt=""])[src*="/tool-dex-"]:not([src*="/tool-dex-b-"])')).toHaveJSProperty('complete', true);
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
    // No saved work: every line shows 0, so a first visitor sees what each
    // tool counts and that this browser keeps it.
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

// The prerendered lines show 0 until the app reads the saved counts. The head
// script marks the tools with saved work, so a returning visitor never sees 0
// for work they saved. No app script loads here, so this is the page before
// the app runs.
test('before the app runs, a tool with saved work holds its count back and the others show 0', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, ...PHONE, locale: 'en-US', serviceWorkers: 'block' });
  await context.clock.setFixedTime(new Date(AFTER_NOTICE));
  await context.route('**/assets/*.js', (route) => route.abort());
  await context.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, { ...NO_LEAGUE, 'personal-151-pokedex-v3': SAVED['personal-151-pokedex-v3'] });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#root h1')).toBeVisible();
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
    { tool: 'dex', text: '' },
    { tool: 'league', text: '0/14 trainers saved in this browser' },
    { tool: 'favorites', text: '0/257 picks saved in this browser' },
  ]);
  // The held line keeps its height, so the count arrives without a shift.
  for (const line of lines) expect(line.height).toBeGreaterThan(0);
});

for (const [name, options, settings] of [
  ['in another language', { ...PHONE, locale: 'ja-JP' }, { seed: NO_LEAGUE }],
  // The Tools menu shows a returning visitor a notice the HTML cannot hold.
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

// With the stylesheet cached, a browser can paint the hub while its HTML is
// still arriving. The hub centres its content, so the rest of the HTML would
// move what was painted: a layout shift of about 0.3 on a phone. The lab
// measures that; this test holds the guard against it. HTML that stops inside
// the grid stands for HTML still arriving.
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
