/**
 * Clean coupling tests — no every-frame padding clear artifact.
 */
import { chromium, firefox } from 'playwright';
import fs from 'node:fs';

const OUT = '/opt/cursor/artifacts/vibrate-debug/clean-coupling.jsonl';
fs.writeFileSync(OUT, '');
const URL = 'http://127.0.0.1:4180/custom-gym-leader';

async function run(engine, browserType, opts) {
  const browser = await browserType.launch();
  const page = await browser.newPage({
    viewport: { width: opts.w, height: opts.h },
    deviceScaleFactor: 2,
  });

  if (opts.staticPad) {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = `[data-lg-viewport]{padding-right:15px !important;}`;
        document.documentElement.appendChild(s);
      });
    });
  }

  if (opts.altSpacer) {
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
            // Alternate spacer that flips overflow across clientHeight
            sp.style.height = on ? '0px' : `${optsSpacer}px`;
          }
          requestAnimationFrame(tick);
        };
        const optsSpacer = 30;
        requestAnimationFrame(tick);
      });
    });
  }

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="league-slot-0"]');

  if (opts.wrapBomb) {
    await page.evaluate((n) => {
      const root = document.querySelector('[data-lg-league-root]');
      const bomb = document.createElement('div');
      bomb.style.cssText = 'font-size:12px;line-height:1.25;padding:6px;word-break:break-word;';
      bomb.textContent = 'WRAP '.repeat(n);
      root.appendChild(bomb);
      document.querySelectorAll('[data-fit-tail] .truncate').forEach((el) => {
        el.classList.remove('truncate');
        el.style.whiteSpace = 'normal';
        el.textContent = (el.textContent || '') + ' ' + 'x'.repeat(40);
      });
    }, opts.wrapN || 100);
  }

  if (opts.liveMutateWidth) {
    // Alternate the fit width style every frame AGAINST the hook — fight it
    await page.evaluate(() => {
      const fit = document.querySelector('[data-lg-viewport]:not([inert]) div[style*="zoom"]');
      let on = false;
      const tick = () => {
        if (fit) {
          on = !on;
          // nudge width by 20px to force natural reflow if wrap-sensitive
          const base = parseFloat(fit.style.width) || 400;
          fit.style.width = `${on ? base : base + 20}px`;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  await page.waitForTimeout(2500);

  const r = await page.evaluate(async () => {
    const fit = document.querySelector('[data-lg-viewport]:not([inert]) div[style*="zoom"]');
    const samples = [];
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      samples.push({ z: fit?.style.zoom, w: fit?.style.width });
    }
    const chg = (k) => samples.filter((s, i) => i > 0 && s[k] !== samples[i - 1][k]).length;
    const log = window.__fitLog || [];
    const nexts = log.slice(-30).map((e) => +e.next.toFixed(3));
    let aba = 0;
    for (let i = 2; i < nexts.length; i++) {
      if (nexts[i] === nexts[i - 2] && nexts[i] !== nexts[i - 1]) aba++;
    }
    return {
      lateZ: chg('z'),
      lateW: chg('w'),
      fitLogN: log.length,
      aba,
      uniqNext: [...new Set(nexts)],
      tail: log.slice(-8).map((e) => ({
        next: +e.next.toFixed(4),
        width: Math.round(e.width),
        natural: Math.round(e.natural),
        room: Math.round(e.room),
        ov: e.scrollOverflow,
      })),
    };
  });

  await browser.close();
  const vibrating = r.lateZ > 5 || r.fitLogN > 30 || r.aba > 5;
  const row = { engine, ...opts, vibrating, ...r };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(
    `${vibrating ? 'VIBRATE' : 'ok'} ${engine} ${opts.name} sets=${r.fitLogN} lateZ=${r.lateZ} aba=${r.aba} nexts=${JSON.stringify(r.uniqNext)}`,
  );
}

const cases = [
  { name: 'report-plain', w: 912, h: 705 },
  { name: 'report-wrap', w: 912, h: 705, wrapBomb: true },
  { name: 'report-wrap-staticpad', w: 912, h: 705, wrapBomb: true, staticPad: true },
  { name: 'nearov-wrap', w: 912, h: 1240, wrapBomb: true },
  { name: 'nearov-wrap-staticpad', w: 912, h: 1240, wrapBomb: true, staticPad: true },
  { name: 'nearov-wrap-altspacer', w: 912, h: 1240, wrapBomb: true, altSpacer: true },
  { name: 'report-altspacer', w: 912, h: 705, altSpacer: true },
  { name: 'narrow-wrap', w: 390, h: 700, wrapBomb: true, wrapN: 80 },
  { name: 'narrow-wrap-altspacer', w: 390, h: 700, wrapBomb: true, altSpacer: true },
  { name: 'desktop-grow', w: 1280, h: 705 },
  { name: 'desktop-grow-altspacer', w: 1280, h: 705, altSpacer: true },
  // Heavy wrap at scale near 1 where small natural deltas exceed 0.003
  { name: 'h1100-wrap', w: 912, h: 1100, wrapBomb: true, wrapN: 120 },
  { name: 'h1200-wrap', w: 912, h: 1200, wrapBomb: true, wrapN: 120 },
  { name: 'h1300-wrap', w: 912, h: 1300, wrapBomb: true, wrapN: 120 },
];

for (const [n, e] of [
  ['chromium', chromium],
  ['firefox', firefox],
]) {
  for (const c of cases) {
    await run(n, e, c);
  }
}
