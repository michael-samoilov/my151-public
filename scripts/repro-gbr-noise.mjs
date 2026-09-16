/**
 * Probe: does GBR/zoom float noise exceed the 0.003 / 0.5 thresholds?
 * Also: re-apply the fit formula every frame from live measurements without
 * writing style — detect if the implied next/width would flip.
 */
import { firefox, chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/opt/cursor/artifacts/vibrate-debug/gbr-noise.jsonl';
fs.writeFileSync(OUT, '');
const URL = process.env.URL || 'http://127.0.0.1:4180/custom-gym-leader';

async function probe(engine, browserType, viewport) {
  const browser = await browserType.launch();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(1000);

  const r = await page.evaluate(async () => {
    const el = document.querySelector('[data-lg-viewport]:not([inert]) div[style*="zoom"]');
    const viewport = el?.closest('[data-lg-viewport]');
    const host = el?.parentElement;
    if (!el || !viewport || !host) return { error: 'missing' };

    const floor = 0.55;
    const samples = [];
    let scaleRef = parseFloat(el.style.zoom) || 1;
    let widthRef = parseFloat(el.style.width) || 0;

    // Read-only recompute mirroring useFitScale (squash path)
    const recompute = () => {
      const rect = el.getBoundingClientRect();
      const natural = rect.height / scaleRef;
      const vp = viewport.getBoundingClientRect();
      const padBottom = parseFloat(getComputedStyle(viewport).paddingBottom) || 0;
      let avail =
        viewport.clientHeight - (rect.top - vp.top + viewport.scrollTop) - padBottom - 2;
      avail -= parseFloat(getComputedStyle(el.parentElement ?? el).paddingTop) || 0;
      const pad = getComputedStyle(host);
      const room = Math.max(
        0,
        host.clientWidth - (parseFloat(pad.paddingLeft) || 0) - (parseFloat(pad.paddingRight) || 0),
      );
      const tail = el.querySelector('[data-fit-tail]');
      const body = Math.max(
        1,
        natural - (tail ? tail.getBoundingClientRect().height / scaleRef : 0),
      );
      const squash = Math.min(1, Math.max(floor, avail / body));
      const width = room / squash;
      const next = Math.min(1, Math.max(floor, avail / natural));
      const wouldSet =
        Math.abs(next - scaleRef) > 0.003 || Math.abs(width - widthRef) > 0.5;
      return {
        natural,
        avail,
        room,
        squash,
        next,
        width,
        wouldSet,
        bh: rect.height,
        bw: rect.width,
        zoomStyle: el.style.zoom,
        widthStyle: el.style.width,
        scrollOverflow: viewport.scrollHeight - viewport.clientHeight,
        hostCw: host.clientWidth,
        vpCw: viewport.clientWidth,
        vpCh: viewport.clientHeight,
      };
    };

    // Phase 1: frozen style — pure measurement noise over 120 frames
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const c = recompute();
      samples.push({ phase: 'frozen', i, ...c });
    }

    // Phase 2: apply would-set updates like the hook (simulate oscillation)
    const applied = [];
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const c = recompute();
      if (c.wouldSet) {
        scaleRef = c.next;
        widthRef = c.width;
        el.style.zoom = String(c.next);
        el.style.width = `${c.width}px`;
        applied.push({ i, next: c.next, width: c.width, natural: c.natural, room: c.room });
      }
      samples.push({ phase: 'apply', i, ...c, appliedN: applied.length });
    }

    const frozen = samples.filter((s) => s.phase === 'frozen');
    const apply = samples.filter((s) => s.phase === 'apply');
    const uniq = (arr) => [...new Set(arr.map((x) => String(x)))];
    const range = (arr) => ({ min: Math.min(...arr), max: Math.max(...arr), span: Math.max(...arr) - Math.min(...arr) });

    return {
      frozenWouldSet: frozen.filter((s) => s.wouldSet).length,
      frozenNextRange: range(frozen.map((s) => s.next)),
      frozenWidthRange: range(frozen.map((s) => s.width)),
      frozenNaturalRange: range(frozen.map((s) => s.natural)),
      frozenBhRange: range(frozen.map((s) => s.bh)),
      frozenUniqueNext: uniq(frozen.map((s) => Math.round(s.next * 1e6) / 1e6)).length,
      applyWouldSet: apply.filter((s) => s.wouldSet).length,
      appliedN: applied.length,
      appliedTail: applied.slice(-15),
      appliedUniqueNext: uniq(applied.map((a) => Math.round(a.next * 1000) / 1000)),
      appliedUniqueWidth: uniq(applied.map((a) => Math.round(a.width))),
      // A-B pattern in applied
      aba: applied.filter((a, i) => i >= 2 && a.next === applied[i - 2].next && a.next !== applied[i - 1].next).length,
      lastFrozen: frozen.at(-1),
      lastApply: apply.at(-1),
    };
  });

  await browser.close();
  const vibrating = (r.appliedN || 0) > 10 || (r.frozenWouldSet || 0) > 5;
  const row = { engine, viewport, vibrating, ...r };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(
    JSON.stringify({
      engine,
      vibrating,
      frozenWouldSet: r.frozenWouldSet,
      nextSpan: r.frozenNextRange?.span,
      widthSpan: r.frozenWidthRange?.span,
      appliedN: r.appliedN,
      aba: r.aba,
      appliedUniqueNext: r.appliedUniqueNext,
    }),
  );
}

const vps = [
  { width: 912, height: 705 },
  { width: 912, height: 1250 }, // near overflow 0
  { width: 390, height: 700 },
  { width: 1280, height: 705 },
];

for (const [n, e] of [
  ['firefox', firefox],
  ['chromium', chromium],
]) {
  for (const vp of vps) {
    await probe(n, e, vp);
  }
}
