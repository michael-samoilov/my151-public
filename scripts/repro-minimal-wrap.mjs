/**
 * Minimal deterministic repro: wrap-coupled content + squash fit → Chromium A↔B vibration.
 * Also test hysteresis: would a larger threshold stop it?
 */
import { chromium, firefox } from 'playwright';
import fs from 'node:fs';

const OUT = '/opt/cursor/artifacts/vibrate-debug/minimal-repro.json';
const URL = 'http://127.0.0.1:4180/custom-gym-leader';

async function run(engine, browserType) {
  const browser = await browserType.launch();
  const page = await browser.newPage({
    viewport: { width: 912, height: 1240 },
    deviceScaleFactor: 2,
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="league-slot-0"]');

  // Inject wrap-sensitive block into fitted content
  await page.evaluate(() => {
    const root = document.querySelector('[data-lg-league-root]');
    const bomb = document.createElement('div');
    bomb.style.cssText = 'font-size:12px;line-height:1.25;padding:6px;';
    bomb.textContent = 'WRAP '.repeat(100);
    root.appendChild(bomb);
  });

  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const log = window.__fitLog || [];
    const tail = log.slice(-20);
    const nexts = tail.map((e) => Math.round(e.next * 1000) / 1000);
    // count A-B alternation
    let aba = 0;
    for (let i = 2; i < nexts.length; i++) {
      if (nexts[i] === nexts[i - 2] && nexts[i] !== nexts[i - 1]) aba++;
    }
    const deltas = [];
    for (let i = 1; i < tail.length; i++) {
      deltas.push(Math.abs(tail[i].next - tail[i - 1].next));
    }
    return {
      fitLogN: log.length,
      aba,
      uniqueNext: [...new Set(nexts)],
      avgDelta: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0,
      minDelta: deltas.length ? Math.min(...deltas) : 0,
      maxDelta: deltas.length ? Math.max(...deltas) : 0,
      threshold: 0.003,
      // Would hysteresis of 0.02 stop these flips?
      would0_02Stop: deltas.every((d) => d <= 0.02),
      would0_05Stop: deltas.every((d) => d <= 0.05),
      tail: tail.map((e) => ({
        t: Math.round(e.t),
        next: +e.next.toFixed(4),
        natural: Math.round(e.natural),
        ov: e.scrollOverflow,
      })),
    };
  });
  await browser.close();
  return { engine, vibrating: r.fitLogN > 30 && r.aba > 5, ...r };
}

const results = [];
for (const [n, e] of [
  ['chromium', chromium],
  ['firefox', firefox],
]) {
  results.push(await run(n, e));
}
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
