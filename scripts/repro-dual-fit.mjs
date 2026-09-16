/**
 * Isolate: does the off-screen card pane's useFitScale thrash?
 * Does unmounting the card pane stop anything?
 * Does grow-mode room oscillation appear with classic SB near width bind?
 */
import { firefox, chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/opt/cursor/artifacts/vibrate-debug/dual-fit.jsonl';
fs.writeFileSync(OUT, '');
const URL = 'http://127.0.0.1:4180/custom-gym-leader';

async function run(engine, browserType, opts) {
  const browser = await browserType.launch();
  const page = await browser.newPage({
    viewport: { width: opts.w, height: opts.h },
    deviceScaleFactor: 2,
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="league-slot-0"]');

  if (opts.hideCardPane) {
    await page.evaluate(() => {
      const panes = [...document.querySelectorAll('[data-lg-viewport]')];
      // second pane is the card
      if (panes[1]) panes[1].remove();
    });
    await page.waitForTimeout(500);
  }

  if (opts.openCard) {
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(1500);

  const r = await page.evaluate(async () => {
    const panes = [...document.querySelectorAll('[data-lg-viewport]')];
    const fits = panes.map((pane, i) => {
      const fit = pane.querySelector('div[style*="zoom"]');
      return {
        i,
        inert: pane.hasAttribute('inert'),
        zoom: fit?.style.zoom,
        width: fit?.style.width,
        ov: pane.scrollHeight - pane.clientHeight,
      };
    });

    // Sample all zoom nodes for 60 frames
    const nodes = [...document.querySelectorAll('div[style*="zoom"]')];
    const series = nodes.map(() => []);
    for (let f = 0; f < 60; f++) {
      await new Promise((r) => requestAnimationFrame(r));
      nodes.forEach((n, i) => {
        series[i].push({ z: n.style.zoom, w: n.style.width });
      });
    }
    const summary = series.map((s) => ({
      zChg: s.filter((x, i) => i > 0 && x.z !== s[i - 1].z).length,
      wChg: s.filter((x, i) => i > 0 && x.w !== s[i - 1].w).length,
      uniqZ: [...new Set(s.map((x) => x.z))],
      uniqW: [...new Set(s.map((x) => x.w))],
    }));

    return {
      fits,
      summary,
      fitLogN: (window.__fitLog || []).length,
      // Note: __fitLog merges both hooks' setFit calls
      fitTail: (window.__fitLog || []).slice(-12),
      modes: [...new Set((window.__fitLog || []).map((e) => e.mode))],
    };
  });

  await browser.close();
  const vibrating = r.summary.some((s) => s.zChg > 5) || r.fitLogN > 20;
  const row = { engine, ...opts, vibrating, ...r };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(
    JSON.stringify({
      engine,
      case: opts.name,
      vibrating,
      fitLogN: r.fitLogN,
      modes: r.modes,
      summary: r.summary,
      fits: r.fits,
    }),
  );
}

const cases = [
  { name: 'mobile-both', w: 912, h: 705 },
  { name: 'mobile-hide-card', w: 912, h: 705, hideCardPane: true },
  { name: 'mobile-open-card', w: 912, h: 705, openCard: true },
  { name: 'desktop-solo', w: 1280, h: 705 },
  { name: 'desktop-open', w: 1280, h: 705, openCard: true },
  // Desktop width where room ≈ baseWidth so wScale≈1 — sensitive
  { name: 'desktop-narrowish', w: 1100, h: 800, openCard: true },
];

for (const [n, e] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  for (const c of cases) {
    await run(n, e, c);
  }
}
