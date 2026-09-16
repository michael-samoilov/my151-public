/**
 * Simulate classic scrollbars that steal clientWidth AND clientHeight when
 * overflow>0 — the real Mac "Always show scrollbars" / Windows feedback loop.
 *
 * Approach: monkey-patch HTMLElement clientWidth/clientHeight/getBoundingClientRect
 * for [data-lg-viewport] based on whether scrollHeight would overflow the
 * unpatched size. Also patch useFitScale's inputs by wrapping RO callbacks.
 */
import { firefox, chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/opt/cursor/artifacts/vibrate-debug/classic-sb-sim.jsonl';
fs.writeFileSync(OUT, '');
const BASE = process.env.URL || 'http://127.0.0.1:4180/custom-gym-leader';

const SB = 15; // classic scrollbar thickness

async function run(engine, browserType, opts) {
  const browser = await browserType.launch();
  const page = await browser.newPage({
    viewport: { width: opts.w, height: opts.h },
    deviceScaleFactor: 2,
  });

  await page.addInitScript((sb) => {
    const isVp = (el) =>
      el && el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-lg-viewport');

    // Store "raw" sizes before scrollbar theft
    const _rawSize = new WeakMap();

    function _measureRaw(el) {
      // Read via getBoundingClientRect + style, avoiding our patches
      const r = HTMLElement.prototype.getBoundingClientRect.call(el);
      // Approximate client size = content box; use offsetWidth/Height as base
      const ow = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
        ?.get?.call(el) ?? r.width;
      const oh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
        ?.get?.call(el) ?? r.height;
      return { ow, oh, r };
    }

    // We need to decide if vertical scrollbar would show.
    // Use scrollHeight vs clientHeight — but clientHeight is what we patch.
    // So: compare scrollHeight to offsetHeight (minus borders) as unpatched approx.

    const cwDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const chDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    const shDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    const _swDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');

    function _wouldVScroll(el) {
      const sh = shDesc.get.call(el);
      const chRaw = chDesc.get.call(el);
      // If already patched recursion — use a flag
      return sh > chRaw + 1;
    }

    // Better approach: keep a per-frame overflow state machine that applies
    // 15px theft when last frame had overflow, then remeasure.
    // Simpler: always steal if scrollHeight > (clientHeight_raw).
    // To break recursion, read raw via descriptors inside patch.

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        const raw = cwDesc.get.call(this);
        if (!isVp(this)) return raw;
        const sh = shDesc.get.call(this);
        const chRaw = chDesc.get.call(this);
        // Vertical scrollbar steals width when content overflows vertically
        if (sh > chRaw + 1) return Math.max(0, raw - sb);
        return raw;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        const raw = chDesc.get.call(this);
        if (!isVp(this)) return raw;
        // On some platforms classic SB also affects — usually only width for Y scroll.
        // Optionally steal 0 from height (scrollbar is on the side).
        return raw;
      },
    });

    // Track host (parent of fit) clientWidth too — room uses host.clientWidth
    // Host is NOT data-lg-viewport; it's the max-w wrapper. When viewport
    // loses 15px to scrollbar, the host inside typically also shrinks because
    // it's width 100% of the content area.
    // Patching only viewport isn't enough — the host's clientWidth comes from layout.
    // Force layout shrinkage via CSS instead when overflow:

    const applyCssTheft = () => {
      const panes = document.querySelectorAll('[data-lg-viewport]');
      for (const pane of panes) {
        const sh = pane.scrollHeight;
        // Use offsetHeight as proxy for visible height
        const _visible = pane.clientHeight; // may be patched
        // Read unpatched:
        const chRaw = chDesc.get.call(pane);
        const overflowing = sh > chRaw + 1;
        if (overflowing) {
          pane.style.setProperty('padding-right', `${sb}px`, 'important');
          // compensating: padding steals from content like a scrollbar
        } else {
          pane.style.removeProperty('padding-right');
        }
      }
    };

    // Drive the CSS theft every animation frame — this CAN create a loop
    // if padding changes overflow state.
    const tick = () => {
      applyCssTheft();
      requestAnimationFrame(tick);
    };
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(tick));
    window.__sbSim = { sb };
  }, SB);

  const url = BASE; // no fitDebugSb — we simulate via padding
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForSelector('[data-testid="league-slot-0"]', { timeout: 15000 });
  } catch {
    await browser.close();
    return { engine, ...opts, error: 'no slot' };
  }

  await page.waitForTimeout(800);

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
            pr: pane.style.paddingRight,
          });
        }
        if (++n < 90) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const chg = (k) => samples.filter((s, i) => i > 0 && s[k] !== samples[i - 1][k]).length;
    const uniq = (k) => [...new Set(samples.map((s) => s[k]))];
    const fitLog = window.__fitLog || [];
    // Detect A-B oscillation in padding-right (scrollbar sim)
    const prs = samples.map((s) => s.pr);
    let prFlips = 0;
    for (let i = 1; i < prs.length; i++) if (prs[i] !== prs[i - 1]) prFlips++;
    return {
      zChg: chg('z'),
      wChg: chg('w'),
      ovChg: chg('ov'),
      cwChg: chg('cw'),
      prFlips,
      uniqZ: uniq('z'),
      uniqW: uniq('w'),
      uniqOv: uniq('ov'),
      uniqPr: uniq('pr'),
      fitLogN: fitLog.length,
      fitTail: fitLog.slice(-10),
      last: samples.at(-1),
      mid: samples[40],
    };
  });

  await browser.close();
  const vibrating =
    r.zChg > 5 || r.wChg > 5 || r.prFlips > 5 || (r.fitLogN || 0) > 20;
  return { engine, ...opts, vibrating, ...r };
}

const heights = [705, 800, 900, 1000, 1100, 1200, 1300];
const widths = [912];

for (const [name, eng] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  for (const h of heights) {
    for (const w of widths) {
      try {
        const row = await run(name, eng, { w, h, name: `pad-theft-${w}x${h}` });
        fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
        console.log(
          `${row.vibrating ? 'VIBRATE' : 'ok'} ${name} ${w}x${h} zChg=${row.zChg} wChg=${row.wChg} prFlips=${row.prFlips} sets=${row.fitLogN} ov=${JSON.stringify(row.uniqOv)}`,
        );
      } catch (e) {
        console.log('ERR', name, h, e);
      }
    }
  }
}

// Also: toggle padding every frame deliberately (worst case)
async function forcedPadToggle(engine, browserType) {
  const browser = await browserType.launch();
  const page = await browser.newPage({ viewport: { width: 912, height: 705 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      let on = false;
      const tick = () => {
        const pane = document.querySelector('[data-lg-viewport]:not([inert])');
        if (pane) {
          on = !on;
          pane.style.paddingRight = on ? '15px' : '0px';
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const fitLog = window.__fitLog || [];
    return {
      fitLogN: fitLog.length,
      uniqueNext: [...new Set(fitLog.map((e) => Math.round(e.next * 1000) / 1000))],
      uniqueRoom: [...new Set(fitLog.map((e) => Math.round(e.room)))],
      uniqueWidth: [...new Set(fitLog.map((e) => Math.round(e.width)))],
      tail: fitLog.slice(-8),
    };
  });
  await browser.close();
  const row = { engine, case: 'forced-pad-toggle', vibrating: r.fitLogN > 20, ...r };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(`${row.vibrating ? 'VIBRATE' : 'ok'} ${engine} forced-pad-toggle sets=${r.fitLogN} rooms=${JSON.stringify(r.uniqueRoom)}`);
}

for (const [n, e] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  await forcedPadToggle(n, e);
}

console.log('Wrote', OUT);
