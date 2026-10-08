#!/usr/bin/env node
/**
 * Lab speed comparison: production (or any git ref) against the working tree.
 *
 *   node scripts/performance/lab.mjs                       # 5 runs, both profiles
 *   node scripts/performance/lab.mjs --runs 9 --profile mobile --case dex,dex-full
 *   node scripts/performance/lab.mjs --base HEAD~1
 *   node scripts/performance/lab.mjs --no-base             # measure only this tree
 *
 * What it does:
 *
 * 1. Builds the working tree, and the base ref in a temporary worktree.
 * 2. Serves each build over HTTP/2 with Brotli and the cache headers in
 *    vercel.json, like the Vercel edge. API routes answer `{}`.
 * 3. Loads each case in a fresh Chromium context, alternating base and
 *    candidate on every run so drift on the machine hits both equally.
 * 4. Prints the median of each metric, base against candidate.
 *
 * Profiles are the Lighthouse lab presets. Mobile: 390x844, 150 ms round
 * trip, 1.6 Mbps down, CPU slowed 4x. Desktop: 1280x800, 40 ms, 10 Mbps, 1x.
 *
 * Metrics, all in milliseconds except `dom` (element count):
 * - `lcp`, `fcp`, `cls`: the Web Vitals, from the browser's own observers.
 * - `tbt`: total blocking time after first paint, the main-thread cost of
 *   startup.
 * - `ready`: when the case's first control is in the DOM.
 * - `inp:<step>`: the slowest interaction during that step, from the Event
 *   Timing API. This is what Interaction to Next Paint reports in the field.
 *
 * A change is marked only when every candidate run falls outside the range of
 * the base runs, and the medians differ by more than 5%. With 5 runs each,
 * that separation happens by chance less than 1 time in 100; with 3 runs, 1
 * time in 10. Timing on a shared machine is noisy, so this is evidence for a
 * pull request, not a gate in ci-local.
 * Wrap other browser runs in `flock "${TMPDIR:-/tmp}/my151-browser.lock"` so
 * they wait for this one, and it for them.
 */
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { PRODUCTION, build, chromiumPath, compare, holdBrowserLock, median, selfSignedTls, serve } from './lab-server.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const RUNS = Number(flag('runs', 5));
const BASE = args.includes('--no-base') ? null : flag('base', PRODUCTION);
const PROFILE_NAMES = flag('profile', 'mobile,desktop').split(',');
const CASE_NAMES = flag('case', null)?.split(',');

const PROFILES = {
  mobile: {
    context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    cpu: 4,
    network: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 },
  },
  desktop: {
    context: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    cpu: 1,
    network: { latency: 40, downloadThroughput: 10e6 / 8, uploadThroughput: 10e6 / 8 },
  },
};

/**
 * Each case loads one page and may drive steps after it settles. `ready` is
 * the selector whose first appearance counts as usable. `fullDex` seeds a
 * saved Pokédex with all 151 placed before the page loads.
 */
const CASES = {
  hub: { path: '/', ready: 'a[href="/pokedex-builder"]' },
  dex: {
    path: '/pokedex-builder',
    ready: '[data-add-slot]',
    steps: {
      open: async (page) => {
        await page.locator('[data-add-slot]').first().click();
      },
      type: async (page) => {
        await page.getByPlaceholder('Search by name or number...').locator('visible=true').first().click();
        await page.keyboard.type('char', { delay: 250 });
      },
      add: async (page) => {
        await page.getByText('Charmander', { exact: true }).locator('visible=true').first().click();
      },
    },
  },
  'dex-full': {
    path: '/pokedex-builder',
    ready: '[data-nav="view"]',
    fullDex: true,
    steps: {
      view: async (page) => {
        await page.locator('[data-nav="view"]').locator('visible=true').first().click();
      },
    },
  },
  league: {
    path: '/custom-gym-leader',
    ready: '[data-testid="league-slot-0"]',
    steps: {
      slot: async (page) => {
        await page.locator('[data-testid="league-slot-0"]').click();
      },
    },
  },
};

// Runs in the page before any app script.
function observe(readySelector) {
  const perf = { lcp: 0, cls: 0, long: [], events: [], ready: null };
  window.__lab = perf;
  const watch = (type, fn) => new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true });
  watch('largest-contentful-paint', (e) => { perf.lcp = e.startTime; });
  watch('layout-shift', (e) => { if (!e.hadRecentInput) perf.cls += e.value; });
  watch('longtask', (e) => perf.long.push([e.startTime, e.duration]));
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.interactionId) perf.events.push(e.duration);
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  const check = () => {
    if (perf.ready === null && document.querySelector(readySelector)) perf.ready = performance.now();
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true });
}

/** The saved Pokédex a returning visitor with all 151 placed would have. */
async function fullDexFixture(browser, origin) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(`${origin}/pokedex-builder?tune&notme`);
  await page.waitForFunction(() => window.__pokedexStore);
  const saved = await page.evaluate(async () => {
    const store = window.__pokedexStore;
    store.setState({
      sections: { ...store.getState().sections, other: Array.from({ length: 151 }, (_, i) => i + 1) },
      milestoneMax: 151,
      milestoneCelebrated: [25, 100, 151],
      milestoneCelebration: null,
    });
    await new Promise((r) => setTimeout(r, 300));
    return localStorage.getItem('personal-151-pokedex-v3');
  });
  await context.close();
  return saved;
}

async function measure(browser, origin, profile, spec, fixture) {
  const context = await browser.newContext({ ...profile.context, ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  await context.addInitScript(() => localStorage.setItem('p151-league-promo-seen', '1'));
  if (spec.fullDex) await context.addInitScript((saved) => localStorage.setItem('personal-151-pokedex-v3', saved), fixture);
  await context.addInitScript(observe, spec.ready);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.network });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  await page.goto(`${origin}${spec.path}?notme`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__lab.ready !== null, null, { timeout: 60_000 });
  await page.waitForTimeout(4000);
  const result = await page.evaluate(() => {
    const lab = window.__lab;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    return {
      fcp,
      lcp: lab.lcp,
      cls: lab.cls,
      tbt: lab.long.filter(([start]) => start > fcp).reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0),
      ready: lab.ready,
      dom: document.getElementsByTagName('*').length,
    };
  });
  for (const [name, step] of Object.entries(spec.steps ?? {})) {
    await page.evaluate(() => { window.__lab.events = []; });
    await step(page);
    await page.waitForTimeout(1500);
    result[`inp:${name}`] = await page.evaluate(() => Math.max(0, ...window.__lab.events));
  }
  await context.close();
  return result;
}

holdBrowserLock();

{
  const work = fs.mkdtempSync(path.join(tmpdir(), 'my151-lab-'));
  const servers = [];
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--allow-insecure-localhost'] });
  try {
    const tls = selfSignedTls(work);

    const builds = [['candidate', build(work, 'candidate', null)]];
    if (BASE) builds.unshift(['base', build(work, 'base', BASE)]);
    const targets = [];
    for (const [label, dist] of builds) {
      const { server, origin } = await serve(dist, tls);
      servers.push(server);
      targets.push({ label, origin, fixture: await fullDexFixture(browser, origin) });
    }

    const cases = Object.entries(CASES).filter(([name]) => !CASE_NAMES || CASE_NAMES.includes(name));
    const samples = {};
    for (const profileName of PROFILE_NAMES) {
      for (let run = 1; run <= RUNS; run++) {
        process.stdout.write(`\r${profileName}: run ${run} of ${RUNS}   `);
        for (const [caseName, spec] of cases) {
          for (const target of targets) {
            const result = await measure(browser, target.origin, PROFILES[profileName], spec, target.fixture);
            for (const [metric, value] of Object.entries(result)) {
              ((samples[`${profileName} ${caseName} ${metric}`] ??= {})[target.label] ??= []).push(value);
            }
          }
        }
      }
      process.stdout.write('\n');
    }

    // One row per profile and case. A cell is the candidate median, or
    // "base → candidate" with the change when there is a base.
    const METRICS = ['lcp', 'fcp', 'tbt', 'ready', 'cls', 'dom'];
    const table = new Map();
    for (const [key, byTarget] of Object.entries(samples)) {
      const [profileName, caseName, metric] = key.split(' ');
      const cand = median(byTarget.candidate);
      const show = (v) => (metric === 'cls' ? v.toFixed(3) : String(Math.round(v)));
      let cell = show(cand);
      if (byTarget.base) {
        const { base, delta, verdict } = compare(byTarget.base, byTarget.candidate);
        const mark = { better: ' better', worse: ' **WORSE**', same: '' }[verdict];
        cell = `${show(base)} → ${show(cand)}${base ? ` (${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}%)` : ''}${mark}`;
      }
      const row = `${profileName} ${caseName}`;
      if (!table.has(row)) table.set(row, {});
      table.get(row)[metric] = cell;
    }
    const columns = [...METRICS, ...new Set([...table.values()].flatMap((r) => Object.keys(r).filter((k) => k.startsWith('inp:'))))];
    console.log(`\n${BASE ? `Base ${BASE} → working tree.` : 'Working tree.'} Median of ${RUNS} runs, milliseconds.\n`);
    console.log(`| Case | ${columns.join(' | ')} |`);
    console.log(`|---|${columns.map(() => '---:').join('|')}|`);
    for (const [row, cells] of table) console.log(`| ${row} | ${columns.map((c) => cells[c] ?? '').join(' | ')} |`);
    const report = path.join(work, 'lab-report.json');
    fs.writeFileSync(report, JSON.stringify({ base: BASE, runs: RUNS, samples }, null, 2));
    console.log(`\nRaw samples: ${report}`);
  } finally {
    await browser.close();
    servers.forEach((s) => s.close());
    for (const entry of fs.readdirSync(work)) if (entry.endsWith('-dist')) fs.rmSync(path.join(work, entry), { recursive: true, force: true });
  }
}
