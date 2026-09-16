/**
 * Prove font-size ↔ fit coupling: if document clientWidth toggles, rem UI and
 * fit vibrate together. Also stress-test by alternating html overflow.
 */
import { firefox, chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/opt/cursor/artifacts/vibrate-debug/fontsize-loop.jsonl';
fs.writeFileSync(OUT, '');
const URL = 'http://127.0.0.1:4180/custom-gym-leader';

async function run(engine, browserType, mode) {
  const browser = await browserType.launch();
  const page = await browser.newPage({
    viewport: { width: 912, height: 705 },
    deviceScaleFactor: 2,
  });

  if (mode === 'toggle-body-overflow') {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        let on = false;
        const tick = () => {
          let sp = document.getElementById('__ox');
          if (!sp) {
            sp = document.createElement('div');
            sp.id = '__ox';
            sp.style.cssText = 'height:1px;position:absolute;top:0;left:0;';
            document.body.appendChild(sp);
          }
          on = !on;
          // Alternate between causing horizontal overflow and not
          sp.style.width = on ? '200vw' : '1px';
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    });
  }

  if (mode === 'toggle-inner-via-scrollbar') {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        let on = false;
        const tick = () => {
          on = !on;
          document.documentElement.style.overflowY = on ? 'scroll' : 'hidden';
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    });
  }

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(2000);

  const r = await page.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const fit = document.querySelector('[data-lg-viewport]:not([inert]) div[style*="zoom"]');
      samples.push({
        fs: document.documentElement.style.fontSize,
        iw: window.innerWidth,
        cw: document.documentElement.clientWidth,
        zoom: fit?.style.zoom,
        width: fit?.style.width,
        ox: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      });
    }
    const chg = (k) => samples.filter((s, i) => i > 0 && s[k] !== samples[i - 1][k]).length;
    return {
      fitLogN: (window.__fitLog || []).length,
      fitTail: (window.__fitLog || []).slice(-8),
      uniqueFs: [...new Set(samples.map((s) => s.fs))],
      uniqueIw: [...new Set(samples.map((s) => s.iw))],
      uniqueCw: [...new Set(samples.map((s) => s.cw))],
      uniqueZoom: [...new Set(samples.map((s) => s.zoom))],
      chgFs: chg('fs'),
      chgZoom: chg('zoom'),
      chgWidth: chg('width'),
      chgIw: chg('iw'),
      last: samples.at(-1),
    };
  });

  await browser.close();
  const vibrating = r.chgZoom > 5 || r.chgFs > 5 || r.fitLogN > 20;
  const row = { engine, mode, vibrating, ...r };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(JSON.stringify({ engine, mode, vibrating, fitLogN: r.fitLogN, chgFs: r.chgFs, chgZoom: r.chgZoom, uniqueFs: r.uniqueFs, uniqueZoom: r.uniqueZoom?.slice?.(0, 6), uniqueIw: r.uniqueIw }));
}

for (const [n, e] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  for (const mode of ['baseline', 'toggle-body-overflow', 'toggle-inner-via-scrollbar']) {
    await run(n, e, mode);
  }
}
