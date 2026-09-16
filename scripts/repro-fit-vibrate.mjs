/**
 * Sample the league fit block's zoom/width every animation frame.
 * Flag oscillation: unique values > 2 across a short window, or high change rate.
 */
import { chromium, firefox, webkit } from 'playwright';

const URL = process.env.URL || 'http://127.0.0.1:4180/custom-gym-leader';
const VIEWPORTS = [
  { name: 'report', width: 912, height: 705 },
  { name: 'tight-mobile', width: 390, height: 700 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'desktop-short', width: 1280, height: 700 },
  { name: 'near-md', width: 1023, height: 705 },
  { name: 'md', width: 1024, height: 705 },
];

async function sample(browserType, viewport) {
  const browser = await browserType.launch();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  // Let fit settle (or fail to).
  await page.waitForTimeout(200);

  const result = await page.evaluate(async () => {
    const pane = [...document.querySelectorAll('[data-lg-viewport]')]
      .find((vp) => !vp.hasAttribute('inert'));
    if (!pane) return { error: 'no pane' };
    const fit = pane.querySelector('div[style*="zoom"]');
    if (!fit) return { error: 'no fit' };

    const samples = [];
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const style = fit.style;
        const cs = getComputedStyle(fit);
        const box = fit.getBoundingClientRect();
        samples.push({
          t: Math.round(performance.now() - start),
          zoomStyle: style.zoom,
          zoomCs: cs.zoom,
          wStyle: style.width,
          boxW: Math.round(box.width * 1000) / 1000,
          boxH: Math.round(box.height * 1000) / 1000,
          scrollH: pane.scrollHeight,
          clientH: pane.clientHeight,
        });
        if (samples.length < 90) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

    const zooms = samples.map((s) => s.zoomStyle || s.zoomCs);
    const widths = samples.map((s) => s.wStyle);
    const boxHs = samples.map((s) => s.boxH);
    const unique = (arr) => [...new Set(arr)];
    const changes = (arr) => arr.filter((v, i) => i > 0 && v !== arr[i - 1]).length;

    return {
      n: samples.length,
      uniqueZooms: unique(zooms),
      uniqueWidths: unique(widths),
      uniqueBoxH: unique(boxHs).length,
      zoomChanges: changes(zooms),
      widthChanges: changes(widths),
      boxHChanges: changes(boxHs),
      first: samples[0],
      last: samples[samples.length - 1],
      mid: samples[Math.floor(samples.length / 2)],
      vibrating: changes(zooms) > 5 || changes(widths) > 5 || changes(boxHs) > 20,
    };
  });

  await browser.close();
  return result;
}

const engines = [
  ['chromium', chromium],
  ['firefox', firefox],
];

for (const [name, eng] of engines) {
  for (const vp of VIEWPORTS) {
    try {
      const r = await sample(eng, vp);
      const flag = r.vibrating ? 'VIBRATE' : 'ok';
      console.log(
        JSON.stringify({
          engine: name,
          viewport: vp.name,
          size: `${vp.width}x${vp.height}`,
          flag,
          zoomChanges: r.zoomChanges,
          widthChanges: r.widthChanges,
          boxHChanges: r.boxHChanges,
          uniqueZooms: r.uniqueZooms,
          uniqueWidths: r.uniqueWidths,
          firstZoom: r.first?.zoomStyle,
          lastZoom: r.last?.zoomStyle,
          firstBox: r.first && `${r.first.boxW}x${r.first.boxH}`,
          lastBox: r.last && `${r.last.boxW}x${r.last.boxH}`,
          error: r.error,
        }),
      );
    } catch (e) {
      console.log(JSON.stringify({ engine: name, viewport: vp.name, error: String(e) }));
    }
  }
}
