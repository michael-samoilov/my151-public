#!/usr/bin/env node
/**
 * render-audit: find clipped, truncated, overflowing, or awkwardly wrapped
 * content in rendered HTML (mockups, image exports, static pages) before a
 * person has to point it out.
 *
 * Usage:
 *   node audit.mjs --out <dir> [--font <woff2> --family <name>] [--frame WxH]
 *                  [--manifest canvas.json] [--min-font 12] [--chromium <path>]
 *                  file.html [file2.html ...]
 *
 * Every finding carries the element's path, its text, the numbers that prove
 * it, and a red (error) or orange (warning) box on <out>/<name>.audit.png.
 * Exit code 1 when any error-severity finding exists.
 *
 * Opt-outs live in the markup, never in this script: an element that clips on
 * purpose (a crop, a scroll region) carries data-audit-clip="intended"; an image
 * meant to be scaled carries data-audit-scale="intended".
 */
import { chromium } from 'playwright';
import { auditBody } from './audit-core.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = { out: 'render-audit', minFont: 12, files: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--font') opt.font = args[++i];
  else if (a === '--family') opt.family = args[++i];
  else if (a === '--frame') opt.frame = args[++i];
  else if (a === '--manifest') opt.manifest = args[++i];
  else if (a === '--min-font') opt.minFont = Number(args[++i]);
  else if (a === '--chromium') opt.chromium = args[++i];
  else opt.files.push(a);
}
const selfTest = args.includes('--self-test');
if (selfTest) {
  const here = path.dirname(new URL(import.meta.url).pathname);
  opt.files = [path.join(here, 'fixture', 'known-bad.html'), path.join(here, 'fixture', 'known-good.html')];
  opt.frame = opt.frame ?? '420x320';
  opt.out = opt.out === 'render-audit' ? path.join(os.tmpdir(), 'render-audit-selftest') : opt.out;
}
if (opt.files.length === 0) {
  console.error('render-audit: no HTML files given');
  process.exit(2);
}

function findChromium() {
  if (opt.chromium) return opt.chromium;
  if (process.env.PW_BIN) return process.env.PW_BIN;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  const { readdirSync } = fsSync;
  for (const d of readdirSync(root)) {
    const p = path.join(root, d, 'chrome-linux', 'chrome');
    if (d.startsWith('chromium-') && existsSync(p)) return p;
  }
  return undefined;
}

/** Frame sizes from a canvas.json manifest, keyed by file stem. */
function frames() {
  const map = new Map();
  if (opt.manifest) {
    const m = JSON.parse(readFileSync(opt.manifest, 'utf8'));
    for (const a of m.artboards ?? []) map.set(a.file.replace(/\.dc\.html$|\.html$/, ''), { w: a.w, h: a.h });
  }
  return map;
}

const browser = await chromium.launch({ executablePath: findChromium() });
mkdirSync(opt.out, { recursive: true });
const frameMap = frames();
const report = [];
let errors = 0;
for (const file of opt.files) {
  const abs = path.resolve(file);
  const stem = path.basename(abs).replace(/\.dc\.html$|\.html$/, '');
  let frame = frameMap.get(stem);
  if (!frame && opt.frame) { const [w, h] = opt.frame.split('x').map(Number); frame = { w, h }; }
  const page = await browser.newPage({ viewport: { width: Math.round(frame?.w ?? 1280), height: Math.round(frame?.h ?? 800) }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto('file://' + abs);
  if (opt.font && opt.family) {
    const b64 = readFileSync(opt.font).toString('base64');
    await page.addStyleTag({ content: `@font-face{font-family:'${opt.family}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:100 900;}` });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const result = await page.evaluate(`(() => { ${auditBody({ frame, family: opt.family, minFont: opt.minFont, annotate: true, checkFrame: true })} })()`);
  const shot = path.join(opt.out, `${stem}.audit.png`);
  await page.screenshot({ path: shot, fullPage: true });
  await page.close();
  const errs = result.findings.filter((f) => f.severity === 'error').length;
  errors += errs;
  report.push({ file: abs, frame: result.frame, pageErrors, findings: result.findings, screenshot: shot });
  console.log(`${stem}: ${result.findings.length} finding(s), ${errs} error(s)${pageErrors.length ? `, ${pageErrors.length} page error(s)` : ''}`);
  result.findings.forEach((f, i) => console.log(`  ${i + 1}. [${f.severity}] ${f.kind} — ${f.detail}\n     ${f.path}${f.text ? ` — "${f.text}"` : ''}`));
}
await browser.close();
writeFileSync(path.join(opt.out, 'report.json'), JSON.stringify(report, null, 1));
console.log(`report: ${path.join(opt.out, 'report.json')}; ${errors} error(s) across ${opt.files.length} file(s)`);
if (selfTest) {
  // The audit proves it can fail: every defect class in the fixture must be reported, and the clean page must be clean.
  const bad = report[0].findings.map((f) => f.kind);
  const expected = ['truncated', 'text-cut', 'clipped', 'outside-frame', 'image-scale', 'image-broken', 'awkward-wrap', 'tiny-text', 'overlap'];
  const missing = expected.filter((k) => !bad.includes(k));
  const good = report[1].findings;
  if (missing.length || good.length) {
    console.error(`self-test FAILED: missing ${JSON.stringify(missing)}; clean page reported ${good.length} finding(s)`);
    process.exit(1);
  }
  console.log(`self-test ok: ${expected.length} defect classes reported on the bad page, none on the clean page`);
  process.exit(0);
}
process.exit(errors ? 1 : 0);
