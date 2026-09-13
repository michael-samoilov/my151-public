/**
 * Before/after stills for gym card label fixes. Same blank-card input on base
 * and on the working tree.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_REF = 'origin/claude/pokedex-region-builder-AviYF';
const OUT = '/cursor/stores/bc-90921133-efcd-47c7-a250-292e78a355ed/media/gym-card-labels';
const ART = '/opt/cursor/artifacts';
const WORKTREE = '/tmp/my151-gym-labels-base';

async function seed(page) {
  await page.addInitScript(() => {
    const cards = Array.from({ length: 14 }, () => ({
      type: null,
      theme: '',
      lines: [],
      signatureSeat: null,
      tmMoveId: null,
      badgeName: '',
      legend: null,
      powerup: null,
    }));
    localStorage.setItem('league-builder', JSON.stringify({ state: { name: '', cards }, version: 1 }));
  });
}

async function openCard(page, baseUrl) {
  await page.goto(`${baseUrl}/custom-gym-leader`);
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
}

async function metrics(page) {
  return page.evaluate(() => {
    const partner = document.querySelector('[data-testid="slot-partner"]');
    const headLines = [...partner?.querySelectorAll('span.block') ?? []]
      .map((el) => el.textContent?.trim() ?? '')
      .filter((t) => t && t !== '\u00a0' && t.length > 1);
    const slot = partner?.parentElement?.getBoundingClientRect();
    const lineBoxes = headLines.map((t) => {
      const el = [...partner?.querySelectorAll('span.block') ?? []].find((n) => n.textContent?.trim() === t);
      const b = el?.getBoundingClientRect();
      return { t, past: b && slot ? b.right - slot.right : 0 };
    });
    const mark = (root, word) => {
      const el = root?.querySelector('[data-mark-label]')
        || [...root?.querySelectorAll('span') ?? []].find((s) => s.textContent?.trim() === word);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        lines: Math.round(b.height / (parseFloat(cs.fontSize) * 1.2 || 10)),
        nowrap: cs.whiteSpace,
        w: b.width,
        h: b.height,
      };
    };
    const badge = document.querySelector('[data-testid="slot-badge"]');
    const tm = document.querySelector('[data-testid="slot-tm"]');
    const pick = [...document.querySelectorAll('[data-testid="slot-tm"] span')].find((s) => s.textContent === 'Pick a move');
    const pickCs = pick ? getComputedStyle(pick) : null;
    const disc = document.querySelector('[data-testid="slot-tm"] svg')?.getBoundingClientRect().width;
    const shoulder = [...document.querySelectorAll('[data-testid="slot-partner"] span.block')].find((s) => s.textContent?.trim() === 'SHOULDERMON');
    const sb = shoulder?.getBoundingClientRect();
    return {
      partnerLines: headLines,
      partnerPast: lineBoxes,
      tm: mark(tm, 'TM'),
      badge: mark(badge, 'BADGE'),
      pick: pick ? { fontSize: pickCs.fontSize, nowrap: pickCs.whiteSpace } : null,
      discW: disc,
      shoulderPastSlot: sb && slot ? sb.bottom - slot.bottom : null,
    };
  });
}

async function captureSet(page, baseUrl, prefix) {
  await seed(page);
  await openCard(page, baseUrl);
  for (const [name, w] of [['mobile-390', 390], ['desktop-1280', 1280]]) {
    await page.setViewportSize({ width: w, height: Math.round(w * 1.8) });
    await page.waitForTimeout(400);
    const file = `${prefix}-${name}.png`;
    await page.screenshot({ path: join(OUT, file), fullPage: true });
    await page.screenshot({ path: join(ART, file), fullPage: true });
    if (prefix === 'after') {
      await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
      await page.screenshot({ path: join(ART, `${name}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await page.locator('[aria-label="Badge name"]').click();
  await page.keyboard.type('Thunder Cascade Marsh');
  await page.waitForTimeout(300);
  const caret = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Badge name"]');
    const sel = window.getSelection();
    const suffix = el?.querySelector('[data-badge-suffix]');
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    return {
      inSuffix: !!(suffix && range && suffix.contains(range.endContainer)),
      phrase: el?.parentElement?.textContent?.trim(),
    };
  });
  const caretFile = `${prefix}-mobile-badge-caret.png`;
  await page.screenshot({ path: join(OUT, caretFile), fullPage: true });
  await page.screenshot({ path: join(ART, caretFile), fullPage: true });
  if (prefix === 'after') {
    await page.screenshot({ path: join(OUT, 'mobile-badge-caret.png'), fullPage: true });
    await page.screenshot({ path: join(ART, 'mobile-badge-caret.png'), fullPage: true });
  }
  return { ...(await metrics(page)), caret };
}

function buildAndPreview(cwd, port) {
  execSync('npm run build', { cwd, stdio: 'inherit' });
  const child = execSync(`nohup npm run preview -- --host 127.0.0.1 --port ${port} > /tmp/preview-${port}.log 2>&1 & echo $!`, {
    cwd,
    encoding: 'utf8',
  }).trim();
  execSync(`while ! curl -sf http://127.0.0.1:${port}/ >/dev/null; do sleep 0.5; done`, { shell: '/bin/bash' });
  return {
    stop: () => {
      try { execSync(`kill ${child}`); } catch { /* noop */ }
    },
  };
}

await mkdir(OUT, { recursive: true });
execSync('git fetch origin claude/pokedex-region-builder-AviYF', { stdio: 'inherit' });
await rm(WORKTREE, { recursive: true, force: true });
execSync(`git worktree add ${WORKTREE} ${BASE_REF}`, { stdio: 'inherit' });
execSync('npm ci', { cwd: WORKTREE, stdio: 'inherit' });

const basePreview = buildAndPreview(WORKTREE, 4181);
const fixPreview = buildAndPreview('/workspace', 4180);

const browser = await chromium.launch();
const page = await browser.newPage();
const before = await captureSet(page, 'http://127.0.0.1:4181', 'before');
const after = await captureSet(page, 'http://127.0.0.1:4180', 'after');
await browser.close();
basePreview.stop();
fixPreview.stop();
execSync(`git worktree remove ${WORKTREE} --force`);

console.log(JSON.stringify({ before, after }, null, 2));

const ok =
  after.partnerLines.join('|') === 'PARTNER /|SHOULDERMON' &&
  !before.partnerLines.some((l) => l.includes('SHOUL') && l !== 'PARTNER /' && l !== 'SHOULDERMON') === false &&
  after.badge?.w > 18 &&
  after.tm?.w > 18 &&
  (after.discW ?? 99) < 22 &&
  (after.shoulderPastSlot ?? 99) <= -2 &&
  after.pick?.fontSize === '8px' &&
  before.pick?.fontSize !== '8px' &&
  !after.caret.inSuffix;

if (!ok) process.exit(1);
