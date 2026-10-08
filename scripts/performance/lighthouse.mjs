#!/usr/bin/env node
/**
 * PageSpeed Insights, run here: Lighthouse on production (or any git ref)
 * against the working tree, with guards that stop a change which only
 * games the score.
 *
 *   node scripts/performance/lighthouse.mjs                    # 3 runs, every page, both profiles
 *   node scripts/performance/lighthouse.mjs --page hub --profile mobile --runs 5
 *   node scripts/performance/lighthouse.mjs --base HEAD~1
 *   node scripts/performance/lighthouse.mjs --no-base          # the issue list for this tree
 *   node scripts/performance/lighthouse.mjs --url https://my151.app   # a deployed site
 *
 * Lighthouse is the engine behind PageSpeed Insights, with the same mobile and
 * desktop presets and the same simulated throttling. This script installs a
 * pinned Lighthouse into the user cache on first use, so the app's own
 * dependencies do not change.
 *
 * Builds are served over HTTP/2 with Brotli, like the Vercel edge (see
 * lab-server.mjs). `--url` loads `<url><path>?notme`, so the runs stay out of
 * the analytics. Through a proxy that speaks HTTP/1.1, the HTTP/2 findings and
 * the network timings of a `--url` run are worse than the site's.
 *
 * Guards. Each one stops a way to raise the score without a faster page:
 *
 * - Speed: FCP, LCP, Speed Index, TBT, and CLS must not get worse. Neither may
 *   the last visual change, so content cannot move later to make the first
 *   paint early.
 * - LCP element: a different largest element means content was hidden, cut,
 *   or replaced. A person decides.
 * - Accessibility, best practices, and SEO: no score drop and no audit that
 *   passed before and fails now. "Serves images with appropriate resolution"
 *   is a best-practices audit, so images cannot get blurrier.
 * - Same page: after load, each page and profile must match the base pixel
 *   for pixel, with the same text and no image shown at a lower resolution.
 *   A difference is a visible change: it goes to Michael before it ships.
 * - INP is not measured here, because Lighthouse loads pages without tapping
 *   them. `lab.mjs` measures it. Run both.
 *
 * Exit status: 0 when every guard passes, 1 when one fails. The last line says
 * whether the change is visible.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { PRODUCTION, build, chromiumPath, compare, holdBrowserLock, median, selfSignedTls, serve } from './lab-server.mjs';

const LIGHTHOUSE_VERSION = '12.8.2';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const URL_TARGET = flag('url', null)?.replace(/\/$/, '');
const RUNS = Number(flag('runs', 3));
const BASE = URL_TARGET || args.includes('--no-base') ? null : flag('base', PRODUCTION);
const PROFILE_NAMES = flag('profile', 'mobile,desktop').split(',');
const PAGES = {
  hub: '/',
  dex: '/pokedex-builder',
  league: '/custom-gym-leader',
  favorites: '/favorite-pokemon-picker',
};
const PAGE_NAMES = flag('page', Object.keys(PAGES).join(',')).split(',');
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const METRICS = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  si: 'speed-index',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
};
// The smallest change a guard counts. Calibrated on two identical builds:
// smaller differences come and go between runs.
const FLOOR = { fcp: 50, lcp: 50, si: 50, tbt: 30, cls: 0.01, lastVisualChange: 100 };
// The Lighthouse viewports, for the same-page check.
const VIEWPORTS = {
  mobile: { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1350, height: 940 }, deviceScaleFactor: 1 },
};

/** Installs the pinned Lighthouse once into the user cache, then imports it. */
async function loadLighthouse() {
  const dir = path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), 'my151-lighthouse', LIGHTHOUSE_VERSION);
  const entry = path.join(dir, 'node_modules/lighthouse/core/index.js');
  if (!fs.existsSync(entry)) {
    console.log(`Installing Lighthouse ${LIGHTHOUSE_VERSION} into ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('npm', ['install', '--prefix', dir, '--no-audit', '--no-fund', `lighthouse@${LIGHTHOUSE_VERSION}`], { stdio: 'inherit' });
  }
  const mod = (rel) => import(pathToFileURL(path.join(dir, 'node_modules', rel)).href);
  return {
    lighthouse: (await mod('lighthouse/core/index.js')).default,
    desktopConfig: (await mod('lighthouse/core/config/desktop-config.js')).default,
    launch: (await mod('chrome-launcher/dist/index.js')).launch,
  };
}

/** The parts of one Lighthouse report the guards and the issue list read. */
function digest(lhr) {
  if (lhr.runtimeError) throw new Error(`Lighthouse could not load ${lhr.requestedUrl}: ${lhr.runtimeError.code}`);
  const audits = lhr.audits;
  const categoryOf = {};
  for (const [id, category] of Object.entries(lhr.categories)) for (const ref of category.auditRefs) categoryOf[ref.id] ??= id;
  const scored = (a) => a.score !== null && ['binary', 'numeric', 'metricSavings'].includes(a.scoreDisplayMode);
  const lcpNode = audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node;
  const observed = audits.metrics?.details?.items?.[0] ?? {};
  return {
    scores: Object.fromEntries(CATEGORIES.map((c) => [c, Math.round((lhr.categories[c]?.score ?? 0) * 100)])),
    metrics: {
      ...Object.fromEntries(Object.entries(METRICS).map(([k, id]) => [k, audits[id].numericValue])),
      lastVisualChange: observed.observedLastVisualChange ?? 0,
    },
    lcpElement: lcpNode ? `${lcpNode.selector} (${lcpNode.nodeLabel})` : 'none',
    failing: Object.fromEntries(
      Object.values(audits)
        .filter((a) => scored(a) && a.score < 0.9 && !Object.values(METRICS).includes(a.id))
        .map((a) => [a.id, { title: a.title, category: categoryOf[a.id] ?? 'insight', display: a.displayValue ?? '', savings: a.metricSavings ?? {} }]),
    ),
  };
}

async function runLighthouse(lh, port, url, profile) {
  const flags = { port, output: 'json', logLevel: 'error', onlyCategories: CATEGORIES };
  const result = await lh.lighthouse(url, flags, profile === 'desktop' ? lh.desktopConfig : undefined);
  return digest(result.lhr);
}

/** The settled page: a screenshot, its text, and how sharp each image is. */
async function snapshot(browser, url, profile) {
  const context = await browser.newContext({ ...VIEWPORTS[profile], ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const png = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  const { text, images } = await page.evaluate(() => ({
    text: document.body.innerText,
    images: [...document.images]
      .filter((img) => img.getBoundingClientRect().width > 0 && img.complete && img.naturalWidth > 0)
      .map((img) => ({
        name: img.alt || img.currentSrc.split('/').pop(),
        sharpness: img.naturalWidth / (img.getBoundingClientRect().width * devicePixelRatio),
      })),
  }));
  await context.close();
  return { png, text, images };
}

/**
 * Counts the pixels where `cand` differs from `base`, skipping pixels where
 * two loads of the base already differ from each other. Runs in the browser,
 * so no image library is needed.
 */
async function pixelDiff(browser, base, base2, cand) {
  if (base.equals(cand)) return { count: 0 };
  const context = await browser.newContext();
  const page = await context.newPage();
  const result = await page.evaluate(async ([a, a2, b]) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height);
    };
    const [p, p2, q] = await Promise.all([load(a), load(a2), load(b)]);
    if (p.width !== q.width || p.height !== q.height) return { count: -1, size: `${p.width}x${p.height} → ${q.width}x${q.height}` };
    const same = (x, y, i) => Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2]) <= 24;
    const noisy = p2.width === p.width && p2.height === p.height ? (i) => !same(p, p2, i) : () => false;
    let count = 0;
    let box = [Infinity, Infinity, -1, -1];
    for (let i = 0; i < p.data.length; i += 4) {
      if (same(p, q, i) || noisy(i)) continue;
      count++;
      const x = (i / 4) % p.width;
      const y = Math.floor(i / 4 / p.width);
      box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
    }
    return { count, box: count ? `x ${box[0]}–${box[2]}, y ${box[1]}–${box[3]}` : '' };
  }, [base, base2, cand].map((b) => b.toString('base64')));
  await context.close();
  return result;
}

function firstTextDifference(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return `line ${i + 1}: "${(x[i] ?? '').slice(0, 60)}" → "${(y[i] ?? '').slice(0, 60)}"`;
  }
  return '';
}

const show = (metric, v) => (metric === 'cls' ? v.toFixed(3) : `${Math.round(v)}`);

holdBrowserLock();

{
  const lh = await loadLighthouse();
  const work = fs.mkdtempSync(path.join(tmpdir(), 'my151-lighthouse-'));
  const out = path.join(work, 'shots');
  fs.mkdirSync(out);
  const servers = [];
  const tls = URL_TARGET ? null : selfSignedTls(work);
  // Trust the lab's own certificate, and only it. A certificate error would
  // also stop the service worker, which Lighthouse reports as a console error.
  const trust = tls ? [`--ignore-certificate-errors-spki-list=${tls.spki}`] : [];
  const chrome = await lh.launch({ chromePath: chromiumPath(), chromeFlags: ['--headless=new', '--no-sandbox', ...trust] });
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: trust });
  try {
    const targets = [];
    if (URL_TARGET) targets.push({ label: 'candidate', origin: URL_TARGET });
    else {
      const builds = [['candidate', build(work, 'candidate', null)]];
      if (BASE) builds.unshift(['base', build(work, 'base', BASE)]);
      for (const [label, dist] of builds) {
        const { server, origin } = await serve(dist, tls);
        servers.push(server);
        targets.push({ label, origin });
      }
    }

    // runs[profile][page][label] = digests
    const runs = {};
    for (const profile of PROFILE_NAMES) {
      for (const pageName of PAGE_NAMES) {
        for (let run = 1; run <= RUNS; run++) {
          process.stdout.write(`\r${profile} ${pageName}: run ${run} of ${RUNS}        `);
          // Alternate base and candidate, so drift on the machine hits both.
          for (const { label, origin } of targets) {
            const digestOfRun = await runLighthouse(lh, chrome.port, `${origin}${PAGES[pageName]}?notme`, profile);
            (((runs[profile] ??= {})[pageName] ??= {})[label] ??= []).push(digestOfRun);
          }
        }
      }
    }
    process.stdout.write('\n');

    const guards = [];
    const fail = (where, what) => guards.push(`FAIL  ${where}: ${what}`);
    const visible = [];

    // 1. Scores and metrics, base → candidate.
    const cols = [...CATEGORIES.map((c) => c.replace('best-practices', 'bp').replace('performance', 'perf').replace('accessibility', 'a11y')), ...Object.keys(METRICS), 'last change'];
    console.log(`\n${BASE ? `Base ${BASE} → working tree.` : URL_TARGET ?? 'Working tree.'} Median of ${RUNS} Lighthouse ${LIGHTHOUSE_VERSION} runs. Times in ms.\n`);
    console.log(`| Page | ${cols.join(' | ')} | LCP element |`);
    console.log(`|---|${cols.map(() => '---:').join('|')}|---|`);
    for (const profile of PROFILE_NAMES) {
      for (const pageName of PAGE_NAMES) {
        const where = `${profile} ${pageName}`;
        const { base, candidate } = runs[profile][pageName];
        const cells = [];
        // `strict`: the score is deterministic, so any drop of the median fails.
        const cell = (samplesOf, metric, showFn, lowerIsBetter, { strict = false, floor = 0 } = {}) => {
          const cand = candidate.map(samplesOf);
          if (!base) return showFn(median(cand));
          const c = compare(base.map(samplesOf), cand);
          let verdict = lowerIsBetter ? c.verdict : { better: 'worse', worse: 'better', same: 'same' }[c.verdict];
          if (Math.abs(c.cand - c.base) <= floor) verdict = 'same';
          if (strict) verdict = c.cand < c.base ? 'worse' : c.cand > c.base ? 'better' : 'same';
          if (verdict === 'worse') fail(where, `${metric} ${showFn(c.base)} → ${showFn(c.cand)}`);
          const mark = { better: ' better', worse: ' **WORSE**', same: '' }[verdict];
          return c.base === c.cand ? showFn(c.cand) : `${showFn(c.base)} → ${showFn(c.cand)}${mark}`;
        };
        for (const c of CATEGORIES) cells.push(cell((d) => d.scores[c], `${c} score`, (v) => `${v}`, false, { strict: c !== 'performance' }));
        for (const m of Object.keys(METRICS)) cells.push(cell((d) => d.metrics[m], m.toUpperCase(), (v) => show(m, v), true, { floor: FLOOR[m] }));
        cells.push(cell((d) => d.metrics.lastVisualChange, 'last visual change', (v) => show('', v), true, { floor: FLOOR.lastVisualChange }));
        const lcpOf = (digests) => {
          const counts = {};
          for (const d of digests) counts[d.lcpElement] = (counts[d.lcpElement] ?? 0) + 1;
          return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        };
        let lcpCell = lcpOf(candidate);
        if (base && lcpOf(base) !== lcpOf(candidate)) {
          fail(where, `the LCP element changed from ${lcpOf(base)} to ${lcpOf(candidate)}. A person decides whether content was hidden or cut.`);
          lcpCell = `${lcpOf(base)} → ${lcpOf(candidate)}`;
        }
        console.log(`| ${where} | ${cells.join(' | ')} | ${lcpCell.slice(0, 80)} |`);

        // 2. Audits that passed in every base run and fail in every candidate
        // run. A timing audit such as "Max Potential First Input Delay" can
        // pass or fail by chance, so a split result is noise, not a change.
        if (base) {
          const failingIn = (digests) => digests.flatMap((d) => Object.keys(d.failing));
          const everBefore = new Set(failingIn(base));
          for (const id of new Set(failingIn(candidate))) {
            if (everBefore.has(id) || !candidate.every((d) => d.failing[id])) continue;
            const a = candidate.find((d) => d.failing[id]).failing[id];
            fail(where, `${a.category} audit "${a.title}" passed before and fails now ${a.display}`.trim());
          }
        }
      }
    }

    // 3. The issue list for the candidate: what PageSpeed Insights shows.
    console.log('\nOpen findings on the candidate (failing in most runs), largest estimated saving first:\n');
    for (const profile of PROFILE_NAMES) {
      for (const pageName of PAGE_NAMES) {
        const digests = runs[profile][pageName].candidate;
        const counts = {};
        for (const d of digests) for (const id of Object.keys(d.failing)) counts[id] = (counts[id] ?? 0) + 1;
        const ids = Object.keys(counts).filter((id) => counts[id] > digests.length / 2);
        const saving = (id) => Math.max(0, ...Object.entries(digests.find((d) => d.failing[id]).failing[id].savings).map(([k, v]) => (k === 'CLS' ? v * 1000 : v)));
        ids.sort((a, b) => saving(b) - saving(a));
        console.log(`${profile} ${pageName}:`);
        for (const id of ids) {
          const a = digests.find((d) => d.failing[id]).failing[id];
          const savings = Object.entries(a.savings).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${k === 'CLS' ? v.toFixed(3) : `${Math.round(v)} ms`}`).join(', ');
          console.log(`  - [${a.category}] ${a.title}${a.display ? ` — ${a.display}` : ''}${savings ? ` (saves ${savings})` : ''}  \`${id}\``);
        }
      }
    }

    // 4. Same page: the settled screen, its text, and image sharpness.
    if (BASE) {
      console.log('\nComparing the settled pages, base → candidate.');
      const [b, c] = targets;
      for (const profile of PROFILE_NAMES) {
        for (const pageName of PAGE_NAMES) {
          const where = `${profile} ${pageName}`;
          const urlOf = (t) => `${t.origin}${PAGES[pageName]}?notme`;
          const first = await snapshot(browser, urlOf(b), profile);
          const second = await snapshot(browser, urlOf(b), profile);
          const cand = await snapshot(browser, urlOf(c), profile);
          const stem = path.join(out, `${profile}-${pageName}`);
          fs.writeFileSync(`${stem}-base.png`, first.png);
          fs.writeFileSync(`${stem}-candidate.png`, cand.png);
          const diff = await pixelDiff(browser, first.png, second.png, cand.png);
          if (diff.count === -1) visible.push(`${where}: the page size changed, ${diff.size}`);
          else if (diff.count > 0) visible.push(`${where}: ${diff.count} pixels differ (${diff.box})`);
          if (first.text !== cand.text && first.text === second.text) visible.push(`${where}: the text changed, ${firstTextDifference(first.text, cand.text)}`);
          // Pair each image with the same-named image at the same position.
          // An image whose sharpness differs between two loads of the base
          // depends on timing, so it is skipped.
          const nth = (list) => {
            const seen = {};
            return list.map((img) => ({ ...img, key: `${img.name}#${(seen[img.name] = (seen[img.name] ?? 0) + 1)}` }));
          };
          const [b1, b2, c1] = [first, second, cand].map((s) => new Map(nth(s.images).map((img) => [img.key, img.sharpness])));
          for (const [key, sharpness] of c1) {
            const before = b1.get(key);
            if (before === undefined || Math.abs(before - (b2.get(key) ?? -1)) > 0.01) continue;
            if (sharpness < Math.min(1, before) * 0.97) {
              fail(where, `image "${key}" is shown at ${Math.round(sharpness * 100)}% of the screen's resolution, ${Math.round(before * 100)}% before`);
            }
          }
        }
      }
      console.log(`Screenshots: ${out}`);
    }

    console.log('\nGuards:');
    if (!BASE) console.log('  (no base: guards need a base ref)');
    else if (!guards.length) console.log('  PASS  speed, LCP element, accessibility, best practices, SEO, and image sharpness');
    for (const g of guards) console.log(`  ${g}`);
    if (BASE) {
      console.log(visible.length
        ? `\nVisible change. Show Michael before it ships:\n${visible.map((v) => `  - ${v}`).join('\n')}`
        : '\nNo visible change: every settled page matches the base in pixels, text, and image sharpness.');
    }
    const report = path.join(work, 'lighthouse-report.json');
    fs.writeFileSync(report, JSON.stringify({ base: BASE, url: URL_TARGET, runs, guards, visible }, null, 2));
    console.log(`Raw results: ${report}`);
    process.exitCode = guards.length ? 1 : 0;
  } finally {
    await browser.close();
    await chrome.kill();
    servers.forEach((s) => s.close());
    for (const entry of fs.readdirSync(work)) if (entry.endsWith('-dist')) fs.rmSync(path.join(work, entry), { recursive: true, force: true });
  }
}
