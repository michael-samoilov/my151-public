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

/** Sabrina psychic / Alakazam ace / Psychic TM / Marsh. Michael's card. */
function sabrinaState() {
  const cards = Array.from({ length: 14 }, () => ({ ...EMPTY, lines: [] }));
  cards[0] = {
    ...EMPTY,
    type: 'psychic',
    theme: "Sabrina's psychic will",
    lines: [
      { branch: [63, 64, 65], boundaries: [1, 4, 8] },
      { branch: [133, 196], boundaries: [1, 8] },
      { branch: [439, 122], boundaries: [1, 8] },
      { branch: [238, 124], boundaries: [1, 8] },
      { branch: [360, 202], boundaries: [1, 8] },
      { branch: [280, 281, 475], boundaries: [1, 4, 8] },
    ],
    signatureSeat: 1,
    signatureId: 65,
    partnerId: null,
    tmMoveId: 94,
    badgeName: 'Marsh',
  };
  return { state: { name: '', cards }, version: 1 };
}

async function seed(page, state) {
  await page.addInitScript((next) => {
    localStorage.setItem('league-builder', JSON.stringify(next));
  }, state);
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
  await page.screenshot({ path: join(OUT, file), fullPage: false });
  await page.screenshot({ path: join(ART, file), fullPage: false });
}

/** Phone inner height that squashes the card to pane width, like production. */
const SQUAT_MOBILE = { label: 'mobile_squat', w: 390, h: 667 };
const DESKTOP = { label: 'desktop_1280', w: 1280, h: 800 };

async function captureInApp(browser, baseUrl, prefix, state, view) {
  const ctx = await browser.newContext({
    deviceScaleFactor: 3,
    viewport: { width: view.w, height: view.h },
  });
  const page = await ctx.newPage();
  await seed(page, state);
  await openCard(page, baseUrl);
  const geom = await page.evaluate(() => {
    const tm = document.querySelector('[data-testid="slot-tm"]');
    const chip = tm?.querySelector('img[src*="/sprites/moves/"]')?.parentElement;
    const r = tm?.getBoundingClientRect();
    const chipR = chip?.getBoundingClientRect();
    return {
      tmW: r?.width ?? 0,
      tmRight: r?.right ?? 0,
      chipRight: chipR?.right ?? 0,
      vw: window.innerWidth,
    };
  });
  if (view.w <= 500 && geom.tmW < 70) {
    throw new Error(`narrow TM cell at ${view.label}: tmW=${geom.tmW} vw=${geom.vw}`);
  }
  if (view.w <= 500 && geom.chipRight > geom.tmRight + 0.5) {
    throw new Error(
      `category clips TM cell at ${view.label}: chipRight=${geom.chipRight} tmRight=${geom.tmRight}`,
    );
  }
  await shot(page, `${prefix}_inapp_${view.label}`);
  await page.close();
  await ctx.close();
}

async function captureExport(browser, baseUrl, prefix, state) {
  const ctx = await browser.newContext({
    deviceScaleFactor: 3,
    viewport: { width: DESKTOP.w, height: DESKTOP.h },
  });
  const page = await ctx.newPage();
  await seed(page, state);
  await openCard(page, baseUrl);
  await openExport(page);
  await savePng(page, join(OUT, `${prefix}_export_png.png`));
  await savePng(page, join(ART, `${prefix}_export_png.png`));
  await shot(page, `${prefix}_export_overlay_${DESKTOP.label}`);
  await page.close();
  await ctx.close();
}

async function captureSet(browser, baseUrl, prefix, state = nimbusState()) {
  await captureInApp(browser, baseUrl, prefix, state, SQUAT_MOBILE);
  await captureInApp(browser, baseUrl, prefix, state, DESKTOP);
  await captureExport(browser, baseUrl, prefix, state);
}

async function captureSolo(browser, baseUrl, prefix) {
  const state = nimbusState({ partner: false });
  await captureInApp(browser, baseUrl, `${prefix}_solo`, state, SQUAT_MOBILE);
  await captureInApp(browser, baseUrl, `${prefix}_solo`, state, DESKTOP);
  await captureExport(browser, baseUrl, `${prefix}_solo`, state);
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
await captureSet(browser, 'http://127.0.0.1:4191', 'before');
await captureSolo(browser, 'http://127.0.0.1:4191', 'before');
await captureSet(browser, 'http://127.0.0.1:4190', 'after');
await captureSolo(browser, 'http://127.0.0.1:4190', 'after');
await captureSet(browser, 'http://127.0.0.1:4191', 'before_sabrina', sabrinaState());
await captureSet(browser, 'http://127.0.0.1:4190', 'after_sabrina', sabrinaState());
await browser.close();
basePreview.stop();
fixPreview.stop();
try { execSync(`git worktree remove ${WORKTREE} --force`); } catch { /* noop */ }
console.log('wrote stills to', OUT, 'and', ART);
