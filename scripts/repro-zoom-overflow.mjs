/**
 * Hypothesis: Firefox counts unzoomed CSS width toward scrollWidth, so
 * width=room/squash (> host) toggles document/pane overflow and feeds back
 * into fit + root font-size.
 */
import { firefox, chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/opt/cursor/artifacts/vibrate-debug/zoom-overflow.jsonl';
fs.writeFileSync(OUT, '');
const URL = process.env.URL || 'http://127.0.0.1:4180/custom-gym-leader';

async function probe(engine, browserType, vp, extras = {}) {
  const browser = await browserType.launch({
    firefoxUserPrefs: extras.prefs || undefined,
  });
  const page = await browser.newPage({
    viewport: vp,
    deviceScaleFactor: extras.dpr ?? 2,
  });
  await page.goto(URL + (extras.qs || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(600);

  const r = await page.evaluate(async () => {
    const fit = document.querySelector('[data-lg-viewport]:not([inert]) div[style*="zoom"]');
    const pane = fit?.closest('[data-lg-viewport]');
    const host = fit?.parentElement;
    if (!fit || !pane || !host) return { error: 'missing' };

    const snap = () => {
      const html = document.documentElement;
      const body = document.body;
      return {
        zoom: fit.style.zoom,
        width: fit.style.width,
        fitRect: (() => {
          const b = fit.getBoundingClientRect();
          return { w: b.width, h: b.height };
        })(),
        fitOffsetW: fit.offsetWidth,
        fitScrollW: fit.scrollWidth,
        hostCw: host.clientWidth,
        hostSw: host.scrollWidth,
        paneCw: pane.clientWidth,
        paneSw: pane.scrollWidth,
        paneCh: pane.clientHeight,
        paneSh: pane.scrollHeight,
        paneOverflowX: pane.scrollWidth - pane.clientWidth,
        paneOverflowY: pane.scrollHeight - pane.clientHeight,
        htmlCw: html.clientWidth,
        htmlSw: html.scrollWidth,
        htmlCh: html.clientHeight,
        htmlSh: html.scrollHeight,
        htmlOverflowX: html.scrollWidth - html.clientWidth,
        htmlOverflowY: html.scrollHeight - html.clientHeight,
        bodySw: body.scrollWidth,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        rootFs: document.documentElement.style.fontSize,
        vv: window.visualViewport
          ? { w: window.visualViewport.width, s: window.visualViewport.scale }
          : null,
      };
    };

    const samples = [];
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      samples.push(snap());
    }

    const chg = (key) => {
      const vals = samples.map((s) => JSON.stringify(s[key]));
      return vals.filter((v, i) => i > 0 && v !== vals[i - 1]).length;
    };

    // Experiment: force width much larger and see overflow semantics
    const before = snap();
    const oldW = fit.style.width;
    const oldZ = fit.style.zoom;
    fit.style.width = '2000px';
    fit.style.zoom = '0.5';
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    const wide = snap();
    fit.style.width = oldW;
    fit.style.zoom = oldZ;
    await new Promise((r) => requestAnimationFrame(r));
    const restored = snap();

    // Experiment: width=room without zoom compensation
    fit.style.zoom = '1';
    fit.style.width = `${host.clientWidth * 1.5}px`;
    await new Promise((r) => requestAnimationFrame(r));
    const noZoomWide = snap();
    fit.style.width = oldW;
    fit.style.zoom = oldZ;

    return {
      first: samples[0],
      last: samples.at(-1),
      chgZoom: chg('zoom'),
      chgWidth: chg('width'),
      chgHtmlOx: chg('htmlOverflowX'),
      chgPaneOx: chg('paneOverflowX'),
      chgPaneOy: chg('paneOverflowY'),
      chgRootFs: chg('rootFs'),
      chgInnerW: chg('innerW'),
      fitLogN: (window.__fitLog || []).length,
      before,
      wide,
      restored,
      noZoomWide,
      // Does zoomed wide element overflow html?
      zoomCollapsesLayout:
        wide.htmlOverflowX <= before.htmlOverflowX + 5 &&
        parseFloat(wide.width) > parseFloat(before.width || '0'),
    };
  });

  await browser.close();
  const row = { engine, vp, ...r };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(
    JSON.stringify({
      engine,
      vp: `${vp.width}x${vp.height}`,
      htmlOx: r.first?.htmlOverflowX,
      paneOx: r.first?.paneOverflowX,
      paneOy: r.first?.paneOverflowY,
      fitW: r.first?.width,
      fitZoom: r.first?.zoom,
      fitRectW: r.first?.fitRect?.w,
      hostCw: r.first?.hostCw,
      wideHtmlOx: r.wide?.htmlOverflowX,
      widePaneOx: r.wide?.paneOverflowX,
      noZoomHtmlOx: r.noZoomWide?.htmlOverflowX,
      chgHtmlOx: r.chgHtmlOx,
      chgPaneOy: r.chgPaneOy,
      chgZoom: r.chgZoom,
      sets: r.fitLogN,
      zoomCollapsesLayout: r.zoomCollapsesLayout,
    }),
  );
}

for (const [n, e] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  await probe(n, e, { width: 912, height: 705 });
  await probe(n, e, { width: 390, height: 700 });
  await probe(n, e, { width: 1280, height: 705 });
}
