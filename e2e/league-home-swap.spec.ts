import { expect, test, type Page } from '@playwright/test';

/**
 * League home rows are unique trainer slots. Occupied drop swaps those two.
 * Empty drop moves one trainer. The tail never wraps into the pickup hole.
 */

const TYPES = [
  'electric', 'fire', 'water', 'grass', 'ghost', 'psychic',
  null,
  'ground', 'ice',
  null,
  'poison', 'dark', 'dragon', 'steel',
];
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F', '', 'G', 'H', '', 'I', 'J', 'K', 'L'];
const MONS = [25, 6, 9, 3, 94, 65, null, 76, 131, null, 89, 197, 149, 208];

type SeedCard = {
  type: string | null;
  theme: string;
  lines: { branch: number[]; boundaries: number[] }[];
  signatureSeat: null;
  tmMoveId: null;
  badgeName: string;
  legend: null;
  powerup: null;
  powerups: Record<string, never>;
  signatureId: null;
  partnerId: null;
  legends: [];
};

function leagueSeed() {
  const empty = (): SeedCard => ({
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
  });
  const cards = Array.from({ length: 14 }, empty);
  for (let i = 0; i < 14; i++) {
    const name = NAMES[i];
    const mon = MONS[i];
    if (!name || mon === null) continue;
    cards[i] = {
      ...empty(),
      type: TYPES[i],
      badgeName: name,
      lines: [{ branch: [mon], boundaries: [1] }],
    };
  }
  return JSON.stringify({ state: { name: 'SwapProof', cards }, version: 1 });
}

async function openSeeded(page: Page) {
  await page.addInitScript((raw) => {
    window.localStorage.setItem('league-builder', raw);
  }, leagueSeed());
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(400);
}

async function badges(page: Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('league-builder');
    const cards = raw ? JSON.parse(raw).state.cards : [];
    return cards.map((c: { badgeName?: string }) => c.badgeName ?? '');
  });
}

async function dragSlot(page: Page, from: number, to: number) {
  const src = page.locator(`[data-testid="league-slot-${from}"]`);
  const dst = page.locator(`[data-testid="league-slot-${to}"]`);
  await src.scrollIntoViewIfNeeded();
  const fb = (await src.boundingBox())!;
  await dst.scrollIntoViewIfNeeded();
  const tb = (await dst.boundingBox())!;
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 12 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test.describe('league home slot swap', () => {
  test('moves into an empty row and leaves everyone else', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'mouse drag');
    await openSeeded(page);
    await dragSlot(page, 5, 6);
    expect(await badges(page)).toEqual([
      'A', 'B', 'C', 'D', 'E', '', 'F', 'G', 'H', '', 'I', 'J', 'K', 'L',
    ]);
  });

  test('swaps adjacent occupied rows downward', async ({ page }) => {
    await openSeeded(page);
    await dragSlot(page, 4, 5);
    expect(await badges(page)).toEqual([
      'A', 'B', 'C', 'D', 'F', 'E', '', 'G', 'H', '', 'I', 'J', 'K', 'L',
    ]);
  });

  test('swaps adjacent occupied rows upward', async ({ page }) => {
    await openSeeded(page);
    await dragSlot(page, 5, 4);
    expect(await badges(page)).toEqual([
      'A', 'B', 'C', 'D', 'F', 'E', '', 'G', 'H', '', 'I', 'J', 'K', 'L',
    ]);
  });

  test('swaps distant occupied rows and leaves the rows between them', async ({ page }) => {
    await openSeeded(page);
    await dragSlot(page, 0, 5);
    expect(await badges(page)).toEqual([
      'F', 'B', 'C', 'D', 'E', 'A', '', 'G', 'H', '', 'I', 'J', 'K', 'L',
    ]);
  });

  test('swaps with the last row and does not wrap it into the hole', async ({ page }) => {
    await openSeeded(page);
    await dragSlot(page, 0, 13);
    expect(await badges(page)).toEqual([
      'L', 'B', 'C', 'D', 'E', 'F', '', 'G', 'H', '', 'I', 'J', 'K', 'A',
    ]);
  });

  test('does nothing when dropped on itself', async ({ page }) => {
    await openSeeded(page);
    await dragSlot(page, 0, 0);
    expect(await badges(page)).toEqual(NAMES);
  });

  test('swaps across gym and elite-four slots', async ({ page }) => {
    await openSeeded(page);
    await dragSlot(page, 7, 8);
    expect(await badges(page)).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F', '', 'H', 'G', '', 'I', 'J', 'K', 'L',
    ]);
  });

  test('does not pick up an empty row', async ({ page }) => {
    await openSeeded(page);
    const row = (await page.locator('[data-testid="league-slot-6"]').boundingBox())!;
    await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    expect(await page.locator('[data-drag-held]').count()).toBe(0);
    await page.mouse.up();
    expect(await badges(page)).toEqual(NAMES);
  });

  test('still opens an empty row on click', async ({ page }) => {
    await openSeeded(page);
    await page.click('[data-testid="league-slot-6"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
  });
});
