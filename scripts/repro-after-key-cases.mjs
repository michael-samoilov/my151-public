import { firefox, chromium } from 'playwright';
import fs from 'node:fs';

const out = [];

async function checkForce(name, eng) {
  const browser = await eng.launch();
  const page = await browser.newPage({ viewport: { width: 912, height: 705 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      let on = false;
      const tick = () => {
        const pane = document.querySelector('[data-lg-viewport]:not([inert])');
        if (pane) {
          pane.style.minHeight = on ? '100%' : 'calc(100% - 6px)';
          on = !on;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  await page.goto('http://127.0.0.1:4180/custom-gym-leader', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const fit = document.querySelector('[data-lg-viewport]:not([inert]) div[style*="zoom"]');
    const samples = [];
    for (let i = 0; i < 60; i++) {
      await new Promise((res) => requestAnimationFrame(res));
      samples.push(fit?.style.zoom);
    }
    const changes = samples.filter((s, i) => i && s !== samples[i - 1]).length;
    return { changes, unique: [...new Set(samples)], last: samples.at(-1) };
  });
  await browser.close();
  const row = { case: 'force-overflow', engine: name, vibrating: r.changes > 5, ...r };
  out.push(row);
  console.log(JSON.stringify(row));
}

async function checkNarrow(name, eng) {
  const browser = await eng.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      let on = false;
      const tick = () => {
        const pane = document.querySelector('[data-lg-viewport]:not([inert])');
        if (pane) {
          let sp = document.getElementById('__sp');
          if (!sp) {
            sp = document.createElement('div');
            sp.id = '__sp';
            pane.appendChild(sp);
          }
          on = !on;
          sp.style.height = on ? '0px' : '30px';
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  await page.goto('http://127.0.0.1:4180/custom-gym-leader', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.evaluate(() => {
    const root =
      document.querySelector('[data-lg-league-root]') ||
      document.querySelector('[data-lg-viewport]:not([inert])');
    const bomb = document.createElement('div');
    bomb.style.cssText = 'font-size:12px;line-height:1.25;padding:6px;word-break:break-word;';
    bomb.textContent = 'WRAP '.repeat(100);
    root.appendChild(bomb);
    document.querySelectorAll('[data-fit-tail] .truncate').forEach((el) => {
      el.classList.remove('truncate');
      el.style.whiteSpace = 'normal';
      el.textContent = (el.textContent || '') + ' ' + 'x'.repeat(40);
    });
  });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const fit = document.querySelector('[data-lg-viewport]:not([inert]) div[style*="zoom"]');
    const samples = [];
    for (let i = 0; i < 60; i++) {
      await new Promise((res) => requestAnimationFrame(res));
      samples.push({ z: fit?.style.zoom, w: fit?.style.width });
    }
    const chg = (k) => samples.filter((s, i) => i && s[k] !== samples[i - 1][k]).length;
    return { lateZ: chg('z'), lateW: chg('w'), uniqueZ: [...new Set(samples.map((s) => s.z))] };
  });
  await browser.close();
  const row = { case: 'narrow-wrap-altspacer', engine: name, vibrating: r.lateZ > 5, ...r };
  out.push(row);
  console.log(JSON.stringify(row));
}

for (const [n, e] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  await checkForce(n, e);
  await checkNarrow(n, e);
}

fs.writeFileSync('/opt/cursor/artifacts/vibrate-debug/AFTER-key-cases.json', JSON.stringify(out, null, 2));
const bad = out.filter((r) => r.vibrating);
console.log(bad.length ? `FAIL ${bad.length}` : 'ALL_OK');
process.exit(bad.length ? 1 : 0);
