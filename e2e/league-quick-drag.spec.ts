import { expect, test, type Page } from '@playwright/test';
import { blankLeague } from './support/leagueSeed';

/**
 * A quick drag moves an evolution boundary, and the stage being moved shows.
 *
 * The card's touch sensor began a drag only after a 250ms hold, and it
 * sampled nothing before it began. So a flick that moved a Pokémon two rows
 * and lifted inside the hold never began a drag, and a flick that stopped
 * inside the hold began at the cell it started from, with the finger's real
 * position unknown until it moved again. Both are driven here with a real
 * touch, and each is checked against the store.
 *
 * While the drag is in flight, every cell of the moving stage wears a light
 * wash of the Pokémon's primary type -- the run is the thing being dragged,
 * not one cell of it -- and the wash goes with the finger.
 */

// A phone, tall enough for the card's cells to be a comfortable flick apart.
test.use({ viewport: { width: 393, height: 800 }, hasTouch: true, isMobile: true });

const openCard = async (page: Page) => {
  await blankLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(500);
};

const seatLine = async (page: Page, query: string) => {
  await page.click('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
  await page.evaluate((q) => {
    const inputs = [...document.querySelectorAll('input')];
    const el = inputs[inputs.length - 1];
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await page.waitForTimeout(800);
  await page.click('[data-testid="verify-evo-card"]');
  await page.waitForTimeout(700);
};

/** Seat 1's line as the store holds it. */
const line = (page: Page) =>
  page.evaluate(() => {
    const card = JSON.parse(window.localStorage.getItem('league-builder')!).state.cards[0];
    return card.lines[0] as { branch: number[]; boundaries: number[] };
  });

/** The cells wearing the stage wash, by row, seat and sprite. */
const washed = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-stage-tint]')].map((el) => {
      const [, , row, seat] = el.getAttribute('data-testid')!.split('-').map(Number);
      return {
        row,
        seat,
        alt: el.querySelector('img')?.getAttribute('alt') ?? null,
        tint: el.getAttribute('data-stage-tint'),
        painted: getComputedStyle(el).backgroundImage,
      };
    }),
  );

/**
 * A touch from one cell's centre to another's: three moves over ~90ms, so
 * the whole gesture fits inside the sensor's hold. `settle` is how long
 * the finger rests at the far end before it lifts, and `during` runs while
 * it rests.
 */
async function flick(
  page: Page,
  from: string,
  to: string,
  settle: number,
  during?: () => Promise<void>,
): Promise<void> {
  const a = (await page.locator(from).boundingBox())!;
  const b = (await page.locator(to).boundingBox())!;
  const x = a.x + a.width / 2;
  const y0 = a.y + a.height / 2;
  const y1 = b.y + b.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', ty: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y: ty, radiusX: 10, radiusY: 10, force: 1, id: 1 }],
    });
  await touch('touchStart', y0);
  for (let i = 1; i <= 3; i += 1) {
    await page.waitForTimeout(30);
    await touch('touchMove', y0 + ((y1 - y0) * i) / 3);
  }
  if (settle > 0) await page.waitForTimeout(settle);
  if (during) await during();
  await touch('touchEnd', y1);
  await page.waitForTimeout(300);
  await cdp.detach();
}

test.describe('a quick drag moves an evolution boundary', () => {
  /**
   * Seat Charmander and find the top row of its Charizard run. Charizard
   * arrives at level 36, which the level curve puts on row 6, so there are
   * rows above it to flick into; Charmeleon's run starts on row 2 and has
   * none.
   */
  const setUp = async (page: Page) => {
    await openCard(page);
    await seatLine(page, 'charmander');
    const before = await line(page);
    expect(before.branch, 'Charmander to Charizard').toEqual([4, 5, 6]);
    const top = before.boundaries[2];
    expect(top - 2, 'Charizard has two rows of room above it').toBeGreaterThan(before.boundaries[1]);
    return { before, top };
  };

  test('a flick that lifts inside the hold still lands', async ({ page }) => {
    const { before, top } = await setUp(page);
    await flick(page, `[data-testid="card-cell-${top}-1"]`, `[data-testid="card-cell-${top - 2}-1"]`, 0);
    const after = await line(page);
    expect(after.boundaries[2], `Charizard now starts two rows up: ${before.boundaries} -> ${after.boundaries}`).toBe(top - 2);
  });

  test('a flick that stops inside the hold lands where the finger stopped', async ({ page }) => {
    const { before, top } = await setUp(page);
    // The finger rests past the hold before it lifts: the drag begins in
    // the hold, and has to know where the finger already is.
    await flick(page, `[data-testid="card-cell-${top}-1"]`, `[data-testid="card-cell-${top - 2}-1"]`, 450);
    const after = await line(page);
    expect(after.boundaries[2], `Charizard now starts two rows up: ${before.boundaries} -> ${after.boundaries}`).toBe(top - 2);
  });

  test('the moving stage wears its type while it moves, and not after', async ({ page }) => {
    const { top } = await setUp(page);
    let inFlight: Awaited<ReturnType<typeof washed>> = [];
    let charizards = 0;
    await flick(page, `[data-testid="card-cell-${top}-1"]`, `[data-testid="card-cell-${top - 2}-1"]`, 250, async () => {
      inFlight = await washed(page);
      charizards = await page.evaluate(
        () => [...document.querySelectorAll('[data-testid^="card-cell-"][data-testid$="-1"] img')].filter((i) => i.getAttribute('alt') === 'charizard').length,
      );
    });
    expect(inFlight.length, 'the wash is on while the drag is in flight').toBeGreaterThan(0);
    // Every washed cell is a Charizard cell in seat 1, and every such cell
    // is washed: the run, whole, and nothing else.
    expect(inFlight.every((c) => c.seat === 1 && c.alt === 'charizard'), JSON.stringify(inFlight)).toBe(true);
    expect(inFlight.length, 'the whole run').toBe(charizards);
    // Charizard is Fire, and the wash is painted, not just declared.
    expect(inFlight[0].tint?.toLowerCase(), 'a light Fire wash').toMatch(/^#e62829/);
    expect(inFlight[0].painted, 'painted as a layer over the cell').toContain('linear-gradient');
    expect(await washed(page), 'and gone once the finger lifts').toEqual([]);
  });
});
