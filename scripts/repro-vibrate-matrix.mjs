/**
 * Aggressive vibration hunt for useFitScale.
 * Writes NDJSON to /opt/cursor/artifacts/vibrate-debug/matrix.jsonl
 */
import { chromium, firefox } from 'playwright';
import fs from 'node:fs';

const OUT_DIR = '/opt/cursor/artifacts/vibrate-debug';
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = `${OUT_DIR}/matrix.jsonl`;
fs.writeFileSync(OUT, '');

const LOCAL = process.env.URL || 'http://127.0.0.1:4180/custom-gym-leader';
const PROD = 'https://my151.app/custom-gym-leader';

function log(row) {
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  const mark = row.vibrating ? 'VIBRATE' : row.error ? 'ERR' : 'ok';
  console.log(
    `[${mark}] ${row.engine} ${row.case} sets=${row.setCount ?? '?'} lateZ=${row.lateZoomChanges ?? '?'} lateW=${row.lateWidthChanges ?? '?'} lateBox=${row.lateBoxHChanges ?? '?'}`,
  );
}

const CASES = [
  // Bug report baseline
  { name: 'report', url: LOCAL, w: 912, h: 705, dpr: 2 },
  { name: 'prod-report', url: PROD, w: 912, h: 705, dpr: 2 },
  // Classic scrollbar + near-fit heights
  { name: 'classic-sb', url: LOCAL, w: 912, h: 705, dpr: 2, classicSb: true },
  { name: 'classic-sb-always', url: LOCAL, w: 912, h: 705, dpr: 2, classicSb: 'always' },
  // Height sweep near content fit (footer still below — try taller too)
  { name: 'h640-sb', url: LOCAL, w: 912, h: 640, dpr: 2, classicSb: true },
  { name: 'h760-sb', url: LOCAL, w: 912, h: 760, dpr: 2, classicSb: true },
  { name: 'h800-sb', url: LOCAL, w: 912, h: 800, dpr: 2, classicSb: true },
  { name: 'h900-sb', url: LOCAL, w: 912, h: 900, dpr: 2, classicSb: true },
  { name: 'h1000-sb', url: LOCAL, w: 912, h: 1000, dpr: 2, classicSb: true },
  { name: 'h1100-sb', url: LOCAL, w: 912, h: 1100, dpr: 2, classicSb: true },
  // Widths that change rem / room
  { name: 'w880', url: LOCAL, w: 880, h: 705, dpr: 2, classicSb: true },
  { name: 'w1023-sb', url: LOCAL, w: 1023, h: 705, dpr: 2, classicSb: true },
  { name: 'desktop-grow-sb', url: LOCAL, w: 1280, h: 705, dpr: 2, classicSb: true },
  { name: 'desktop-grow-tall', url: LOCAL, w: 1280, h: 900, dpr: 2, classicSb: true },
  // Card open (second fit target)
  { name: 'card-open-sb', url: LOCAL, w: 912, h: 705, dpr: 2, classicSb: true, openCard: true },
  // Force overflow toggle every frame via injected script
  { name: 'force-overflow-toggle', url: LOCAL, w: 912, h: 705, dpr: 2, forceOverflowToggle: true },
  // Browser zoom simulation via CDP/emulation — change outer size mid-flight
  { name: 'resize-jitter', url: LOCAL, w: 912, h: 705, dpr: 2, resizeJitter: true },
  // DPR 1 vs 2
  { name: 'dpr1-sb', url: LOCAL, w: 912, h: 705, dpr: 1, classicSb: true },
  { name: 'dpr3-sb', url: LOCAL, w: 912, h: 705, dpr: 3, classicSb: true },
  // Remove truncate to revive wrap feedback (hypothesis: wrap loop)
  { name: 'no-truncate', url: LOCAL, w: 912, h: 705, dpr: 2, stripTruncate: true },
  // Narrow host so width/squash wrap more
  { name: 'narrow-390', url: LOCAL, w: 390, h: 700, dpr: 2, classicSb: true },
  { name: 'narrow-notrunc', url: LOCAL, w: 360, h: 640, dpr: 2, stripTruncate: true },
];

async function run(engineName, browserType, c) {
  const browser = await browserType.launch();
  const page = await browser.newPage({
    viewport: { width: c.w, height: c.h },
    deviceScaleFactor: c.dpr ?? 2,
  });

  await page.addInitScript((opts) => {
    window.__fitProbe = {
      computes: [],
      sets: [],
      fontSets: [],
      started: performance.now(),
    };

    // Patch history of setFit via style mutation on zoomed node + RO count
    const OrigRO = window.ResizeObserver;
    window.ResizeObserver = class extends OrigRO {
      constructor(cb) {
        super((entries, obs) => {
          window.__fitProbe.ro = (window.__fitProbe.ro || 0) + 1;
          cb(entries, obs);
        });
      }
    };

    if (opts.classicSb) {
      const style = document.createElement('style');
      style.textContent = `
        html { scrollbar-width: thin !important; }
        [data-lg-viewport] {
          scrollbar-gutter: auto !important;
          ${opts.classicSb === 'always' ? 'overflow-y: scroll !important;' : ''}
        }
      `;
      document.documentElement.appendChild(style);
      // Also set the app's own ?fitDebugSb flag via history if possible later
    }

    if (opts.forceOverflowToggle) {
      // After load, alternate min-height on footer to flip overflow each rAF
      document.addEventListener('DOMContentLoaded', () => {
        let on = false;
        const tick = () => {
          const foot = document.querySelector('[data-lg-viewport]:not([inert]) footer, [data-lg-viewport]:not([inert]) [class*="footer"]');
          const pane = document.querySelector('[data-lg-viewport]:not([inert])');
          if (pane) {
            on = !on;
            pane.style.minHeight = on ? '100%' : '101%';
            // toggle a spacer
            let sp = document.getElementById('__vib_sp');
            if (!sp) {
              sp = document.createElement('div');
              sp.id = '__vib_sp';
              pane.appendChild(sp);
            }
            sp.style.height = on ? '0px' : '40px';
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }
  }, {
    classicSb: c.classicSb || false,
    forceOverflowToggle: !!c.forceOverflowToggle,
  });

  const gotoUrl = c.classicSb
    ? c.url + (c.url.includes('?') ? '&' : '?') + 'fitDebugSb=1'
    : c.url;

  try {
    await page.goto(gotoUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    await browser.close();
    log({ engine: engineName, case: c.name, error: `goto: ${e}` });
    return;
  }

  try {
    await page.waitForSelector('[data-testid="league-slot-0"]', { timeout: 20000 });
  } catch {
    await browser.close();
    log({ engine: engineName, case: c.name, error: 'no slot' });
    return;
  }

  if (c.stripTruncate) {
    await page.evaluate(() => {
      document.querySelectorAll('[data-fit-tail] .truncate').forEach((el) => {
        el.classList.remove('truncate');
        el.style.whiteSpace = 'normal';
        // Make text long enough to wrap at some widths
        if (el.textContent && el.textContent.length < 80) {
          el.textContent = el.textContent + ' — extra words to force wrap at narrow zoomed widths xyz';
        }
      });
    });
  }

  if (c.openCard) {
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForTimeout(800);
  }

  // Capture __fitLog from app instrumentation if present, every 50ms
  if (c.resizeJitter) {
    for (let i = 0; i < 20; i++) {
      await page.setViewportSize({
        width: c.w + (i % 2),
        height: c.h + (i % 2 === 0 ? 0 : 1),
      });
      await page.waitForTimeout(50);
    }
    await page.setViewportSize({ width: c.w, height: c.h });
  }

  // Warm 1.5s then sample 60 frames + read __fitLog
  await page.waitForTimeout(1500);

  const result = await page.evaluate(async () => {
    const pane = [...document.querySelectorAll('[data-lg-viewport]')].find(
      (vp) => !vp.hasAttribute('inert'),
    );
    const fit =
      pane?.querySelector('div[style*="zoom"]') ||
      document.querySelector('div[style*="zoom"]');

    const samples = [];
    await new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        if (fit && pane) {
          const box = fit.getBoundingClientRect();
          samples.push({
            z: fit.style.zoom,
            w: fit.style.width,
            bh: Math.round(box.height * 100) / 100,
            bw: Math.round(box.width * 100) / 100,
            sh: pane.scrollHeight,
            ch: pane.clientHeight,
            cw: pane.clientWidth,
            overflow: pane.scrollHeight - pane.clientHeight,
            rootFs: document.documentElement.style.fontSize,
          });
        }
        n++;
        if (n < 60) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

    const changes = (key) =>
      samples.filter((s, i) => i > 0 && s[key] !== samples[i - 1][key]).length;

    // Detect A-B-A pattern in zoom
    const zs = samples.map((s) => s.z);
    let aba = 0;
    for (let i = 2; i < zs.length; i++) {
      if (zs[i] === zs[i - 2] && zs[i] !== zs[i - 1]) aba++;
    }

    const fitLog = window.__fitLog || [];
    const unique = (arr) => [...new Set(arr)];

    return {
      sampleN: samples.length,
      lateZoomChanges: changes('z'),
      lateWidthChanges: changes('w'),
      lateBoxHChanges: changes('bh'),
      lateOverflowChanges: changes('overflow'),
      lateFsChanges: changes('rootFs'),
      lateUniqueZooms: unique(zs),
      lateUniqueWidths: unique(samples.map((s) => s.w)),
      lateUniqueOverflow: unique(samples.map((s) => s.overflow)),
      abaZoomPairs: aba,
      fitLogN: fitLog.length,
      fitLogTail: fitLog.slice(-12),
      fitLogUniqueNext: unique(fitLog.map((e) => Math.round(e.next * 1000) / 1000)),
      fitLogUniqueWidth: unique(fitLog.map((e) => Math.round(e.width))),
      fitLogUniqueOverflow: unique(fitLog.map((e) => e.scrollOverflow)),
      // flips: consecutive overflow sign or large swings
      overflowFlips: fitLog.filter((e, i) => {
        if (i === 0) return false;
        const a = fitLog[i - 1].scrollOverflow;
        const b = e.scrollOverflow;
        return (a <= 0 && b > 2) || (a > 2 && b <= 0);
      }).length,
      first: samples[0],
      last: samples.at(-1),
      roCalls: window.__fitProbe?.ro,
    };
  });

  // Keep collecting fitLog a bit longer after stripTruncate (layout may settle slow)
  if (c.stripTruncate) {
    await page.waitForTimeout(1000);
    const extra = await page.evaluate(() => ({
      fitLogN: (window.__fitLog || []).length,
      fitLogTail: (window.__fitLog || []).slice(-20),
    }));
    result.fitLogN = extra.fitLogN;
    result.fitLogTail = extra.fitLogTail;
  }

  await browser.close();

  const vibrating =
    result.lateZoomChanges > 4 ||
    result.lateWidthChanges > 4 ||
    result.lateBoxHChanges > 20 ||
    result.abaZoomPairs > 5 ||
    (result.fitLogN || 0) > 15 ||
    (result.overflowFlips || 0) > 4;

  log({
    engine: engineName,
    case: c.name,
    size: `${c.w}x${c.h}@${c.dpr}`,
    vibrating,
    setCount: result.fitLogN,
    ...result,
  });
}

for (const [name, eng] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  for (const c of CASES) {
    // Skip prod for every engine combo after first if slow — still run both
    try {
      await run(name, eng, c);
    } catch (e) {
      log({ engine: name, case: c.name, error: String(e) });
    }
  }
}

console.log('Wrote', OUT);
