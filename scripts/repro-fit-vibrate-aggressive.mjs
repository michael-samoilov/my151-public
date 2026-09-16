/**
 * Catch fit vibration from first paint, with optional classic scrollbar force.
 */
import { chromium, firefox } from 'playwright';
import fs from 'node:fs';

const URL = process.env.URL || 'http://127.0.0.1:4180/custom-gym-leader';
const OUT = '/opt/cursor/artifacts/fit-vibrate-aggressive.jsonl';
fs.writeFileSync(OUT, '');

const CASES = [
  { name: 'report', width: 912, height: 705, forceScrollbar: false },
  { name: 'report+classic-sb', width: 912, height: 705, forceScrollbar: true },
  { name: 'report+always-scroll', width: 912, height: 705, forceScrollbar: 'always' },
  { name: '705-tight', width: 912, height: 680, forceScrollbar: true },
  { name: '720', width: 912, height: 720, forceScrollbar: true },
  { name: 'card-open', width: 912, height: 705, forceScrollbar: true, openCard: true },
  { name: 'desktop-grow', width: 1280, height: 705, forceScrollbar: true },
];

async function run(engineName, browserType, c) {
  const browser = await browserType.launch();
  const page = await browser.newPage({
    viewport: { width: c.width, height: c.height },
    deviceScaleFactor: 2,
  });

  // Instrument before any app script: wrap ResizeObserver and watch style.
  await page.addInitScript((force) => {
    window.__vib = {
      roCalls: 0,
      zoomSets: [],
      widthSets: [],
      fontSets: [],
      started: performance.now(),
    };

    const OrigRO = window.ResizeObserver;
    window.ResizeObserver = class extends OrigRO {
      constructor(cb) {
        super((entries, obs) => {
          window.__vib.roCalls++;
          cb(entries, obs);
        });
      }
    };

    if (force === true || force === 'always') {
      const style = document.createElement('style');
      style.textContent = `
        * { scrollbar-width: thin !important; }
        [data-lg-viewport] {
          scrollbar-gutter: auto !important;
          ${force === 'always' ? 'overflow-y: scroll !important;' : ''}
        }
        /* Approximate classic Mac scrollbar taking layout space */
        [data-lg-viewport]::-webkit-scrollbar { width: 15px; }
      `;
      document.documentElement.appendChild(style);
    }

    const watch = () => {
      const root = document.documentElement;
      const mo = new MutationObserver(() => {
        const fs = root.style.fontSize;
        const last = window.__vib.fontSets.at(-1);
        if (fs && fs !== last) window.__vib.fontSets.push(fs);
      });
      mo.observe(root, { attributes: true, attributeFilter: ['style'] });

      const tick = () => {
        const fit = document.querySelector('[data-lg-viewport]:not([inert]) div[style*="zoom"]');
        if (fit) {
          const z = fit.style.zoom;
          const w = fit.style.width;
          const lz = window.__vib.zoomSets.at(-1);
          const lw = window.__vib.widthSets.at(-1);
          if (z && z !== lz) window.__vib.zoomSets.push(z);
          if (w && w !== lw) window.__vib.widthSets.push(w);
        }
        if (performance.now() - window.__vib.started < 2500) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', watch);
    } else {
      watch();
    }
  }, c.forceScrollbar);

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('[data-testid="league-slot-0"]', { timeout: 15000 });
  } catch {
    await browser.close();
    return { engine: engineName, case: c.name, error: 'no slot' };
  }

  if (c.openCard) {
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]', { timeout: 10000 }).catch(() => {});
  }

  await page.waitForTimeout(2600);

  const vib = await page.evaluate(() => {
    const fit = document.querySelector('[data-lg-viewport]:not([inert]) div[style*="zoom"]');
    const pane = document.querySelector('[data-lg-viewport]:not([inert])');
    const samples = [];
    // Final 45-frame window after the 2.5s window
    return new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        if (fit) {
          const box = fit.getBoundingClientRect();
          samples.push({
            z: fit.style.zoom,
            w: fit.style.width,
            bh: box.height,
            bw: box.width,
            sh: pane?.scrollHeight,
            ch: pane?.clientHeight,
          });
        }
        n++;
        if (n < 45) requestAnimationFrame(tick);
        else {
          const changes = (arr, key) =>
            arr.filter((s, i) => i > 0 && s[key] !== arr[i - 1][key]).length;
          resolve({
            ...window.__vib,
            lateZoomChanges: changes(samples, 'z'),
            lateWidthChanges: changes(samples, 'w'),
            lateBoxHChanges: changes(samples, 'bh'),
            lateUniqueZooms: [...new Set(samples.map((s) => s.z))],
            lateUniqueWidths: [...new Set(samples.map((s) => s.w))],
            scrollOverflow: pane ? pane.scrollHeight - pane.clientHeight : null,
            final: samples.at(-1),
          });
        }
      };
      requestAnimationFrame(tick);
    });
  });

  await browser.close();

  const vibrating =
    vib.zoomSets.length > 8 ||
    vib.widthSets.length > 8 ||
    vib.lateZoomChanges > 3 ||
    vib.lateWidthChanges > 3 ||
    vib.lateBoxHChanges > 15;

  const row = {
    engine: engineName,
    case: c.name,
    size: `${c.width}x${c.height}`,
    forceScrollbar: c.forceScrollbar,
    vibrating,
    roCalls: vib.roCalls,
    zoomSetCount: vib.zoomSets?.length,
    widthSetCount: vib.widthSets?.length,
    fontSetCount: vib.fontSets?.length,
    zoomSetsHead: vib.zoomSets?.slice(0, 12),
    widthSetsHead: vib.widthSets?.slice(0, 12),
    lateZoomChanges: vib.lateZoomChanges,
    lateWidthChanges: vib.lateWidthChanges,
    lateBoxHChanges: vib.lateBoxHChanges,
    lateUniqueZooms: vib.lateUniqueZooms,
    scrollOverflow: vib.scrollOverflow,
    final: vib.final,
    error: vib.error,
  };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
  return row;
}

for (const [name, eng] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  for (const c of CASES) {
    try {
      await run(name, eng, c);
    } catch (e) {
      console.log(JSON.stringify({ engine: name, case: c.name, error: String(e) }));
    }
  }
}
