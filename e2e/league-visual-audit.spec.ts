import { expect, test, type Page } from '@playwright/test';
import { auditLayout } from './support/layoutAudit';
import { INK, discMark, phaseSweep, pillEnds } from './support/pixels';

/**
 * The gym card's small controls and badges, checked as painted.
 *
 * Two faults reached a phone that every DOM check was blind to: two reset
 * discs on one card whose arrows sat differently inside them, and a type
 * badge whose right end was cut flat. Both were rasterisation, not layout —
 * the boxes were where they should be and the pixels were not. So this spec
 * reads the bitmap, and it asks four things of it that never need a
 * baseline:
 *
 * 1. Every control is a circle, on screen.
 * 2. A mark sits near the middle of its disc.
 * 3. A mark stays put in its disc as the disc slides across a pixel. One
 *    control is moved through eight sub-pixel positions and its mark read
 *    at each; a glyph that rasterises the same at every position holds
 *    still, one that does not wanders. This is where the reset's arrow was
 *    found to move by up to a device pixel at scale 3 -- and, on a bare
 *    page with nothing else in play, so was every other one-sided glyph
 *    tried in its place, straight lines included, while the symmetric cross
 *    held to 0.003px. An asymmetric stroke's antialiasing shifts its
 *    apparent centre with its fractional origin; a symmetric one's cancels.
 *    That is Chrome, not the card, and this test measures it rather than
 *    proves it away: at scale 1 nothing wanders, and that is where it runs.
 * 4. A pill is round at both ends, and nothing in the TM or badge box is cut
 *    by a clipping ancestor.
 *
 * The sweep runs only at an integer device scale. At the mobile project's
 * 2.625 an element capture is resampled, and every control on the card --
 * the symmetric red cross included -- reads a pixel of wander that is the
 * capture's, not the paint's. Measured: the same cross reads 0.003px on a
 * bare page at scales 1, 2 and 3, and 0.6px on the card at 2.625.
 *
 * One dense card, seeded directly, so every kind of control is on screen at
 * once: red crosses on the slots and the cells, blue resets on three edited
 * lines, both powerup discs, and one type badge. The crosses over sprites
 * are the hard case for the measurement, and are kept on purpose.
 */

/** A card with every control on it. */
async function denseCard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const blank = {
      type: null, theme: '', lines: [], signatureSeat: null,
      tmMoveId: null, badgeName: '', legend: null, powerup: null,
    };
    const cards: unknown[] = Array.from({ length: 14 }, () => ({ ...blank }));
    cards[0] = {
      ...blank,
      type: 'grass',
      // Seat 1 runs to Venusaur, which has a Mega and a Gigantamax. Every
      // line's rows are set by hand, which is what draws a reset on it.
      lines: [
        { branch: [1, 2, 3], boundaries: [1, 3, 6] },
        { branch: [4, 5, 6], boundaries: [1, 12, 12] },
        { branch: [7, 8, 9], boundaries: [1, 12, 12] },
      ],
      powerups: { 10: [{ seat: 1, kind: 'mega' }], 11: [{ seat: 1, kind: 'dynamax' }] },
      signatureSeat: 1,
      signatureId: 3,
      partnerId: 6,
      tmMoveId: 312,
      badgeName: 'Rainbow',
      legends: [{ pokemonId: 144, seat: 2 }],
    };
    window.localStorage.setItem(
      'league-builder',
      JSON.stringify({ state: { name: 'Audit', cards }, version: 1 }),
    );
  });
  await page.goto('/pokemon-league-builder');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  // The pane track finishes moving, and the fit settles.
  await page.waitForTimeout(900);
}

/** Every small circular control the card draws. */
const CONTROLS = {
  remove: 'button[aria-label^="Remove"]',
  reset: 'button[aria-label*="evolution rows"]',
  powerup: 'button[data-powerup]',
} as const;

const DISCS = [
  // The reset over Bulbasaur's column, and the cross on the TM box, which
  // sits on the box's white and not on a sprite.
  { kind: 'reset', disc: INK.blue, mark: INK.whiteOnBlue, sweep: 'button[aria-label*="evolution rows"]' },
  { kind: 'remove', disc: INK.red, mark: INK.whiteOnRed, sweep: 'button[aria-label="Remove TM"]' },
] as const;

test.describe('the card paints its controls', () => {
  test.beforeEach(async ({ page }) => {
    await denseCard(page);
  });

  test('every control is round and on screen', async ({ page }) => {
    const seen: Record<string, number> = {};
    for (const [kind, selector] of Object.entries(CONTROLS)) {
      const buttons = page.locator(selector).filter({ visible: true });
      const n = await buttons.count();
      seen[kind] = n;
      for (let i = 0; i < n; i += 1) {
        const geo = await buttons.nth(i).evaluate((el) => {
          // The disc is the svg the control draws, or the span that is it.
          const disc = el.querySelector('svg') ?? el.querySelector('span');
          const r = (disc ?? el).getBoundingClientRect();
          return {
            label: el.getAttribute('aria-label') ?? el.getAttribute('data-powerup'),
            w: r.width, h: r.height,
            onScreen: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
          };
        });
        expect.soft(Math.abs(geo.w - geo.h), `${geo.label} is a circle, not an ellipse`).toBeLessThanOrEqual(0.6);
        expect.soft(geo.onScreen, `${geo.label} is wholly on screen`).toBe(true);
      }
    }
    expect(seen.remove, 'the seeded card draws its crosses').toBeGreaterThanOrEqual(4);
    expect(seen.reset, 'the seeded card draws its resets').toBeGreaterThanOrEqual(2);
    // Every powerup row offers both kinds to a seat that has the forms.
    expect(seen.powerup, 'the seeded card draws its powerups').toBeGreaterThanOrEqual(2);
  });

  for (const { kind, disc, mark, sweep } of DISCS) {
    test(`every ${kind} disc carries its mark near the centre`, async ({ page }, info) => {
      const scale = info.project.use.deviceScaleFactor ?? 1;
      test.skip(!Number.isInteger(scale), `element capture at a scale of ${scale} is resampled, and a symmetric cross reads pixels off centre`);
      const buttons = page.locator(CONTROLS[kind]).filter({ visible: true });
      const n = await buttons.count();
      expect(n, `the card draws a ${kind}`).toBeGreaterThan(0);
      for (let i = 0; i < n; i += 1) {
        const label = await buttons.nth(i).getAttribute('aria-label');
        // The disc's own svg, so the press box's surroundings stay out of it.
        const m = await discMark(page, buttons.nth(i).locator('svg'), disc, mark);
        expect(m.offset, `${label}: a mark was found in the disc`).not.toBeNull();
        // Within a seventh of the radius. A glyph with a head on one side
        // is allowed its fixed bias, and at scale 1 a seven-pixel disc's
        // extent is read to one antialiased pixel, which is a seventh of
        // it; a mark two pixels off is not. Soft, so every disc's number
        // is reported.
        const off = Math.hypot(m.offset!.box.dx, m.offset!.box.dy);
        expect.soft(off, `${label}: mark ${off.toFixed(2)}px from the disc's centre, radius ${m.disc.r}px`)
          .toBeLessThanOrEqual(m.disc.r * 0.15);
      }
    });

    test(`a ${kind} disc keeps its mark still as it crosses a pixel`, async ({ page }, info) => {
      const scale = info.project.use.deviceScaleFactor ?? 1;
      test.skip(!Number.isInteger(scale), `element capture at a scale of ${scale} is resampled, and reads wander the paint does not have`);
      const button = page.locator(sweep).filter({ visible: true }).first();
      const label = await button.getAttribute('aria-label');
      const result = await phaseSweep(page, button, disc, mark);
      // A quarter of a device pixel is the measurement's own noise on a
      // stroke; a glyph whose stroke re-rasterises with its origin wanders
      // by most of a pixel.
      expect(result.wander.max, `${label}: the mark wandered ${JSON.stringify(result.wander)} across ${JSON.stringify(result.offsets)}`)
        .toBeLessThanOrEqual(0.25);
    });
  }

  test('nothing in the TM or badge box is cut by a clipping ancestor', async ({ page }) => {
    for (const slot of ['slot-tm', 'slot-badge']) {
      const problems = await auditLayout(page, `[data-testid="${slot}"]`);
      expect(problems.filter((p) => p.kind === 'escapes-parent'), `${slot}: nothing escapes its box`).toEqual([]);
    }
  });
});

/**
 * The pill's own describe, because it is measured densely.
 *
 * On screen the pill is about 40px wide, so its corner radius is 4px. At one
 * device pixel per CSS pixel the whole ramp is three or four columns, and a
 * pixel of drift — the card is fitted to its pane, so any change in the
 * chrome rescales it — moves that count without changing the shape. The
 * mobile project already samples at 2.6x and reads the pill correctly; this
 * fixes the density for every project instead of leaving it to the device.
 * The thresholds are the ones the test has always used, in CSS pixels.
 */
const PILL_DSF = 4;

test.describe('the card paints its TM pill', () => {
  test.use({ deviceScaleFactor: PILL_DSF });
  test.beforeEach(async ({ page }) => {
    await denseCard(page);
  });

  test('the TM type badge is round at both ends', async ({ page }) => {
    const pill = page.locator('[data-testid="slot-tm"] svg[viewBox="0 0 200 40"]');
    await expect(pill).toBeVisible();
    const ends = await pillEnds(page, pill, INK.coloured);
    // Ink reaches both edges of its box, less a pixel of antialiasing.
    expect.soft(ends.inkWidth, `the pill paints its whole width: ink ${ends.inkWidth} of box ${ends.boxWidth}`)
      .toBeGreaterThanOrEqual(ends.boxWidth - 4 * PILL_DSF);
    // Both ends climb, and climb alike. A clipped end has no ramp and a
    // first column already most of the pill's height.
    expect.soft(ends.ramp.left, `the left end climbs: ${JSON.stringify(ends)}`).toBeGreaterThanOrEqual(2 * PILL_DSF);
    expect.soft(ends.ramp.right, `the right end climbs: ${JSON.stringify(ends)}`).toBeGreaterThanOrEqual(2 * PILL_DSF);
    expect.soft(Math.abs(ends.ramp.left - ends.ramp.right), `the two ends climb alike: ${JSON.stringify(ends)}`)
      .toBeLessThanOrEqual(2 * PILL_DSF);
    expect.soft(ends.tip.right, `the right tip is a sliver, not a wall: ${JSON.stringify(ends)}`).toBeLessThanOrEqual(0.7);
  });
});
