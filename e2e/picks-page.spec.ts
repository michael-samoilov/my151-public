import { expect, test, type Page } from './support/test';
import { TYPE_NAMES } from '../src/types/pokemon';

async function openPicks(page: Page) {
  await page.route('**/api/event', (route) => route.fulfill({ status: 200, body: '{}' }));
  await page.goto('/?admin&demo');
  await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();
  await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'Dex', exact: true }).click();
  await page.getByRole('button', { name: /Most picked/ }).click();
  await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();
}

test.describe('admin picks page', () => {
  test('wraps sections in builder chrome and shows index bars', { tag: '@viewport' }, async ({ page }) => {
    await openPicks(page);

    const starters = page.locator('[data-section-id="starter"]');
    await expect(starters).toBeVisible();
    await expect(starters.getByText('Starters', { exact: true })).toBeVisible();
    await expect(starters.locator('[data-type="grass"]')).toBeVisible();
    await expect(starters.locator('[data-type="fire"]')).toBeVisible();
    await expect(starters.locator('[data-type="water"]')).toBeVisible();

    const meter = starters.locator('[data-index-meter]').first();
    await expect(meter).toBeVisible();
    const width = await meter.locator('[data-index-fill]').evaluate((el) => (el as HTMLElement).style.width);
    expect(width.endsWith('%')).toBe(true);
    expect(Number.parseFloat(width)).toBeGreaterThan(0);

    const box = await starters.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, labelAlign: getComputedStyle(el.firstElementChild as HTMLElement).textAlign };
    });
    expect(Number.parseFloat(box.radius)).toBeGreaterThan(0);
    expect(box.labelAlign).toBe('left');

    const faceIds = await starters.locator('[data-face-id]').evaluateAll((els) =>
      els.map((el) => Number(el.getAttribute('data-face-id'))),
    );
    expect(faceIds).toContain(1);
    expect(faceIds).not.toContain(2);
    expect(faceIds).not.toContain(3);
    expect(faceIds).not.toContain(6);

    await expect(starters.getByText('Most', { exact: true })).toHaveCount(0);
    await expect(starters.getByText('Least', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Most is over/)).toHaveCount(0);
    await expect(page.getByText(/1\.0× = random rate/)).toBeVisible();
    await expect(starters.locator('[data-picks-side="most"]').first()).toHaveAttribute(
      'data-picks-cols',
      '9',
    );
    const grassGrid = starters.locator('[data-picks-side="most"]').first().locator('.grid');
    await expect(grassGrid).toHaveCount(1);
    expect(await grassGrid.locator('[data-face-id]').count()).toBeGreaterThanOrEqual(9);
    const grassRow1 = await grassGrid.locator('[data-face-id]').evaluateAll((els) => {
      const ys = els.map((el) => Math.round(el.getBoundingClientRect().y));
      const first = ys[0];
      return ys.filter((y) => y === first).length;
    });
    expect(grassRow1).toBeGreaterThanOrEqual(9);

    const starterCell = starters.locator('[data-face-id]').first();
    const pairCell = page.locator('[data-section-id="early-bug"] [data-picks-side="most"] [data-face-id]').first();
    const starterW = await starterCell.evaluate((el) => el.getBoundingClientRect().width);
    const pairW = await pairCell.evaluate((el) => el.getBoundingClientRect().width);
    if (test.info().project.name === 'desktop') {
      expect(pairW).toBeGreaterThanOrEqual(starterW);
    }
    const pikaSection = page.locator('[data-section-id="pikachu-clone"]');
    await expect(pikaSection.getByText('Least', { exact: true })).toHaveCount(0);
    await expect(pikaSection.locator('[data-picks-layout="section-9"]')).toBeVisible();
    await expect(pikaSection.locator('[data-picks-side="most"]')).toHaveAttribute('data-picks-cols', '9');
    await expect(pikaSection.locator('[data-picks-side="least"]')).toHaveCount(0);
    const pikaTracks = await pikaSection.locator('[data-picks-side="most"] .grid').first().evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length,
    );
    expect(pikaTracks).toBe(9);

    const pikaMeter = page.locator('[data-section-id="pikachu-clone"] [data-face-id="25"] [data-index-meter]');
    const pichuMeter = page.locator('[data-section-id="pikachu-clone"] [data-face-id="172"] [data-index-meter]');
    await expect(pikaMeter).toBeVisible();
    await expect(pichuMeter).toBeVisible();
    const pikaX = await pikaMeter.getAttribute('data-index-meter');
    const pichuX = await pichuMeter.getAttribute('data-index-meter');
    expect(pichuX).toBeTruthy();
    expect(pikaX).toBeTruthy();
    expect(pichuX).not.toBe(pikaX);
    const mostOrder = await page
      .locator('[data-section-id="pikachu-clone"] [data-picks-side="most"] [data-face-id]')
      .evaluateAll((els) =>
        els
          .map((el) => ({
            id: Number(el.getAttribute('data-face-id')),
            x: Math.round(el.getBoundingClientRect().x),
            y: Math.round(el.getBoundingClientRect().y),
          }))
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((f) => f.id),
      );
    const pikaAt = mostOrder.indexOf(25);
    const pichuAt = mostOrder.indexOf(172);
    expect(pikaAt).toBeGreaterThanOrEqual(0);
    expect(pichuAt).toBeGreaterThanOrEqual(0);
    expect(pikaAt).toBeLessThan(pichuAt);
    expect(mostOrder.length).toBeGreaterThan(3);

    await expect.poll(async () =>
      starters.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);

    const other = page.locator('[data-section-id="other"]');
    await expect(other).toBeVisible();
    await expect(other.getByText('Least', { exact: true })).toHaveCount(0);
    const lastId = await page.locator('[data-section-id]').last().getAttribute('data-section-id');
    expect(lastId).toBe('other');
    const otherZero = await other.locator('[data-index-meter="0×"]').count();
    expect(otherZero).toBe(0);
  });

  test('off-section tab keeps chrome, omits least, and shows counts', async ({ page }) => {
    await openPicks(page);
    await page.getByRole('button', { name: 'Off-section' }).click();
    const evil = page.locator('[data-section-id="evil-team"]');
    await expect(evil).toBeVisible();
    await expect(evil.getByText('Evil Team', { exact: true })).toBeVisible();
    await expect(evil.locator('[data-index-meter]').first()).toBeVisible();
    await expect(evil.locator('[data-picks-side="least"]')).toHaveCount(0);
    await expect(evil.getByText('Least', { exact: true })).toHaveCount(0);
    const shown = await evil.locator('[data-index-meter]').first().getAttribute('data-index-meter');
    expect(shown).toBeTruthy();
    expect(shown).not.toMatch(/×$/);

    const starters = page.locator('[data-section-id="starter"]');
    await expect(starters).toBeVisible();
    await expect(starters.locator('[data-type="grass"]')).toHaveCount(0);
    await expect(starters.locator('[data-type="fire"]')).toHaveCount(0);
    await expect(starters.locator('[data-type="water"]')).toHaveCount(0);
    const faceIds = await starters.locator('[data-face-id]').evaluateAll((els) =>
      els.map((el) => Number(el.getAttribute('data-face-id'))),
    );
    expect(faceIds).toContain(172);
    expect(faceIds).toContain(25);

    const expectedCols = 9;
    await expect(starters.locator('[data-picks-side="most"]')).toHaveAttribute(
      'data-picks-cols',
      String(expectedCols),
    );
    const gridCols = await starters.locator('[data-picks-side="most"] .grid').first().evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length,
    );
    expect(gridCols).toBe(expectedCols);
    await expect(evil.locator('[data-picks-side="most"]')).toHaveAttribute('data-picks-cols', '9');
    const evilTracks = await evil.locator('[data-picks-side="most"] .grid').first().evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length,
    );
    expect(evilTracks).toBe(9);
    const evilFirstRow = await evil
      .locator('[data-picks-side="most"] > div > .grid')
      .first()
      .locator('[data-face-id]')
      .count();
    const evilTotal = await evil.locator('[data-picks-side="most"] [data-face-id]').count();
    expect(evilFirstRow).toBe(Math.min(9, evilTotal));
  });

  test('off-section includes one-offs until Exclude one-offs is on', async ({ page }) => {
    await openPicks(page);
    await page.getByRole('button', { name: 'Off-section' }).click();
    const chip = page.getByRole('button', { name: 'Exclude one-offs' });
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    const evil = page.locator('[data-section-id="evil-team"]');
    await expect(evil.locator('[data-face-id="4"]')).toHaveCount(1);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(evil.locator('[data-face-id="4"]')).toHaveCount(0);
    await expect(evil.locator('[data-face-id="129"]')).toHaveCount(1);
  });

  test('league tab opens league picks: aces, then gym types by gym count, in league counts', async ({ page }, testInfo) => {
    await page.route('**/api/event', (route) => route.fulfill({ status: 200, body: '{}' }));
    await page.goto('/?admin&demo');
    await page.getByRole('navigation', { name: 'Admin section' }).getByRole('button', { name: 'League', exact: true }).click();
    await page.getByRole('button', { name: /Most picked/ }).click();
    await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();

    const sections = await page.locator('[data-section-id]').evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-section-id') ?? '',
        heading: el.firstElementChild?.textContent ?? '',
        counts: [...el.querySelectorAll('[data-index-meter]')].map((m) => m.getAttribute('data-index-meter')),
      })),
    );
    const ids = sections.map((s) => s.id);
    expect(ids[0]).toBe('ace');
    expect(ids).toContain('none');
    expect(sections[0].heading).toBe('Ace Pokémon');
    const typed = sections.slice(1).map((s) => {
      const match = /^(.+) \((\d+)\)$/.exec(s.heading);
      expect(match, s.heading).not.toBeNull();
      return { id: s.id, gyms: Number(match?.[2]) };
    });
    const typeOrder: string[] = [...TYPE_NAMES, 'none'];
    const byGyms = [...typed].sort((a, b) => b.gyms - a.gyms || typeOrder.indexOf(a.id) - typeOrder.indexOf(b.id));
    expect(typed.map((t) => t.id)).toEqual(byGyms.map((t) => t.id));
    expect(typed.map((t) => t.id)).not.toEqual(typeOrder.filter((t) => ids.includes(t)));
    for (const s of sections) {
      expect(s.counts.length).toBeGreaterThan(0);
      for (const c of s.counts) expect(c).toMatch(/^[1-9]\d*$/);
      const n = s.counts.map(Number);
      expect(n).toEqual([...n].sort((a, b) => b - a));
    }
    await expect(page.locator('[data-section-id="fire"] [data-picks-side="most"]')).toHaveAttribute('data-picks-cols', '9');
    await testInfo.attach('league-picks-sections', { body: JSON.stringify(sections), contentType: 'application/json' });
  });
});
