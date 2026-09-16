/**
 * Sweep viewport heights to find scrollbar overflow flip / fit oscillation.
 */
import { firefox, chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/opt/cursor/artifacts/vibrate-debug/height-sweep.jsonl';
fs.writeFileSync(OUT, '');
const URL = process.env.URL || 'http://127.0.0.1:4180/custom-gym-leader?fitDebugSb=1';

async function sweep(engineName, browserType) {
  const browser = await browserType.launch();
  // heights from undersized to oversized
  const heights = [];
  for (let h = 650; h <= 1400; h += 25) heights.push(h);

  for (const h of heights) {
    const page = await browser.newPage({
      viewport: { width: 912, height: h },
      deviceScaleFactor: 2,
    });
    await page.addInitScript(() => {
      const s = document.createElement('style');
      s.textContent = `html { scrollbar-width: thin !important; }`;
      document.documentElement.appendChild(s);
    });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForSelector('[data-testid="league-slot-0"]', { timeout: 15000 });
    } catch {
      fs.appendFileSync(OUT, JSON.stringify({ engine: engineName, h, error: 'no slot' }) + '\n');
      await page.close();
      continue;
    }
    await page.waitForTimeout(400);

    // sample 45 frames
    const r = await page.evaluate(async () => {
      const pane = [...document.querySelectorAll('[data-lg-viewport]')].find(
        (vp) => !vp.hasAttribute('inert'),
      );
      const fit = pane?.querySelector('div[style*="zoom"]');
      const samples = [];
      await new Promise((resolve) => {
        let n = 0;
        const tick = () => {
          if (fit && pane) {
            samples.push({
              z: fit.style.zoom,
              w: fit.style.width,
              ov: pane.scrollHeight - pane.clientHeight,
              cw: pane.clientWidth,
              ch: pane.clientHeight,
            });
          }
          if (++n < 45) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      const chg = (k) => samples.filter((s, i) => i > 0 && s[k] !== samples[i - 1][k]).length;
      const uniq = (k) => [...new Set(samples.map((s) => s[k]))];
      const fitLog = window.__fitLog || [];
      return {
        zChg: chg('z'),
        wChg: chg('w'),
        ovChg: chg('ov'),
        cwChg: chg('cw'),
        uniqZ: uniq('z'),
        uniqW: uniq('w'),
        uniqOv: uniq('ov'),
        uniqCw: uniq('cw'),
        fitLogN: fitLog.length,
        fitTail: fitLog.slice(-6),
        last: samples.at(-1),
      };
    });

    const vibrating =
      r.zChg > 3 || r.wChg > 3 || r.ovChg > 3 || r.cwChg > 3 || r.fitLogN > 10;
    const row = { engine: engineName, h, vibrating, ...r };
    fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
    if (vibrating || r.uniqOv.length > 1 || r.fitLogN > 4) {
      console.log(JSON.stringify(row));
    } else {
      console.log(`ok ${engineName} h=${h} ov=${r.last?.ov} z=${r.last?.z} sets=${r.fitLogN}`);
    }
    await page.close();
  }
  await browser.close();
}

for (const [n, e] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  await sweep(n, e);
}
console.log('Wrote', OUT);
