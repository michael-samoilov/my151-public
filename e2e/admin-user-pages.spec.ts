import { expect, test } from '@playwright/test';

/**
 * Admin user-detail pages, driven through `/?admin&demo` so the production
 * bundle is the thing under test and no live token is required.
 *
 * League must fit the viewport (no page scroll). Demo user 70cd carries a
 * count-only drop-then-restore phantom; tidy must hide it so the scrubber
 * has 3 sessions, not 4. Dex may scroll inside its pane. The Dex / League
 * toggle is always present; a tool the browser never used is greyed.
 */

async function openDemo(page: import('@playwright/test').Page) {
  await page.goto('/?admin&demo');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

function userTools(page: import('@playwright/test').Page) {
  return page.getByRole('group', { name: "This browser's tools" });
}

function userCard(page: import('@playwright/test').Page, cidPrefix: string) {
  return page.getByRole('link', { name: new RegExp(`Open user ${cidPrefix}`) });
}

test.describe('admin user pages', () => {
  test('league visits fit the viewport and hide a count-only phantom dip', async ({ page }, info) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'League' }).click();
    await userCard(page, '70cd').click();
    await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();

    const scrub = page.getByRole('slider', { name: 'Scrub sessions' });
    await expect(scrub).toBeVisible();
    await expect(scrub).toHaveAttribute('max', '2');

    await scrub.fill('0');
    const first = await scrub.getAttribute('aria-valuetext');
    await scrub.fill('2');
    const last = await scrub.getAttribute('aria-valuetext');
    expect(first).toBeTruthy();
    expect(last).toBeTruthy();
    expect(first).not.toEqual(last);

    const chipText = () =>
      page.evaluate(() =>
        (document.querySelector('[data-testid="session-playhead-count"]')?.parentElement?.innerText ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    const restChip = await chipText();
    await page.evaluate(() => {
      const board = document.querySelector('[data-testid="league-visit-board"]');
      (document.documentElement as HTMLElement & { __keepBoard?: Element | null }).__keepBoard = board;
    });
    await scrub.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = '0';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.getByTestId('league-uncaptured')).toBeVisible();
    await expect(page.getByTestId('league-visit-board')).toBeHidden();
    expect(await page.getByTestId('league-visit-board').count()).toBe(1);
    const input0 = await page.evaluate(() => {
      const board = document.querySelector('[data-testid="league-visit-board"]');
      const keep = (document.documentElement as HTMLElement & { __keepBoard?: Element | null }).__keepBoard;
      const vis = document.querySelector('[data-session-board]:not([hidden])');
      return {
        sameNode: keep != null && keep === board,
        tiles: board?.querySelectorAll('[data-member-id]').length ?? 0,
        hidden: board instanceof HTMLElement ? board.hidden : false,
        visTiles: vis?.querySelectorAll('[data-member-id]').length ?? 0,
        sessionBoards: document.querySelectorAll('[data-session-board]').length,
      };
    });
    expect(input0.sameNode).toBe(true);
    expect(input0.hidden).toBe(true);
    expect(input0.tiles).toBeGreaterThan(0);
    expect(input0.visTiles).toBe(0);
    expect(input0.sessionBoards).toBeGreaterThan(0);
    const input0Chip = await chipText();
    expect(input0Chip).not.toEqual(restChip);
    await scrub.fill('0');
    expect(await chipText()).toBe(input0Chip);
    await expect(page.getByTestId('league-uncaptured')).toBeVisible();
    await expect(page.getByTestId('league-visit-board')).toBeHidden();

    await scrub.fill('1');
    await expect(page.getByTestId('league-visit-board')).toBeVisible();
    await expect(page.getByTestId('league-uncaptured')).toBeHidden();
    const mid = await page.evaluate(() => {
      const board = document.querySelector('[data-testid="league-visit-board"]');
      const keep = (document.documentElement as HTMLElement & { __keepBoard?: Element | null }).__keepBoard;
      const vis = document.querySelector('[data-session-board]:not([hidden])');
      const visTiles = [...(vis?.querySelectorAll('[data-member-id]') ?? [])];
      return {
        sameNode: keep != null && keep === board,
        tiles: board?.querySelectorAll('[data-member-id]').length ?? 0,
        visTiles: visTiles.length,
        visFaded: visTiles.filter((n) => (n as HTMLElement).style.opacity === '0.14').length,
        slots: vis?.querySelectorAll('[data-testid^="admin-slot-"]').length ?? 0,
        gyms: vis?.querySelectorAll('[data-testid="admin-gym-card"]').length ?? 0,
      };
    });
    expect(mid.sameNode).toBe(true);
    expect(mid.tiles).toBe(input0.tiles);
    expect(mid.visTiles).toBeGreaterThan(0);
    expect(mid.visFaded).toBe(0);

    await scrub.fill('2');
    await expect(page.getByTestId('league-visit-board')).toBeVisible();
    const end = await page.evaluate(() => {
      const board = document.querySelector('[data-testid="league-visit-board"]');
      const keep = (document.documentElement as HTMLElement & { __keepBoard?: Element | null }).__keepBoard;
      const vis = document.querySelector('[data-session-board]:not([hidden])');
      const visTiles = [...(vis?.querySelectorAll('[data-member-id]') ?? [])];
      return {
        sameNode: keep != null && keep === board,
        tiles: board?.querySelectorAll('[data-member-id]').length ?? 0,
        visTiles: visTiles.length,
        visFaded: visTiles.filter((n) => (n as HTMLElement).style.opacity === '0.14').length,
        gyms: [...(vis?.querySelectorAll('[data-testid="admin-gym-card"]') ?? [])].filter((n) =>
          n.querySelector('[data-member-id]'),
        ).length,
      };
    });
    expect(end.sameNode).toBe(true);
    expect(end.tiles).toBe(mid.tiles);
    expect(end.visTiles).toBeGreaterThan(0);
    expect(end.visFaded).toBe(0);
    expect(end.visTiles).not.toBe(mid.visTiles);
    if (info.project.name !== 'desktop') {
      expect(mid.slots).toBe(14);
    } else {
      expect(end.gyms).toBe(14);
    }

    if (info.project.name !== 'desktop') {
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return { scrollH: de.scrollHeight, innerH: window.innerHeight };
      });
      expect(overflow.scrollH).toBeLessThanOrEqual(overflow.innerH + 2);

      const box = await scrub.boundingBox();
      const vh = page.viewportSize()?.height ?? 0;
      expect(box).toBeTruthy();
      expect(box!.y).toBeGreaterThan(vh * 0.55);

      const gap = await page.evaluate(() => {
        const dock = document.querySelector('[data-testid="session-scrubber-dock"]')?.getBoundingClientRect();
        const nav = document.querySelector('nav[aria-label="Admin section"]')?.getBoundingClientRect();
        if (!dock || !nav) return 999;
        return nav.top - dock.bottom;
      });
      expect(gap).toBeGreaterThanOrEqual(-2);
      expect(gap).toBeLessThan(6);

      const vis = page.locator('[data-session-board]:not([hidden])');
      const gym = await vis.getByTestId('admin-slot-0').boundingBox();
      const champ = await vis.getByTestId('admin-slot-12').boundingBox();
      const boss = await vis.getByTestId('admin-slot-13').boundingBox();
      const navBox = await page.getByRole('navigation', { name: 'Admin section' }).boundingBox();
      expect(gym && champ && boss && navBox).toBeTruthy();
      expect(champ!.y + champ!.height).toBeLessThanOrEqual(navBox!.y + 2);
      expect(boss!.y + boss!.height).toBeLessThanOrEqual(navBox!.y + 2);
      expect(champ!.width).toBeGreaterThan(gym!.width * 1.2);
      expect(Math.abs(champ!.width - boss!.width)).toBeLessThan(4);
    } else {
      const board = page.getByTestId('league-visit-board');
      const vis = page.locator('[data-session-board]:not([hidden])');
      await expect(board).toBeVisible();
      await expect(vis.locator('[data-cols]')).toHaveAttribute('data-cols', /^(7|14)$/);
      await expect(vis.getByTestId('admin-gym-card')).toHaveCount(14);
      const first = vis.getByTestId('admin-gym-card').first();
      const late = first.locator('[data-row="10"], [data-row="11"]');
      await expect(late.first()).toBeVisible();
      await expect(first.getByTestId('admin-gym-stage-row')).toBeVisible();
      await expect(first.getByTestId('admin-gym-stage-row')).toHaveAttribute('data-span', '2');
      const washRgb = await first.getByTestId('admin-gym-stage-row').evaluate((el) => {
        const bg = getComputedStyle(el).backgroundColor;
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return null;
        return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
      });
      expect(washRgb).toBeTruthy();
      expect((washRgb!.r + washRgb!.g + washRgb!.b) / 3).toBeGreaterThan(200);
      await expect(first.getByTestId('admin-gym-stage-badge')).toBeVisible();
      const washBox = await first.getByTestId('admin-gym-stage-row').boundingBox();
      const badgeBox = await first.getByTestId('admin-gym-stage-badge').boundingBox();
      const cardBox = await first.boundingBox();
      expect(washBox && badgeBox && cardBox).toBeTruthy();
      expect(washBox!.width).toBeLessThan(cardBox!.width * 0.45);
      expect(washBox!.x).toBeGreaterThan(badgeBox!.x + badgeBox!.width - 1);
      expect(cardBox!.x + cardBox!.width - (washBox!.x + washBox!.width)).toBeLessThan(8);
      const champ = vis.getByTestId('admin-gym-card').nth(12);
      await expect(champ.getByTestId('admin-gym-stage-row')).toHaveAttribute('data-span', '6');
      const champWash = await champ.getByTestId('admin-gym-stage-row').boundingBox();
      const champBox = await champ.boundingBox();
      expect(champWash && champBox).toBeTruthy();
      expect(champWash!.width).toBeGreaterThan(champBox!.width * 0.85);
      const row1 = await first.locator('[data-row="1"]').first().boundingBox();
      expect(row1 && cardBox).toBeTruthy();
      expect(row1!.x).toBeGreaterThan(cardBox!.x + cardBox!.width * 0.4);
      const rail = await page.getByRole('slider', { name: 'Scrub sessions' }).boundingBox();
      const tabW = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Admin section"]');
        const buttons = [...(nav?.querySelectorAll('button') ?? [])];
        if (buttons.length === 0) return 0;
        const a = buttons[0].getBoundingClientRect();
        const b = buttons[buttons.length - 1].getBoundingClientRect();
        return b.right - a.left;
      });
      expect(rail).toBeTruthy();
      expect(Math.abs(rail!.width - tabW)).toBeLessThan(80);
      const chips = page.getByTestId('admin-rail-chip');
      await expect(chips).toHaveCount(2);
      const leftChip = await chips.nth(0).boundingBox();
      const rightChip = await chips.nth(1).boundingBox();
      expect(leftChip && rightChip && rail).toBeTruthy();
      expect(Math.abs(leftChip!.width - rightChip!.width)).toBeLessThan(2);
      expect(rail!.x - (leftChip!.x + leftChip!.width)).toBeGreaterThan(4);
      expect(rail!.x - (leftChip!.x + leftChip!.width)).toBeLessThan(20);
      expect(rightChip!.x - (rail!.x + rail!.width)).toBeGreaterThan(4);
      expect(rightChip!.x - (rail!.x + rail!.width)).toBeLessThan(20);
      const thumb = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Scrub sessions"]') as HTMLInputElement | null;
        const dots = [...document.querySelectorAll('[data-testid="admin-scrub-dot"]')];
        if (!input || dots.length === 0) return null;
        const r = input.getBoundingClientRect();
        const min = Number(input.min);
        const max = Number(input.max);
        const val = Number(input.value);
        const thumbPx = 22;
        const cx = r.x + thumbPx / 2 + ((val - min) / Math.max(1, max - min)) * (r.width - thumbPx);
        const last = dots[dots.length - 1].getBoundingClientRect();
        return { cx, last: last.x + last.width / 2 };
      });
      expect(thumb).toBeTruthy();
      expect(Math.abs(thumb!.cx - thumb!.last)).toBeLessThan(3);
      const last = await vis.getByTestId('admin-gym-card').nth(13).boundingBox();
      const vh = page.viewportSize()?.height ?? 0;
      expect(last).toBeTruthy();
      expect(last!.y + last!.height).toBeLessThanOrEqual(vh);
    }
  });

  test('dex builds shows a timeline and a snapshot', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Dex' }).click();
    await userCard(page, '74d5').click();
    await expect(page.getByRole('button', { name: '‹ Back' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Scrub sessions' })).toBeVisible();
    await expect(page.getByText(/of 151/)).toBeVisible();
    await expect(userTools(page).getByRole('button', { name: 'Dex' })).toHaveAttribute('aria-pressed', 'true');

    const snap = page.getByTestId('admin-dex-snapshot');
    await expect(snap).toBeVisible();
    await expect(page.getByTestId('admin-dex-uncaptured')).toBeVisible();
    const rest = await page.evaluate(() => {
      const occupancy = (testId: string) => {
        const root = document.querySelector(`[data-testid="${testId}"]`);
        const first = root?.querySelector('[data-dex-id]') ?? null;
        (root as HTMLElement & { __keep?: Element | null }).__keep = first;
        const faded = [...(root?.querySelectorAll('[data-dex-id]') ?? [])].filter(
          (n) => (n as HTMLElement).style.opacity === '0.14',
        ).length;
        return {
          tiles: root?.querySelectorAll('[data-dex-id]').length ?? 0,
          faded,
          keep: !!first,
          count: root?.getAttribute('data-count'),
        };
      };
      return { grid: occupancy('admin-dex-snapshot'), off: occupancy('admin-dex-uncaptured') };
    });
    expect(rest.grid.keep).toBe(true);
    expect(rest.grid.tiles).toBeGreaterThan(0);
    expect(rest.off.keep).toBe(true);
    expect(rest.off.tiles).toBeGreaterThan(0);

    const scrub = page.getByRole('slider', { name: 'Scrub sessions' });
    await scrub.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = '0';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const dragged = await page.evaluate(() => {
      const occupancy = (testId: string) => {
        const root = document.querySelector(`[data-testid="${testId}"]`);
        const keep = (root as HTMLElement & { __keep?: Element | null } | null)?.__keep;
        const now = root?.querySelector('[data-dex-id]') ?? null;
        const faded = [...(root?.querySelectorAll('[data-dex-id]') ?? [])].filter(
          (n) => (n as HTMLElement).style.opacity === '0.14',
        ).length;
        return {
          sameNode: keep != null && keep === now,
          faded,
          tiles: root?.querySelectorAll('[data-dex-id]').length ?? 0,
          count: root?.getAttribute('data-count'),
        };
      };
      return { grid: occupancy('admin-dex-snapshot'), off: occupancy('admin-dex-uncaptured') };
    });
    expect(dragged.grid.sameNode).toBe(true);
    expect(dragged.grid.faded).toBeGreaterThan(rest.grid.faded);
    expect(dragged.off.sameNode).toBe(true);
    expect(dragged.off.tiles).toBe(rest.off.tiles);
    expect(dragged.off.count).toBe(String(rest.off.tiles));
    expect(dragged.off.faded).toBeGreaterThan(rest.off.faded);
  });

  test('a user page toggles between dex and league', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'League' }).click();
    await userCard(page, '70cd').click();
    const tools = userTools(page);
    await expect(tools.getByRole('button', { name: 'League' })).toHaveAttribute('aria-pressed', 'true');
    await expect(tools.getByRole('button', { name: 'Dex' })).toBeEnabled();
    await tools.getByRole('button', { name: 'Dex' }).click();
    await expect(page.getByText(/of 151/)).toBeVisible();
    await expect(tools.getByRole('button', { name: 'Dex' })).toHaveAttribute('aria-pressed', 'true');
    await tools.getByRole('button', { name: 'League' }).click();
    await expect(page.getByRole('slider', { name: 'Scrub sessions' })).toHaveAttribute('max', '2');
  });

  test('an unused tool stays visible and is not pressable', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'League' }).click();
    await userCard(page, '9d19').click();
    const tools = userTools(page);
    await expect(tools.getByRole('button', { name: 'League' })).toBeEnabled();
    await expect(tools.getByRole('button', { name: 'Dex' })).toBeDisabled();
  });
});
