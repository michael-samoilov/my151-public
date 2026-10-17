import { expect, test, type Page } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';

async function expectMutualTabSet(page: Page) {
  const report = await page.evaluate(() => {
    const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent', '']);
    const list = document.querySelector('[data-testid="league-nav"]');
    const navs = [...document.querySelectorAll('[data-testid="league-nav"] [data-league-view]')] as HTMLElement[];
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    const parse = (css: string) => {
      const rgb = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
      return null;
    };
    const hex = primary.startsWith('#')
      ? (primary.length === 4 ? primary.slice(1).split('').map((c) => c + c).join('') : primary.slice(1))
      : null;
    const primaryRgb = hex
      ? [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
      : parse(primary);
    const near = (a: number[] | null, b: number[] | null) =>
      !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= 2);

    const selected = navs.filter((b) => b.getAttribute('aria-selected') === 'true');
    const active = selected[0] ?? navs[0];
    const others = navs.filter((b) => b !== active);
    const activeBg = active ? getComputedStyle(active).backgroundColor.trim() : '';
    const othersGhost = others.every((b) => TRANSPARENT.has(getComputedStyle(b).backgroundColor.trim()));
    const loneButton = othersGhost && near(parse(activeBg), primaryRgb);
    const heights = navs.map((b) => b.getBoundingClientRect().height);

    return {
      navCount: navs.length,
      inList: !!list && navs.every((n) => list.contains(n)),
      listHasTrack: !!list && !TRANSPARENT.has(getComputedStyle(list).backgroundColor.trim()),
      roles: navs.map((b) => b.getAttribute('role')),
      selectedCount: selected.length,
      selectedView: selected[0]?.getAttribute('data-league-view') ?? null,
      loneButton,
      heights,
      heightDelta: heights.length ? Math.max(...heights) - Math.min(...heights) : 0,
    };
  });

  expect(report.navCount, 'story and rematch tabs').toBe(2);
  expect(report.inList, 'every tab sits in one tablist').toBe(true);
  expect(report.listHasTrack, 'the tablist paints a shared track').toBe(true);
  expect(report.roles, 'each control is a tab').toEqual(['tab', 'tab']);
  expect(report.selectedCount, 'exactly one selected tab').toBe(1);
  expect(report.loneButton, 'active tab must not be a lone primary button').toBe(false);
  expect(report.heightDelta, `tab heights ${report.heights.join(',')}`).toBeLessThanOrEqual(1);
  return report;
}

async function teamCount(page: Page, slot: number) {
  return page.evaluate(
    (i) =>
      [...document.querySelectorAll(`[data-testid="league-slot-${i}"] img`)].filter((img) =>
        (img.getAttribute('src') ?? '').includes('/sprites/pokemon/'),
      ).length,
    slot,
  );
}

test('story/rematch tabs are a mutual set and switch the league summary', async ({ page }) => {
  test.setTimeout(60_000);
  await seededLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.waitForTimeout(700);

  for (const width of [390, 1280] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(200);

    const story = await expectMutualTabSet(page);
    expect(story.selectedView, 'story is the default').toBe('challenge');

    const gym1 = await teamCount(page, 0);
    expect(gym1, 'gym 1 fields a small team on the way through').toBeLessThan(6);

    await page.locator('[data-league-view="rematch"]:visible').first().click();
    await page.waitForTimeout(400);

    const rematch = await expectMutualTabSet(page);
    expect(rematch.selectedView, 'rematch is selected').toBe('rematch');
    expect(await teamCount(page, 0), 'the rematch fields the whole card').toBeGreaterThan(gym1);
    expect(
      await page.evaluate(() => JSON.parse(window.localStorage.getItem('league-builder')!).state.view),
      'and the choice is remembered',
    ).toBe('rematch');

    await page.locator('[data-league-view="challenge"]:visible').first().click();
    await page.waitForTimeout(400);
  }
});
