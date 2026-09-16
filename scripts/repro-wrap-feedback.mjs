/**
 * Fine-sweep near overflow≈0 and force width→height coupling (wrap) to find
 * A↔B fixed-point oscillation in squash mode.
 */
import { firefox, chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/opt/cursor/artifacts/vibrate-debug/wrap-feedback.jsonl';
fs.writeFileSync(OUT, '');
const URL = 'http://127.0.0.1:4180/custom-gym-leader';

async function run(engine, browserType, opts) {
  const browser = await browserType.launch();
  const page = await browser.newPage({
    viewport: { width: opts.w, height: opts.h },
    deviceScaleFactor: 2,
  });

  await page.addInitScript((opts) => {
    if (opts.classicPad) {
      // Steal 15px from pane content when overflowing — and remove when not.
      // Runs every frame so it can fight the fit loop.
      document.addEventListener('DOMContentLoaded', () => {
        const tick = () => {
          const pane = document.querySelector('[data-lg-viewport]:not([inert])');
          if (pane) {
            const sh = pane.scrollHeight;
            const ch = pane.clientHeight;
            // Use offsetHeight-based decision WITHOUT padding to avoid recursion:
            const pr = pane.style.paddingRight;
            pane.style.paddingRight = '';
            const ch0 = pane.clientHeight;
            const sh0 = pane.scrollHeight;
            const overflowing = sh0 > ch0 + 1;
            pane.style.paddingRight = overflowing ? '15px' : '';
            window.__padState = (window.__padState || []).concat({
              t: performance.now(),
              overflowing,
              sh0,
              ch0,
              pr: pane.style.paddingRight,
            }).slice(-50);
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }
  }, opts);

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="league-slot-0"]');

  if (opts.wrapBomb) {
    await page.evaluate(() => {
      // Make the league card's own content width-sensitive in HEIGHT
      const root = document.querySelector('[data-lg-league-root]');
      if (root) {
        const bomb = document.createElement('div');
        bomb.setAttribute('data-wrap-bomb', '1');
        bomb.style.cssText =
          'font-size:12px;line-height:1.3;padding:4px;word-break:break-word;';
        bomb.textContent =
          'WORD '.repeat(80) +
          '— this block wraps more lines when the fit width is narrow and fewer when wide, coupling width into natural height.';
        root.appendChild(bomb);
      }
      // Also kill truncate on tail
      document.querySelectorAll('[data-fit-tail] .truncate').forEach((el) => {
        el.classList.remove('truncate');
        el.style.whiteSpace = 'normal';
        el.textContent = (el.textContent || '') + ' ' + 'wrapme '.repeat(20);
      });
    });
  }

  await page.waitForTimeout(2500);

  const r = await page.evaluate(async () => {
    const fit = document.querySelector('[data-lg-viewport]:not([inert]) div[style*="zoom"]');
    const samples = [];
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      samples.push({
        z: fit?.style.zoom,
        w: fit?.style.width,
        bh: fit?.getBoundingClientRect().height,
      });
    }
    const chg = (k) => samples.filter((s, i) => i > 0 && s[k] !== samples[i - 1][k]).length;
    const fitLog = window.__fitLog || [];
    const pad = window.__padState || [];
    const padFlips = pad.filter((p, i) => i > 0 && p.overflowing !== pad[i - 1].overflowing).length;
    return {
      lateZ: chg('z'),
      lateW: chg('w'),
      lateBh: chg('bh'),
      uniqZ: [...new Set(samples.map((s) => s.z))],
      uniqW: [...new Set(samples.map((s) => s.w))],
      fitLogN: fitLog.length,
      fitUniqueNext: [...new Set(fitLog.map((e) => Math.round(e.next * 1000) / 1000))],
      fitUniqueWidth: [...new Set(fitLog.map((e) => Math.round(e.width)))],
      fitUniqueOv: [...new Set(fitLog.map((e) => e.scrollOverflow))],
      padFlips,
      padTail: pad.slice(-6),
      fitTail: fitLog.slice(-10),
    };
  });

  await browser.close();
  const vibrating = r.lateZ > 5 || r.lateW > 5 || r.fitLogN > 25 || r.padFlips > 5;
  const row = { engine, ...opts, vibrating, ...r };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(
    `${vibrating ? 'VIBRATE' : 'ok'} ${engine} h=${opts.h} wrap=${!!opts.wrapBomb} pad=${!!opts.classicPad} sets=${r.fitLogN} lateZ=${r.lateZ} padFlips=${r.padFlips} nexts=${JSON.stringify(r.fitUniqueNext)} ovs=${JSON.stringify(r.fitUniqueOv)}`,
  );
}

const cases = [];
// Near overflow boundary
for (const h of [1240, 1248, 1250, 1252, 1255, 1260, 1270, 1275]) {
  cases.push({ w: 912, h, classicPad: true, wrapBomb: false, name: 'near-ov' });
  cases.push({ w: 912, h, classicPad: true, wrapBomb: true, name: 'near-ov-wrap' });
}
// Bug report viewport with wrap coupling
cases.push({ w: 912, h: 705, classicPad: true, wrapBomb: true, name: 'report-wrap' });
cases.push({ w: 912, h: 705, classicPad: false, wrapBomb: true, name: 'report-wrap-nopad' });
cases.push({ w: 390, h: 700, classicPad: true, wrapBomb: true, name: 'narrow-wrap' });

for (const [n, e] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  for (const c of cases) {
    await run(n, e, c);
  }
}
