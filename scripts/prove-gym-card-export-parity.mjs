/**
 * Before/after stills for gym-card export vs the in-app trainer card.
 * Same Nimbus / Cotton Guard / Altaria / Mareep input on base and on HEAD.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_REF = 'origin/claude/pokedex-region-builder-AviYF';
const OUT = '/cursor/stores/bc-90921133-efcd-47c7-a250-292e78a355ed/media/gym-card-export-parity';
const ART = '/opt/cursor/artifacts';
const WORKTREE = '/tmp/my151-gym-export-base';

const EMPTY = {
  type: null,
  theme: '',
  lines: [],
  signatureSeat: null,
  signatureId: null,
  partnerId: null,
  tmMoveId: null,
  badgeName: '',
  legend: null,
  powerup: null,
};

function nimbusState({ partner = true } = {}) {
  const cards = Array.from({ length: 14 }, () => ({ ...EMPTY, lines: [] }));
  cards[0] = {
    ...EMPTY,
    type: 'flying',
    theme: 'Clouds',
    lines: [
      { branch: [333, 334], boundaries: [1, 6] },
      { branch: [179, 180, 181], boundaries: [1, 4, 8] },
    ],
    signatureSeat: 1,
    signatureId: 334,
    partnerId: partner ? 179 : null,
    tmMoveId: 538,
    badgeName: 'Nimbus',
  };
  return { state: { name: '', cards }, version: 1 };
}

async function seed(page, opts) {
  await page.addInitScript((state) => {
    localStorage.setItem('league-builder', JSON.stringify(state));
  }, nimbusState(opts));
}

async function openCard(page, baseUrl) {
  await page.goto(`${baseUrl}/custom-gym-leader`);
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="slot-tm"]');
  await page.waitForTimeout(700);
}

async function openExport(page) {
  await page.getByRole('button', { name: 'Export trainer card' }).click();
  await page.waitForSelector('[data-export-preview] img', { timeout: 45_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-export-preview] img');
    return img && img.complete && img.naturalWidth > 800;
  });
  await page.waitForTimeout(400);
  await page.locator('[data-export-tilt-hit]').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(500);
}

async function savePng(page, dest) {
  const src = await page.locator('[data-export-preview] img').getAttribute('src');
  const bytes = await page.evaluate(async (url) => {
    const buf = await (await fetch(url)).arrayBuffer();
    return Array.from(new Uint8Array(buf));
  }, src);
  await writeFile(dest, Buffer.from(bytes));
}

async function shot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  await page.screenshot({ path: join(ART, file), fullPage: true });
}

async function captureSet(page, baseUrl, prefix) {
  await seed(page);
  await openCard(page, baseUrl);
  for (const [label, w, h] of [['mobile_390', 390, 844], ['desktop_1280', 1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await shot(page, `${prefix}_inapp_${label}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await openExport(page);
  await savePng(page, join(OUT, `${prefix}_export_png.png`));
  await savePng(page, join(ART, `${prefix}_export_png.png`));
  for (const [label, w, h] of [['mobile_390', 390, 844], ['desktop_1280', 1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    await shot(page, `${prefix}_export_overlay_${label}`);
  }
}

async function captureSolo(page, baseUrl, prefix) {
  await seed(page, { partner: false });
  await openCard(page, baseUrl);
  for (const [label, w, h] of [['mobile_390', 390, 844], ['desktop_1280', 1280, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await shot(page, `${prefix}_solo_inapp_${label}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await openExport(page);
  await savePng(page, join(OUT, `${prefix}_solo_export_png.png`));
  await savePng(page, join(ART, `${prefix}_solo_export_png.png`));
  await shot(page, `${prefix}_solo_export_overlay_desktop_1280`);
}

function startPreview(cwd, port) {
  const child = execSync(
    `nohup npx vite preview --host 127.0.0.1 --port ${port} --strictPort > /tmp/preview-${port}.log 2>&1 & echo $!`,
    { cwd, encoding: 'utf8' },
  ).trim();
  execSync(`while ! curl -sf http://127.0.0.1:${port}/ >/dev/null; do sleep 0.3; done`, {
    shell: '/bin/bash',
  });
  return {
    stop: () => {
      try { execSync(`kill ${child}`); } catch { /* noop */ }
    },
  };
}

await mkdir(OUT, { recursive: true });
await mkdir(ART, { recursive: true });

try { execSync(`git worktree remove ${WORKTREE} --force`, { stdio: 'ignore' }); } catch { /* none */ }
execSync(`rm -rf ${WORKTREE}`);
execSync(`git worktree add ${WORKTREE} ${BASE_REF}`, { stdio: 'inherit' });
execSync('ln -sfn /workspace/node_modules node_modules', { cwd: WORKTREE, stdio: 'inherit' });
execSync('npm run build', { cwd: WORKTREE, stdio: 'inherit' });

const basePreview = startPreview(WORKTREE, 4191);
const fixPreview = startPreview('/workspace', 4190);

const browser = await chromium.launch();
const beforeCtx = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 1280, height: 800 } });
const beforePage = await beforeCtx.newPage();
await captureSet(beforePage, 'http://127.0.0.1:4191', 'before');
await beforePage.close();
await beforeCtx.close();
const beforeSoloCtx = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 1280, height: 800 } });
const beforeSoloPage = await beforeSoloCtx.newPage();
await captureSolo(beforeSoloPage, 'http://127.0.0.1:4191', 'before');
await beforeSoloPage.close();
await beforeSoloCtx.close();
const afterCtx = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 1280, height: 800 } });
const afterPage = await afterCtx.newPage();
await captureSet(afterPage, 'http://127.0.0.1:4190', 'after');
await afterPage.close();
await afterCtx.close();
const afterSoloCtx = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 1280, height: 800 } });
const afterSoloPage = await afterSoloCtx.newPage();
await captureSolo(afterSoloPage, 'http://127.0.0.1:4190', 'after');
await afterSoloPage.close();
await afterSoloCtx.close();
await browser.close();
basePreview.stop();
fixPreview.stop();
try { execSync(`git worktree remove ${WORKTREE} --force`); } catch { /* noop */ }
console.log('wrote stills to', OUT, 'and', ART);
