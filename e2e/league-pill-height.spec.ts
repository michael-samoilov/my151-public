import { expect, test } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

function measurePill({ selector }: { selector: string }) {
  const el = document.querySelector(selector) as HTMLElement;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const hits = (y: number) => document.elementFromPoint(x, y)?.closest('button') === el;
  let above = 0;
  while (above < 20 && hits(r.top - above - 0.5)) above += 1;
  let below = 0;
  while (below < 20 && hits(r.bottom + below + 0.5)) below += 1;
  return { height: r.height, target: r.height + above + below, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
}

test('the dex nav pill and the league toggle pill paint alike and press alike', { tag: '@viewport' }, async ({ page }) => {
  await page.goto('/pokedex-builder');
  await page.waitForSelector('[data-nav="builder"]');
  await page.waitForTimeout(300);
  const dex = await page.evaluate(measurePill, { selector: '[data-nav="builder"]' });

  await seededLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-league-view][aria-selected="true"]');
  await page.waitForTimeout(300);
  const league = await page.evaluate(measurePill, { selector: '[data-league-view][aria-selected="true"]' });

  expect(Math.abs(league.height - dex.height), `dex pill ${dex.height}px, league pill ${league.height}px`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(dex.height - 1.75 * dex.rem), 'the pill paints 1.75rem').toBeLessThanOrEqual(0.5);
  for (const [name, p] of [['dex', dex], ['league', league]] as const) {
    expect(p.target, `${name}: a ${p.height}px pill takes a press over ${p.target}px`).toBeGreaterThanOrEqual(2.75 * p.rem - 1);
  }
});
