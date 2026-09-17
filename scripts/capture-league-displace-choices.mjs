#!/usr/bin/env node
/**
 * Render REST + Playlist / Beads / Park choice grids. Does not change the engine.
 *
 *   BASE_URL=http://127.0.0.1:4183 node scripts/capture-league-displace-choices.mjs
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:4183').replace(/\/$/, '');
const STORE_DIR =
  process.env.STORE_DIR ||
  '/cursor/stores/bc-90921133-efcd-47c7-a250-292e78a355ed/media/pr-32-drag';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
const FRAME_W = 390;

const CHROMIUM_LAYOUTS = [
  ['chrome-linux', 'chrome'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
  ['chrome-win', 'chrome.exe'],
];

function resolveChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH || process.env.CHROMIUM_PATH;
  if (explicit) return explicit;
  const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (browsersRoot) {
    try {
      const stable = join(browsersRoot, 'chromium');
      if (existsSync(stable) && statSync(stable).isFile()) return stable;
      const revisions = readdirSync(browsersRoot)
        .map((d) => /^chromium-(\d+)$/.exec(d))
        .filter((m) => m !== null)
        .sort((a, b) => Number(b[1]) - Number(a[1]));
      for (const match of revisions) {
        for (const layout of CHROMIUM_LAYOUTS) {
          const bin = join(browsersRoot, match[0], ...layout);
          if (existsSync(bin)) return bin;
        }
      }
    } catch {
      /* fall through */
    }
  }
  for (const bin of ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome']) {
    if (existsSync(bin)) return bin;
  }
  return undefined;
}

function blank() {
  return {
    type: null,
    theme: '',
    lines: [],
    signatureSeat: null,
    tmMoveId: null,
    badgeName: '',
    legend: null,
    powerup: null,
    powerups: {},
    signatureId: null,
    partnerId: null,
    legends: [],
  };
}

function trainer(type, badgeName, mon) {
  return {
    ...blank(),
    type,
    badgeName,
    lines: [{ branch: [mon], boundaries: [1] }],
  };
}

function isEmpty(card) {
  return card.lines.length === 0 && !card.type && !card.theme && !card.badgeName;
}

function clone(card) {
  return JSON.parse(JSON.stringify(card));
}

function seedJson(name, cards) {
  return JSON.stringify({ state: { name, cards: cards.map(clone) }, version: 1 });
}

function arrayMove(cards, from, to) {
  const next = cards.map(clone);
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function beads(cards, from, to) {
  const filledAt = cards.map((_, i) => i).filter((i) => !isEmpty(cards[i]));
  const fromF = filledAt.indexOf(from);
  const toF = filledAt.indexOf(to);
  const packed = filledAt.map((i) => clone(cards[i]));
  const moved = arrayMove(packed, fromF, toF);
  const next = cards.map(clone);
  filledAt.forEach((slot, k) => {
    next[slot] = moved[k];
  });
  return next;
}

function park(cards, from, to) {
  const next = cards.map(clone);
  const moved = clone(cards[from]);
  let hole;
  if (to > from) {
    for (let i = to - 1; i > from; i--) {
      if (isEmpty(cards[i])) {
        hole = i;
        break;
      }
    }
  } else {
    for (let i = to + 1; i < from; i++) {
      if (isEmpty(cards[i])) {
        hole = i;
        break;
      }
    }
  }
  next[from] = blank();
  if (hole !== undefined) {
    next[hole] = moved;
    return next;
  }
  const occupant = clone(cards[to]);
  next[to] = moved;
  if (!isEmpty(occupant)) next[from] = occupant;
  return next;
}

const PIKACHU = trainer('electric', 'A', 25);
const CHARIZARD = trainer('fire', 'B', 6);
const BLASTOISE = trainer('water', 'C', 9);
const VENUSAUR = trainer('grass', 'D', 3);
const GENGAR = trainer('ghost', 'E', 94);
const ALAKAZAM = trainer('psychic', 'F', 65);
const GOLEM = trainer('rock', 'G', 76);
const DIGLETT = trainer('ground', 'H', 50);

function fourteen(filled) {
  const cards = Array.from({ length: 14 }, blank);
  for (let i = 0; i < filled.length; i++) cards[i] = filled[i] ? clone(filled[i]) : blank();
  return cards;
}

const SPARSE_REST = fourteen([PIKACHU, blank(), blank(), GENGAR, ALAKAZAM]);
const FULL_REST = fourteen([
  PIKACHU, CHARIZARD, BLASTOISE, VENUSAUR, GENGAR, ALAKAZAM, GOLEM, DIGLETT,
]);

const SEEDS = [
  {
    id: 'sparse',
    title: 'Sparse · pickup Gym 1 Pikachu · drop last filled (Gym 5)',
    rest: SPARSE_REST,
    from: 0,
    to: 4,
    cells: [
      { name: 'REST', sub: 'Gym 2–3 empty. Last filled = Gym 5 Alakazam. Red pickup, blue drop.' },
      { name: 'Playlist', sub: 'Empties have heft. Gengar and Alakazam slide up toward the hole.' },
      { name: 'Beads', sub: 'Holes stay. Filled keep order: Gengar to Gym 1, Pikachu to the drop slot.' },
      { name: 'Park', sub: 'Others stay. Pikachu occupies the last hole before the target (Gym 3).' },
    ],
  },
  {
    id: 'full',
    title: 'Full · pickup Gym 1 Pikachu · drop last filled (Gym 8)',
    rest: FULL_REST,
    from: 0,
    to: 7,
    cells: [
      { name: 'REST', sub: 'Gyms 1–8 filled. Last filled = Gym 8 Diglett. Red pickup, blue drop.' },
      { name: 'Playlist', sub: 'Array-move including every row. Gyms 2–8 slide up; Pikachu lands on Gym 8.' },
      { name: 'Beads', sub: 'Same as Playlist here: no holes in the filled run, so filled order is the list.' },
      { name: 'Park', sub: 'No hole before Gym 8, so Pikachu sits on Gym 8. Diglett takes vacant Gym 1. Gyms 2–7 stay.' },
    ],
  },
];

function resultsFor(seed) {
  return [
    seed.rest,
    arrayMove(seed.rest, seed.from, seed.to),
    beads(seed.rest, seed.from, seed.to),
    park(seed.rest, seed.from, seed.to),
  ];
}

function writeUnique(storeName, srcPath) {
  const storePath = join(STORE_DIR, storeName);
  const artifactName = storeName.replace(/-/g, '_');
  const artifactPath = join(ARTIFACT_DIR, artifactName);
  copyFileSync(srcPath, storePath);
  if (existsSync(artifactPath)) {
    throw new Error(`artifact exists, will not overwrite: ${artifactPath}`);
  }
  copyFileSync(srcPath, artifactPath);
  return artifactPath;
}

async function mark(page, from, to) {
  await page.evaluate(({ from: a, to: b }) => {
    for (let i = 0; i < 14; i++) {
      const el = document.querySelector(`[data-testid="league-slot-${i}"]`);
      if (!el) continue;
      el.style.outline = '';
      el.style.outlineOffset = '';
    }
    const pickup = document.querySelector(`[data-testid="league-slot-${a}"]`);
    const target = document.querySelector(`[data-testid="league-slot-${b}"]`);
    if (pickup) {
      pickup.style.outline = '3px solid #ef4444';
      pickup.style.outlineOffset = '-3px';
    }
    if (target && target !== pickup) {
      target.style.outline = '3px solid #2563eb';
      target.style.outlineOffset = '-3px';
    }
  }, { from, to });
}

async function shot(browser, cards, from, to, label) {
  const context = await browser.newContext({
    viewport: { width: FRAME_W, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript((raw) => {
    window.localStorage.setItem('league-builder', raw);
  }, seedJson(label, cards));
  await page.goto(`${BASE_URL}/custom-gym-leader`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-lg-viewport]')) {
      el.style.overflow = 'hidden';
      el.scrollTop = 0;
    }
  });
  await mark(page, from, to);
  const png = await page.screenshot({ type: 'png', fullPage: false });
  await context.close();
  return png;
}

async function stitch(browser, title, cells, pngs, tmpPath) {
  const cellW = 280;
  const figs = cells.map((c, i) => {
    const b64 = Buffer.from(pngs[i]).toString('base64');
    return `<figure style="margin:0;width:${cellW}px;background:#111">
      <div style="font:800 18px/1.2 ui-sans-serif,system-ui,sans-serif;color:#fff;padding:8px 8px 2px">${c.name}</div>
      <div style="font:600 12px/1.35 ui-sans-serif,system-ui,sans-serif;color:#fecaca;padding:0 8px 6px">${c.sub}</div>
      <img src="data:image/png;base64,${b64}" width="${cellW}" style="display:block;width:${cellW}px;height:auto">
    </figure>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
    <body style="margin:0;background:#111;width:max-content">
      <div style="font:700 16px/1.3 ui-sans-serif,system-ui,sans-serif;color:#fff;padding:10px 12px;background:#991b1b">
        ${title}
      </div>
      <div style="display:grid;grid-template-columns:repeat(2, ${cellW}px);gap:10px;padding:10px">${figs}</div>
    </body></html>`;
  const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
  await page.setContent(html, { waitUntil: 'load' });
  const size = await page.evaluate(() => ({
    w: Math.ceil(document.body.scrollWidth),
    h: Math.ceil(document.body.scrollHeight),
  }));
  if (size.w > 2000) throw new Error(`too wide ${size.w}`);
  if (size.h > 2200) throw new Error(`too tall ${size.h}`);
  await page.setViewportSize({ width: Math.max(size.w, 360), height: Math.max(size.h, 200) });
  await page.screenshot({ path: tmpPath, fullPage: true, type: 'png' });
  await page.close();
}

async function main() {
  mkdirSync(STORE_DIR, { recursive: true });
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const executablePath = resolveChromium();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const written = [];
  try {
    for (const seed of SEEDS) {
      console.log(seed.id);
      const boards = resultsFor(seed);
      const pngs = [];
      for (let i = 0; i < 4; i++) {
        pngs.push(await shot(browser, boards[i], seed.from, seed.to, seed.cells[i].name));
      }
      const tmp = join(STORE_DIR, `_pr32_pick_${seed.id}.png`);
      await stitch(browser, seed.title, seed.cells, pngs, tmp);
      written.push(writeUnique(`pr32_pick_${seed.id}.png`, tmp));
    }
  } finally {
    await browser.close();
  }
  for (const p of written) console.log(`wrote ${p}`);
}

await main();
