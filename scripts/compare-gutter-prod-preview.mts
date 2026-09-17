import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { spawn as spawnProc } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichSubmissionsLastPointLabels } from './enrich-submissions-last-point.ts';

const PROD = 'https://my151.app';
const PREVIEW_LOCAL = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:4173';

const outDir =
  process.argv[2] ||
  '/cursor/stores/bc-2c0d71cc-6e07-42fc-a5a0-2743f7d55876/media/weekly-line-incomplete';
const artifacts = '/opt/cursor/artifacts';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadToken() {
  if (process.env.ADMIN_TOKEN?.trim()) return process.env.ADMIN_TOKEN.trim();
  return readFileSync('/tmp/.admin-token', 'utf8').trim();
}

const token = loadToken();
if (!token) {
  console.error('missing admin token');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(artifacts, { recursive: true });

async function fetchFullProdPayload() {
  const res = await fetch(`${PROD}/api/submissions?limit=500&offset=0`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`prod api ${res.status}`);
  return res.json();
}

function lastActivityRow(json: Record<string, unknown>) {
  const byTool = json.byTool as Record<string, { activity?: unknown[] }> | undefined;
  const slice = byTool?.all ?? byTool?.dex;
  const act = (slice?.activity ?? json.activity ?? []) as Record<string, unknown>[];
  return act[act.length - 1];
}

async function readDomGutter(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const label = document.querySelector('[aria-label*="Last 24 hours"]')?.getAttribute('aria-label') ?? '';
    const m24 = label.match(/Last 24 hours (\d+)/);
    const m7 = label.match(/last 7 days (\d+)/);
    return { h24: m24 ? Number(m24[1]) : null, d7: m7 ? Number(m7[1]) : null };
  });
}

async function openAdmin(page: import('@playwright/test').Page, origin: string) {
  await page.addInitScript(
    (tok) => {
      localStorage.setItem('p151-admin-token', tok);
      localStorage.setItem('p151-admin-tool', 'all');
    },
    token,
  );
  await page.goto(`${origin}/?admin`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: 'Sign out' }).waitFor({ timeout: 120_000 });
  await page.getByRole('heading', { name: 'Active users' }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
}

async function markGutterNumbers(page: import('@playwright/test').Page) {
  await page.evaluate(function markGutterNumbersInPage() {
    document.querySelectorAll('[data-gutter-diff-marker]').forEach(function (n) {
      n.remove();
    });
    const section = document.querySelector('[aria-label*="Last 24 hours"]')?.closest('section');
    const canvas = section?.querySelector('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    function ring(x, y) {
      const d = document.createElement('div');
      d.setAttribute('data-gutter-diff-marker', '1');
      d.style.cssText =
        'position:fixed;left:' +
        String(x - 8) +
        'px;top:' +
        String(y - 8) +
        'px;width:16px;height:16px;border:2px solid #dc2626;border-radius:50%;z-index:99999;pointer-events:none;box-shadow:0 0 0 1px #fff';
      document.body.appendChild(d);
    }
    ring(rect.right - 48, rect.top + rect.height * 0.42);
    ring(rect.right - 48, rect.top + rect.height * 0.26);
  });
}

async function captureV2(page: import('@playwright/test').Page, mark: boolean) {
  const viewports = [
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'desktop-1280', width: 1280, height: 900 },
  ];
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(800);
    await page.getByRole('heading', { name: 'Active users' }).waitFor({ timeout: 30_000 });
    const plain = path.join(outDir, `last-point-v2-${vp.name}.png`);
    await page.screenshot({ path: plain, fullPage: true });
    copyFileSync(plain, path.join(artifacts, `last-point-v2-${vp.name}.png`));
    if (mark) {
      try {
        await markGutterNumbers(page);
        const marked = path.join(outDir, `last-point-v2-${vp.name}-marked.png`);
        await page.screenshot({ path: marked, fullPage: true });
        copyFileSync(marked, path.join(artifacts, `last-point-v2-${vp.name}-marked.png`));
      } catch {
        // tsx injects __name into page.evaluate; unmarked shots still prove gutter text.
      }
    }
  }
}

function startPreview(): Promise<{ kill: () => void }> {
  return new Promise((resolve, reject) => {
    const child = spawnProc('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
      cwd: repoRoot,
      stdio: 'ignore',
      detached: true,
    });
    child.on('error', reject);
    const deadline = Date.now() + 30_000;
    const tick = () => {
      fetch(PREVIEW_LOCAL)
        .then((r) => {
          if (r.ok || r.status === 404) {
            resolve({ kill: () => child.kill('SIGTERM') });
          } else if (Date.now() < deadline) setTimeout(tick, 400);
          else reject(new Error('preview server timeout'));
        })
        .catch(() => {
          if (Date.now() < deadline) setTimeout(tick, 400);
          else reject(new Error('preview server timeout'));
        });
    };
    setTimeout(tick, 1500);
  });
}

const prodJson = await fetchFullProdPayload();
const enriched = enrichSubmissionsLastPointLabels(prodJson);
const prodLast = lastActivityRow(prodJson);
const previewLast = lastActivityRow(enriched);

const previewServer = await startPreview();

const browser = await chromium.launch();
const page = await browser.newPage();
let prodDom: { h24: number | null; d7: number | null };
let previewDom: { h24: number | null; d7: number | null };

try {
  await openAdmin(page, PROD);
  prodDom = await readDomGutter(page);

  await page.route('**/api/submissions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(enriched),
    });
  });

  await openAdmin(page, PREVIEW_LOCAL);
  previewDom = await readDomGutter(page);

  const mark = prodDom.h24 !== previewDom.h24 || prodDom.d7 !== previewDom.d7;

  const result = {
    dom: { production: prodDom, preview: previewDom },
    apiLastRow: {
      production: {
        dau: prodLast?.dau,
        rolling7: prodLast?.rolling7,
        label24h: prodLast?.label24h,
        label168h: prodLast?.label168h,
      },
      previewEnriched: {
        dau: previewLast?.dau,
        rolling7: previewLast?.rolling7,
        label24h: previewLast?.label24h,
        label168h: previewLast?.label168h,
      },
    },
    lastPointLabels: enriched.lastPointLabels,
    previewOrigin: PREVIEW_LOCAL,
    note: 'Preview uses branch build + enriched prod API (same as Vercel preview API semantics).',
  };

  writeFileSync('/tmp/gutter-compare-result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  await captureV2(page, mark);
} finally {
  await browser.close();
  previewServer.kill();
}
