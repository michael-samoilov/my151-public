#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { chromiumPath } from './lab-server.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

async function openHub() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });
  const context = await browser.newContext({ viewport: { width: from, height }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const classes = document.documentElement.classList;
    return !classes.contains('p151-wait') && !classes.contains('p151-hub-images-pending')
      && !classes.contains('p151-hub-font-pending') && !classes.contains('p151-hub-hydrating')
      && !document.querySelector('.p151-boot') && Boolean(document.querySelector('.hub-grid'));
  }, null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  return {
    browser, page, cdp,
    setWidth: (width) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false }),
    frame: () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))),
  };
}

async function measure() {
  const { browser, page, cdp, setWidth, frame } = await openHub();

  const widths = [];
  for (let width = from; width >= to; width -= step) widths.push(width);
  for (let width = to + step; width <= from; width += step) widths.push(width);

  await cdp.send('Performance.enable');
  await page.evaluate(() => {
    const frames = [];
    const longTasks = [];
    let last = performance.now();
    const tick = (now) => { frames.push(now - last); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)))
      .observe({ type: 'longtask' });
    window.__resizeProbe = { frames, longTasks };
  });

  const harnessFloor = [];
  for (let i = 0; i < 40; i++) {
    const start = performance.now();
    await setWidth(from);
    await frame();
    harnessFloor.push(performance.now() - start);
  }
  await page.evaluate(() => { window.__resizeProbe.frames.length = 0; window.__resizeProbe.longTasks.length = 0; });

  const events = [];
  cdp.on('Tracing.dataCollected', (payload) => events.push(...payload.value));
  const tracingDone = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: [
        'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
        'disabled-by-default-devtools.timeline.stack', 'blink.user_timing', 'v8.execute',
        ...(args.selectors ? ['disabled-by-default-blink.debug'] : []),
      ],
      excludedCategories: ['*'],
    },
  });
  if (args.profile) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  }
  const before = metrics(await cdp.send('Performance.getMetrics'));
  const stepTimes = [];
  const dragStart = performance.now();
  for (const width of widths) {
    const start = performance.now();
    await setWidth(width);
    await frame();
    stepTimes.push(performance.now() - start);
  }
  const dragMs = performance.now() - dragStart;
  const after = metrics(await cdp.send('Performance.getMetrics'));
  let profile;
  if (args.profile) {
    profile = (await cdp.send('Profiler.stop')).profile;
    await cdp.send('Profiler.disable');
  }
  await cdp.send('Tracing.end');
  await tracingDone;
  const probe = await page.evaluate(() => window.__resizeProbe);
  const dom = await page.evaluate(() => {
    const count = (selector) => document.querySelectorAll(selector).length;
    const containers = [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).containerType !== 'normal').length;
    return { elements: count('*'), hubGrid: count('.hub-grid *'), header: count('header *'), footer: count('footer *'), containers };
  });

  const shots = [];
  if (args.shots && args['shot-dir']) {
    fs.mkdirSync(args['shot-dir'], { recursive: true });
    for (const width of String(args.shots).split(',').map(Number)) {
      // platform: A Playwright full-page capture re-applies the context viewport, so the viewport is set here.
      await page.setViewportSize({ width, height });
      await frame();
      await page.waitForTimeout(600);
      const file = path.join(args['shot-dir'], `${label}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      shots.push(file);
    }
  }
  await browser.close();

  const delta = {};
  for (const key of Object.keys(after)) delta[key] = after[key] - before[key];
  return {
    label, dist, widths: { from, to, step, count: widths.length }, height, dpr, dragMs,
    stepMs: summary(stepTimes), floorMs: summary(harnessFloor),
    frameMs: summary(probe.frames), longTasks: probe.longTasks.length,
    longTaskMs: probe.longTasks.reduce((sum, ms) => sum + ms, 0),
    perFrame: {
      layoutCount: delta.LayoutCount / widths.length,
      styleCount: delta.RecalcStyleCount / widths.length,
      layoutMs: 1000 * delta.LayoutDuration / widths.length,
      styleMs: 1000 * delta.RecalcStyleDuration / widths.length,
      scriptMs: 1000 * delta.ScriptDuration / widths.length,
      taskMs: 1000 * delta.TaskDuration / widths.length,
    },
    dom,
    trace: analyzeTrace(events, widths.length),
    profile: profile ? analyzeProfile(profile) : undefined,
    shots,
  };
}

function metrics(response) {
  return Object.fromEntries(response.metrics.map((metric) => [metric.name, metric.value]));
}

function summary(values) {
  if (!values.length) return { n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: at(0.5), p90: at(0.9), max: sorted[sorted.length - 1],
  };
}

const STAGES = {
  script: ['FunctionCall', 'EvaluateScript', 'EventDispatch', 'TimerFire', 'RunMicrotasks', 'V8.Execute', 'v8.compile', 'V8.GC', 'MinorGC', 'MajorGC', 'FireAnimationFrame', 'ResizeObserver'],
  style: ['UpdateLayoutTree', 'ScheduleStyleRecalculation'],
  layout: ['Layout', 'PrePaint', 'UpdateLayer', 'HitTest', 'IntersectionObserverController::computeIntersections'],
  paint: ['Paint', 'PaintImage', 'UpdateLayerTree', 'Layerize', 'CompositeLayers', 'Commit', 'ProxyMain::BeginMainFrame::commit'],
  decode: ['Decode Image', 'ImageDecodeTask', 'Decode LazyPixelRef', 'ImageUploadTask', 'Draw LazyPixelRef'],
  raster: ['RasterTask', 'Rasterize', 'DrawFrame', 'Rasterizer::DoRasterTask'],
};

function analyzeTrace(events, frames) {
  const threadNames = new Map();
  for (const event of events) {
    if (event.ph === 'M' && event.name === 'thread_name') threadNames.set(`${event.pid}:${event.tid}`, event.args.name);
  }
  const complete = events.filter((event) => event.ph === 'X' && typeof event.dur === 'number');
  complete.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const self = new Map();
  const stacks = new Map();
  for (const event of complete) {
    const key = `${event.pid}:${event.tid}`;
    const stack = stacks.get(key) ?? [];
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= event.ts) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) self.set(parent, (self.get(parent) ?? parent.dur) - event.dur);
    stack.push(event);
    stacks.set(key, stack);
  }
  const selfOf = (event) => Math.max(0, self.get(event) ?? event.dur) / 1000;

  const byName = {};
  const byThread = {};
  const stages = {};
  const callbacks = {};
  const images = {};
  const decodes = {};
  const dispatches = {};
  const selectors = {};
  const recalcSizes = [];
  let layoutObjects = 0;
  let layoutDirty = 0;
  let layoutEvents = 0;
  let styleElements = 0;
  for (const event of complete) {
    const thread = threadNames.get(`${event.pid}:${event.tid}`) ?? String(event.tid);
    const main = thread === 'CrRendererMain';
    const ms = selfOf(event);
    const lane = main ? 'main' : (/CompositorTileWorker|ThreadPool|RasterWorker/.test(thread) ? 'raster' : thread);
    byThread[lane] = (byThread[lane] ?? 0) + ms;
    const named = `${lane}:${event.name}`;
    byName[named] = (byName[named] ?? 0) + ms;
    const stage = Object.keys(STAGES).find((name) => STAGES[name].includes(event.name));
    if (stage) stages[stage] = (stages[stage] ?? 0) + ms;
    const data = event.args?.data ?? {};
    if (event.name === 'FunctionCall' && main) {
      const site = `${data.functionName || '(anonymous)'} ${shortUrl(data.url)}:${data.lineNumber ?? '?'}`;
      callbacks[site] = (callbacks[site] ?? 0) + event.dur / 1000;
    }
    if (event.name === 'EventDispatch') dispatches[data.type] = (dispatches[data.type] ?? 0) + event.dur / 1000;
    if (event.name === 'PaintImage') {
      const site = `${shortUrl(data.url)} ${data.srcWidth}x${data.srcHeight} -> ${Math.round(data.width)}x${Math.round(data.height)}`;
      images[site] = (images[site] ?? 0) + event.dur / 1000;
    }
    if (STAGES.decode.includes(event.name)) {
      const site = `${event.name} ${shortUrl(data.url)} ${data.imageType ?? ''}`.trim();
      decodes[site] = (decodes[site] ?? 0) + event.dur / 1000;
    }
    if (event.name === 'Layout' && main) {
      layoutEvents++;
      layoutObjects += event.args?.beginData?.totalObjects ?? 0;
      layoutDirty += event.args?.beginData?.dirtyObjects ?? 0;
    }
    if (event.name === 'UpdateLayoutTree' && main) {
      styleElements += event.args?.elementCount ?? 0;
      recalcSizes.push(event.args?.elementCount ?? 0);
    }
    for (const timing of event.args?.selector_stats?.selector_timings ?? []) {
      const row = selectors[timing.selector] ??= { us: 0, attempts: 0, matches: 0 };
      row.us += timing['elapsed (us)'] ?? 0;
      row.attempts += timing.match_attempts ?? 0;
      row.matches += timing.match_count ?? 0;
    }
  }
  const perFrame = (table) => Object.fromEntries(Object.entries(table).map(([key, ms]) => [key, ms / frames]));
  const top = (table, n = 25) => Object.fromEntries(Object.entries(perFrame(table)).sort((a, b) => b[1] - a[1]).slice(0, n));
  return {
    frames,
    events: complete.length,
    stagesPerFrameMs: perFrame(stages),
    threadsPerFrameMs: perFrame(byThread),
    topNamesPerFrameMs: top(byName, 30),
    callbacksPerFrameMs: top(callbacks),
    dispatchesPerFrameMs: top(dispatches),
    paintImagesPerFrameMs: top(images),
    decodesPerFrameMs: top(decodes),
    layout: { perFrame: layoutEvents / frames, dirtyPerFrame: layoutDirty / frames, totalPerFrame: layoutObjects / frames },
    styleElementsPerFrame: styleElements / frames,
    selectorsPerFrame: Object.fromEntries(Object.entries(selectors).sort((a, b) => b[1].us - a[1].us).slice(0, 40)
      .map(([selector, row]) => [`${selector}  (${(row.attempts / frames).toFixed(0)} tries, ${(row.matches / frames).toFixed(0)} hits)`, row.us / 1000 / frames])),
    selectorTotalPerFrameMs: Object.values(selectors).reduce((sum, row) => sum + row.us, 0) / 1000 / frames,
    recalcSizes: summary(recalcSizes),
  };
}

function shortUrl(url) {
  if (!url) return '';
  try { return new URL(url).pathname.replace(/^\/assets\//, ''); } catch { return url; }
}

function analyzeProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const selfMs = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const delta = (profile.timeDeltas[i] ?? 0) / 1000;
    selfMs.set(profile.samples[i], (selfMs.get(profile.samples[i]) ?? 0) + delta);
  }
  const byFrame = {};
  for (const [id, ms] of selfMs) {
    const { callFrame } = nodes.get(id);
    const site = `${callFrame.functionName || '(anonymous)'} ${shortUrl(callFrame.url)}:${callFrame.lineNumber + 1}`;
    byFrame[site] = (byFrame[site] ?? 0) + ms;
  }
  const total = [...selfMs.values()].reduce((sum, ms) => sum + ms, 0);
  return { totalMs: total, top: Object.fromEntries(Object.entries(byFrame).sort((a, b) => b[1] - a[1]).slice(0, 30)) };
}

function report(result) {
  const ms = (value) => (value ?? 0).toFixed(2);
  console.log(`\n${result.label}: ${result.widths.count} frames, ${result.widths.from} -> ${result.widths.to} -> ${result.widths.from} px, step ${result.widths.step}, ${result.height} px tall, dpr ${result.dpr}`);
  console.log(`drag ${ms(result.dragMs)} ms total; step p50 ${ms(result.stepMs.p50)} p90 ${ms(result.stepMs.p90)} max ${ms(result.stepMs.max)} ms; floor p50 ${ms(result.floorMs.p50)} ms`);
  console.log(`page rAF interval p50 ${ms(result.frameMs.p50)} p90 ${ms(result.frameMs.p90)} max ${ms(result.frameMs.max)} ms; long tasks ${result.longTasks} (${ms(result.longTaskMs)} ms)`);
  const p = result.perFrame;
  console.log(`Performance domain per frame: task ${ms(p.taskMs)} script ${ms(p.scriptMs)} style ${ms(p.styleMs)} (${p.styleCount.toFixed(2)} recalcs) layout ${ms(p.layoutMs)} (${p.layoutCount.toFixed(2)} layouts)`);
  const t = result.trace;
  console.log(`trace per frame by stage (self ms): ${Object.entries(t.stagesPerFrameMs).map(([k, v]) => `${k} ${ms(v)}`).join(', ')}`);
  console.log(`trace per frame by thread (self ms): ${Object.entries(t.threadsPerFrameMs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${ms(v)}`).join(', ')}`);
  console.log(`layout per frame: ${t.layout.perFrame.toFixed(2)} passes, ${t.layout.dirtyPerFrame.toFixed(0)} dirty of ${t.layout.totalPerFrame.toFixed(0)} objects; style ${t.styleElementsPerFrame.toFixed(0)} elements`);
  const table = (title, rows) => {
    console.log(`\n${title}`);
    for (const [key, value] of Object.entries(rows)) console.log(`  ${ms(value).padStart(8)}  ${key}`);
  };
  table('top trace names per frame (self ms)', t.topNamesPerFrameMs);
  table('callbacks per frame (total ms)', t.callbacksPerFrameMs);
  table('event dispatches per frame (total ms)', t.dispatchesPerFrameMs);
  table('image paints per frame (total ms)', t.paintImagesPerFrameMs);
  table('image decodes per frame (total ms)', t.decodesPerFrameMs);
  if (args.selectors) {
    console.log(`style recalc passes: ${t.recalcSizes.n} in all, elements per pass p50 ${t.recalcSizes.p50} p90 ${t.recalcSizes.p90} max ${t.recalcSizes.max}`);
    console.log(`dom: ${JSON.stringify(result.dom)}`);
    table(`selector matching per frame (ms, ${ms(t.selectorTotalPerFrameMs)} ms in all)`, t.selectorsPerFrame);
  }
  if (result.profile) table(`cpu profile self time over the drag (${ms(result.profile.totalMs)} ms sampled)`, result.profile.top);
  if (result.shots.length) console.log(`\nscreenshots: ${result.shots.join(' ')}`);
}

async function compare(a, b, diffOut) {
  const bytesA = fs.readFileSync(a);
  const bytesB = fs.readFileSync(b);
  if (bytesA.equals(bytesB)) {
    console.log(`identical bytes: ${a} == ${b}`);
    return;
  }
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });
  const page = await browser.newPage();
  const result = await page.evaluate(async ([srcA, srcB]) => {
    const load = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    const [imgA, imgB] = await Promise.all([load(srcA), load(srcB)]);
    const width = Math.max(imgA.width, imgB.width);
    const height = Math.max(imgA.height, imgB.height);
    const pixels = (img) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, width, height).data;
    };
    const dataA = pixels(imgA);
    const dataB = pixels(imgB);
    const diff = document.createElement('canvas');
    diff.width = width;
    diff.height = height;
    const ctx = diff.getContext('2d');
    const out = ctx.createImageData(width, height);
    let differing = 0;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let i = 0; i < dataA.length; i += 4) {
      const same = dataA[i] === dataB[i] && dataA[i + 1] === dataB[i + 1] && dataA[i + 2] === dataB[i + 2] && dataA[i + 3] === dataB[i + 3];
      const gray = Math.round((dataA[i] + dataA[i + 1] + dataA[i + 2]) / 3 * 0.25 + 190);
      out.data[i] = same ? gray : 255;
      out.data[i + 1] = same ? gray : 0;
      out.data[i + 2] = same ? gray : 0;
      out.data[i + 3] = 255;
      if (!same) {
        differing++;
        const x = (i / 4) % width;
        const y = Math.floor(i / 4 / width);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    ctx.putImageData(out, 0, 0);
    return {
      sizeA: [imgA.width, imgA.height], sizeB: [imgB.width, imgB.height],
      differing, total: width * height, box: differing ? [minX, minY, maxX, maxY] : null,
      diff: diff.toDataURL('image/png'),
    };
  }, [`data:image/png;base64,${bytesA.toString('base64')}`, `data:image/png;base64,${bytesB.toString('base64')}`]);
  await browser.close();
  console.log(`${a} ${result.sizeA.join('x')} vs ${b} ${result.sizeB.join('x')}: ${result.differing} of ${result.total} pixels differ (${(100 * result.differing / result.total).toFixed(4)}%)${result.box ? `, box x ${result.box[0]}-${result.box[2]} y ${result.box[1]}-${result.box[3]}` : ''}`);
  if (diffOut && result.differing) {
    fs.writeFileSync(diffOut, Buffer.from(result.diff.split(',')[1], 'base64'));
    console.log(`diff image: ${diffOut}`);
  }
}

async function sweepGeometry(outFile) {
  const { browser, page, setWidth, frame } = await openHub();
  const sweep = {};
  for (let width = to; width <= from; width += step) {
    await setWidth(width);
    await frame();
    await frame();
    sweep[width] = await page.evaluate(() => {
      const path = (el) => {
        const parts = [];
        for (let node = el; node && node !== document.body; node = node.parentElement) {
          const siblings = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : [node];
          const tag = node.tagName.toLowerCase();
          const mark = node.getAttribute('data-hub-card') ?? node.getAttribute('data-shot') ?? node.getAttribute('data-home-picture') ?? '';
          parts.unshift(`${tag}${mark ? `[${mark}]` : ''}${siblings.length > 1 ? `:${siblings.indexOf(node) + 1}` : ''}`);
        }
        return parts.join('>');
      };
      const out = {};
      for (const el of document.querySelectorAll('#root *')) {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        out[path(el)] = [r.x, r.y, r.width, r.height, style.fontSize, style.transform, style.borderRadius].join('|');
      }
      return out;
    });
  }
  await browser.close();
  fs.writeFileSync(outFile, JSON.stringify({ label, dist, from, to, step, height, dpr, sweep }));
  console.log(`${label}: ${Object.keys(sweep).length} widths, ${Object.keys(Object.values(sweep)[0]).length} elements each -> ${outFile}`);
}

function compareGeometry(fileA, fileB) {
  const a = JSON.parse(fs.readFileSync(fileA, 'utf8'));
  const b = JSON.parse(fs.readFileSync(fileB, 'utf8'));
  const widths = Object.keys(a.sweep);
  const byElement = {};
  let differingWidths = 0;
  for (const width of widths) {
    const rowsA = a.sweep[width];
    const rowsB = b.sweep[width] ?? {};
    const keys = new Set([...Object.keys(rowsA), ...Object.keys(rowsB)]);
    let differs = false;
    for (const key of keys) {
      if (rowsA[key] === rowsB[key]) continue;
      differs = true;
      const row = byElement[key] ??= { widths: 0, example: null };
      row.widths++;
      row.example ??= { width, a: rowsA[key], b: rowsB[key] };
    }
    if (differs) differingWidths++;
  }
  console.log(`${widths.length} widths compared; ${differingWidths} widths differ; ${Object.keys(byElement).length} elements differ`);
  for (const [key, row] of Object.entries(byElement).sort((x, y) => y[1].widths - x[1].widths).slice(0, 40)) {
    console.log(`  ${row.widths} widths  ${key}\n      at ${row.example.width}: ${row.example.a}\n      vs ${row.example.b}`);
  }
}

// platform: Stopping a wrapper process can leave vite holding the port, so vite runs directly in its own process group.
function serve(outDir, listenPort) {
  const vite = path.join(root, 'node_modules/vite/bin/vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--outDir', outDir, '--port', String(listenPort), '--strictPort'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  const stop = () => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    child.stdout.destroy();
    child.stderr.destroy();
  };
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30_000;
    const poll = async () => {
      if (child.exitCode !== null) { reject(new Error(`vite preview exited: ${log}`)); return; }
      try {
        const response = await fetch(`http://localhost:${listenPort}/`);
        if (response.ok) { resolve({ stop }); return; }
      } catch {}
      if (Date.now() > deadline) { stop(); reject(new Error(`vite preview did not start: ${log}`)); return; }
      setTimeout(poll, 200);
    };
    void poll();
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'compare' || key === 'compare-geometry') { parsed[key] = [argv[++i], argv[++i]]; continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) parsed[key] = true;
    else parsed[key] = argv[++i];
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

const dist = path.resolve(args.dist ?? 'dist');
const port = Number(args.port ?? 4320);
const from = Number(args.from ?? 2272);
const to = Number(args.to ?? 1000);
const step = Number(args.step ?? 8);
const height = Number(args.height ?? 1300);
const dpr = Number(args.dpr ?? 1);
const route = args.url ?? '/';
const label = args.label ?? path.basename(dist);

if (args.compare) {
  await compare(args.compare[0], args.compare[1], args['diff-out']);
} else if (args['compare-geometry']) {
  compareGeometry(args['compare-geometry'][0], args['compare-geometry'][1]);
} else if (args.geometry) {
  const server = await serve(dist, port);
  try {
    await sweepGeometry(args.geometry);
  } finally {
    server.stop();
  }
} else {
  const server = await serve(dist, port);
  try {
    const result = await measure();
    if (args.out) fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
    report(result);
  } finally {
    server.stop();
  }
}
