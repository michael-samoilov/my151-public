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

// Runs inside the page. Returns findings with page-space rects.
function inPage(cfg) {
  const out = [];
  const seen = new Set();
  const add = (kind, severity, el, detail, rect) => {
    const key = kind + '|' + pathOf(el) + '|' + detail;
    if (seen.has(key)) return;
    seen.add(key);
    const r = rect ?? el.getBoundingClientRect();
    out.push({
      kind, severity, path: pathOf(el), text: textOf(el), detail,
      rect: { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height },
    });
  };
  function pathOf(el) {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) { parts.unshift('#' + e.id); break; }
      const sib = [...(e.parentElement?.children ?? [])].filter((c) => c.tagName === e.tagName);
      if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(e) + 1})`;
      parts.unshift(s);
    }
    return parts.slice(-6).join(' > ');
  }
  function textOf(el) {
    const t = (el.tagName === 'IMG' ? (el.getAttribute('alt') || el.getAttribute('src')) : el.innerText || '').trim().replace(/\s+/g, ' ');
    return t.length > 60 ? t.slice(0, 57) + '…' : t;
  }
  const all = [...document.body.querySelectorAll('*')];
  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent).join('').trim();
  const isTextLeaf = (el) => ownText(el).length > 0 && el.closest('svg') === null;
  /** A box the viewer sees as a shape: a fill, a border, or a shadow. A chip or a badge is one even when its icon sits safely inside. */
  const isPainted = (el) => {
    if (el.closest('svg') || el.hasAttribute('data-render-audit')) return false;
    const cs = getComputedStyle(el);
    const alpha = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); return m ? (m[1].split(',')[3] === undefined ? 1 : parseFloat(m[1].split(',')[3])) : 0; };
    if (alpha(cs.backgroundColor) > 0 || cs.backgroundImage !== 'none') return true;
    if (cs.boxShadow !== 'none') return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none' && alpha(cs[`border${side}Color`]) > 0);
  };
  const isVisual = (el) => (el.tagName === 'IMG' || (el.tagName === 'svg' && !el.parentElement.closest('svg')) || isTextLeaf(el) || isPainted(el)) && isVisible(el);
  const clips = (el) => { const o = getComputedStyle(el); return /hidden|clip|scroll|auto/.test(o.overflowX + o.overflowY); };

  // Frame.
  const root = document.querySelector('x-dc > :not(helmet)') ?? document.body.firstElementChild ?? document.body;
  const frameW = cfg.frame?.w ?? root.getBoundingClientRect().width;
  const frameH = cfg.frame?.h ?? root.getBoundingClientRect().height;
  const de = document.documentElement;
  if (de.scrollWidth > frameW + 1 || de.scrollHeight > frameH + 1) {
    add('overflow-frame', 'error', root, `page is ${de.scrollWidth}×${de.scrollHeight}, frame is ${Math.round(frameW)}×${Math.round(frameH)}`,
      { left: 0, top: 0, width: de.scrollWidth, height: de.scrollHeight });
  }

  // Fonts.
  if (cfg.family && !document.fonts.check(`16px "${cfg.family}"`)) {
    add('font-fallback', 'error', document.body, `"${cfg.family}" did not load; text is drawn in a fallback face`);
  }

  const visuals = all.filter(isVisual);
  const rectOf = (el) => el.getBoundingClientRect();
  /** The part of an element a viewer can see: its box cut by every clipping ancestor. Null when nothing shows. */
  const visibleRect = (el) => {
    let r = rectOf(el);
    let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (!clips(a)) continue;
      const ar = rectOf(a);
      box = { left: Math.max(box.left, ar.left), top: Math.max(box.top, ar.top), right: Math.min(box.right, ar.right), bottom: Math.min(box.bottom, ar.bottom) };
      if (box.right - box.left < 1 || box.bottom - box.top < 1) return null;
    }
    return box;
  };

  for (const el of visuals) {
    const cs = getComputedStyle(el);
    const r = rectOf(el);

    // Truncation by ellipsis.
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
      add('truncated', 'error', el, `${el.scrollWidth - el.clientWidth}px of the text is cut and replaced by an ellipsis`);
    }
    // Text cut by a height clip on the element itself.
    if (isTextLeaf(el) && clips(el) && el.scrollHeight > el.clientHeight + 1 && el.getAttribute('data-audit-clip') !== 'intended') {
      add('text-cut', 'error', el, `${el.scrollHeight - el.clientHeight}px of text hidden below the box`);
    }
    // Clipped by an ancestor.
    for (let a = el.parentElement; a && a !== document.body && el !== root; a = a.parentElement) {
      if (!clips(a)) continue;
      if (a.getAttribute('data-audit-clip') === 'intended') break;
      const ar = rectOf(a);
      const acs = getComputedStyle(a);
      const box = {
        left: ar.left + parseFloat(acs.borderLeftWidth), top: ar.top + parseFloat(acs.borderTopWidth),
        right: ar.right - parseFloat(acs.borderRightWidth), bottom: ar.bottom - parseFloat(acs.borderBottomWidth),
      };
      const over = [];
      if (r.left < box.left - 1) over.push(`left ${(box.left - r.left).toFixed(1)}px`);
      if (r.right > box.right + 1) over.push(`right ${(r.right - box.right).toFixed(1)}px`);
      if (r.top < box.top - 1) over.push(`top ${(box.top - r.top).toFixed(1)}px`);
      if (r.bottom > box.bottom + 1) over.push(`bottom ${(r.bottom - box.bottom).toFixed(1)}px`);
      if (over.length) add('clipped', 'error', el, `runs past its clipping container (${pathOf(a)}) on the ${over.join(', ')}`);
      break; // the nearest clipper decides
    }
    // Outside the frame: only the part a viewer can see counts, so content a
    // container clips away on purpose is not reported twice.
    const vis = visibleRect(el);
    if (vis) {
      const fr = { left: 0, top: 0, right: frameW, bottom: frameH };
      const outside = [];
      if (vis.left + scrollX < fr.left - 1) outside.push('left');
      if (vis.right + scrollX > fr.right + 1) outside.push('right');
      if (vis.top + scrollY < fr.top - 1) outside.push('top');
      if (vis.bottom + scrollY > fr.bottom + 1) outside.push('bottom');
      if (outside.length) add('outside-frame', 'error', el, `extends past the frame's ${outside.join(', ')} edge`);
    }

    // Images.
    if (el.tagName === 'IMG') {
      if (!el.complete || el.naturalWidth === 0) add('image-broken', 'error', el, 'image did not load');
      else if (!el.closest('[data-audit-scale="intended"]')) {
        const scale = r.width / el.naturalWidth;
        const pixel = /pixelated|crisp-edges/.test(cs.imageRendering);
        if (pixel && Math.abs(scale - Math.round(scale)) > 0.01) {
          add('image-scale', 'error', el, `pixel art drawn at ${scale.toFixed(2)}× (${Math.round(r.width)}px from ${el.naturalWidth}px); use an integer scale`);
        } else if (!pixel && scale > 2.05) {
          add('image-scale', 'warning', el, `upscaled ${scale.toFixed(2)}× from ${el.naturalWidth}px`);
        }
      }
    }

    // Text: size, wraps.
    if (isTextLeaf(el)) {
      const size = parseFloat(cs.fontSize);
      if (size < cfg.minFont) add('tiny-text', 'warning', el, `${size.toFixed(1)}px is under the ${cfg.minFont}px floor`);
      const text = ownText(el).replace(/\s+/g, ' ');
      const lines = lineTops(el);
      if (lines.length >= 3 && text.length <= 30) {
        add('awkward-wrap', 'warning', el, `${text.length} characters wrapped onto ${lines.length} lines`);
      } else if (lines.length >= 2) {
        const orphan = lastLineWord(el, lines);
        if (orphan !== null && orphan.length <= 4 && text.split(' ').length >= 3) {
          add('awkward-wrap', 'warning', el, `the last line holds only "${orphan}"`);
        }
      }
    }
  }

  // Text over text: two text leaves from different branches sharing pixels.
  const texts = visuals.filter(isTextLeaf).map((el) => ({ el, vis: visibleRect(el) })).filter((t) => t.vis);
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i].el, b = texts[j].el;
      if (a.contains(b) || b.contains(a)) continue;
      const ra = texts[i].vis, rb = texts[j].vis;
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 2 && oy > 2) add('text-overlap', 'warning', a, `overlaps "${textOf(b)}" by ${ox.toFixed(0)}×${oy.toFixed(0)}px`);
    }
  }

  function lineTops(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = [];
    for (const b of range.getClientRects()) {
      if (b.width < 1 || b.height < 1) continue;
      if (!tops.some((t) => Math.abs(t - b.top) < 3)) tops.push(b.top);
    }
    return tops.sort((p, q) => p - q);
  }
  /** The single word on the last line, or null when the last line holds more than one. */
  function lastLineWord(el, tops) {
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3);
    if (nodes.length !== 1) return null;
    const node = nodes[0];
    const s = node.textContent;
    const lastTop = tops[tops.length - 1];
    const words = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(s))) {
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const b = range.getBoundingClientRect();
      if (Math.abs(b.top - lastTop) < 3) words.push(m[0]);
    }
    return words.length === 1 ? words[0] : null;
  }

  // Draw the evidence.
  out.forEach((f, i) => {
    const box = document.createElement('div');
    const colour = f.severity === 'error' ? '#e11d48' : '#f59e0b';
    box.setAttribute('data-render-audit', '');
    box.style.cssText = `position:absolute;left:${f.rect.x - 2}px;top:${f.rect.y - 2}px;width:${f.rect.w + 4}px;height:${f.rect.h + 4}px;outline:2px solid ${colour};box-sizing:border-box;pointer-events:none;z-index:2147483647;`;
    const tag = document.createElement('span');
    tag.textContent = String(i + 1);
    tag.style.cssText = `position:absolute;left:-2px;top:-16px;background:${colour};color:#fff;font:700 11px/14px system-ui,sans-serif;padding:0 4px;border-radius:3px;`;
    box.appendChild(tag);
    document.body.appendChild(box);
  });
  return { frame: { w: frameW, h: frameH }, findings: out };
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
  const result = await page.evaluate(inPage, { frame, family: opt.family, minFont: opt.minFont });
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
  const expected = ['truncated', 'text-cut', 'clipped', 'outside-frame', 'image-scale', 'image-broken', 'awkward-wrap', 'tiny-text', 'text-overlap'];
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
