import { expect, test, type Page } from '@playwright/test';

function paneBounds(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('[data-testid="favorites-grid-scroll"]')!;
    const frame = scroller.getBoundingClientRect();
    const head = parseFloat(scroller.style.getPropertyValue('--head'));
    const left = frame.left + scroller.clientLeft;
    const top = frame.top + scroller.clientTop;
    const pane = document.querySelector('[data-testid="favorites-picker"]')!.getBoundingClientRect();
    return {
      body: { left: left + head, top: top + head, right: left + scroller.clientWidth, bottom: top + scroller.clientHeight },
      pane: { left: pane.left, top: pane.top, right: pane.right, bottom: pane.bottom },
    };
  });
}

test('desktop picker opens next to its cell inside the visible grid body', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/favorite-pokemon-picker.html');
  const table = page.getByTestId('favorites-grid-scroll');
  const baseWidth = await table.evaluate((el) => el.getBoundingClientRect().width);
  const measured: Record<string, Awaited<ReturnType<typeof paneBounds>>> = {};
  const checkBounds = async (label: string, expectedWidth?: number) => {
    const bounds = await paneBounds(page);
    measured[label] = bounds;
    expect(bounds.pane.left).toBeGreaterThanOrEqual(bounds.body.left - 1);
    expect(bounds.pane.right).toBeLessThanOrEqual(bounds.body.right + 1);
    expect(bounds.pane.top).toBeGreaterThanOrEqual(bounds.body.top - 1);
    expect(bounds.pane.bottom).toBeLessThanOrEqual(bounds.body.bottom + 1);
    if (expectedWidth != null) {
      expect(await table.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(expectedWidth, 0);
    }
    return bounds.pane.right - bounds.pane.left;
  };

  await page.getByTestId('favorites-cell-normal-1').click();
  const denseWidth = await checkBounds('normal-1', baseWidth);
  await page.keyboard.press('Escape');
  await page.getByTestId('favorites-cell-legendary-1').click();
  const sparseWidth = await checkBounds('legendary-1', baseWidth);
  expect(sparseWidth).toBeLessThan(denseWidth);
  await page.keyboard.press('Escape');
  await page.getByTestId('favorites-cell-favorite-9').click();
  await checkBounds('favorite-9', baseWidth);
  await page.keyboard.press('Escape');

  await page.getByTestId('favorites-cell-dragon-2').click();
  await checkBounds('dragon-2', baseWidth);
  const header = await page.getByTestId('favorites-picker').evaluate((pane) => {
    const title = pane.querySelector('[data-testid="favorites-picker-title"]')!.getBoundingClientRect();
    const toggle = pane.querySelector('[data-testid="favorites-type-toggle"]')!.getBoundingClientRect();
    return { gap: Math.round(toggle.left - title.right), rightInset: Math.round(pane.getBoundingClientRect().right - toggle.right) };
  });
  expect(header.gap).toBeGreaterThanOrEqual(8);
  expect(header.rightInset).toBeGreaterThanOrEqual(8);
  await page.keyboard.press('Escape');

  const frame = (await table.boundingBox())!;
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.keyboard.down('Control');
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -50);
  await page.keyboard.up('Control');
  await expect(table).toHaveAttribute('data-zoom', '2.5');
  await table.evaluate((el) => { el.scrollLeft = 900; el.scrollTop = 700; });
  const cell = page.getByTestId('favorites-cell-dragon-9');
  await cell.click();
  await checkBounds('dragon-9 zoomed', baseWidth);
  const [c, p] = await Promise.all([cell.boundingBox(), page.getByTestId('favorites-picker').boundingBox()]);
  const gapX = Math.max(p!.x - (c!.x + c!.width), c!.x - (p!.x + p!.width));
  const gapY = Math.max(p!.y - (c!.y + c!.height), c!.y - (p!.y + p!.height));
  expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(7);
  expect(Math.max(gapX, gapY)).toBeLessThan(9);
  await page.setViewportSize({ width: 1050, height: 620 });
  await expect.poll(async () => {
    const { pane, body } = await paneBounds(page);
    return pane.right <= body.right + 1 && pane.bottom <= body.bottom + 1;
  }).toBe(true);
  await checkBounds('dragon-9 resized');
  await testInfo.attach('pane-bounds.json', { body: JSON.stringify({ measured, header }, null, 2), contentType: 'application/json' });
});

test('desktop pane switches grid cells and closes on Escape or outside clicks', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/favorite-pokemon-picker');
  const picker = page.getByTestId('favorites-picker');
  const state = async () => ({
    open: await picker.count(),
    rings: await page.getByTestId('favorites-focus-ring').count(),
    closeIcons: await picker.getByRole('button', { name: 'Close picker' }).count(),
  });
  const steps: Record<string, Awaited<ReturnType<typeof state>>> = {};

  await page.getByTestId('favorites-cell-ice-4').click();
  await expect(picker).toBeVisible();
  steps.opened = await state();
  await page.getByTestId('favorites-type-toggle').click();
  steps.toggled = await state();
  await page.getByTestId('favorites-cell-water-1').click();
  steps.otherCell = await state();
  await expect(page.getByTestId('favorites-pick-7')).toBeVisible();
  steps.reopened = await state();
  await page.getByTestId('favorites-cell-water-1').click();
  steps.selectedCell = await state();
  await page.getByTestId('favorites-cell-ice-4').click();
  await expect(picker).toBeVisible();
  await page.locator('h1').click();
  steps.outsideGrid = await state();
  // platform: An open Radix tooltip handles Escape first and prevents its default.
  await page.getByTestId('favorites-cell-ice-4').click();
  await expect(picker).toBeVisible();
  await page.evaluate(() => document.addEventListener('keydown', (event) => event.preventDefault(), { capture: true }));
  await page.keyboard.press('Escape');
  steps.escape = await state();

  await testInfo.attach('dismiss-steps.json', { body: JSON.stringify(steps, null, 2), contentType: 'application/json' });
  expect(steps).toEqual({
    opened: { open: 1, rings: 1, closeIcons: 0 },
    toggled: { open: 1, rings: 1, closeIcons: 0 },
    otherCell: { open: 1, rings: 1, closeIcons: 0 },
    reopened: { open: 1, rings: 1, closeIcons: 0 },
    selectedCell: { open: 0, rings: 0, closeIcons: 0 },
    outsideGrid: { open: 0, rings: 0, closeIcons: 0 },
    escape: { open: 0, rings: 0, closeIcons: 0 },
  });
});

test('desktop pane scrolls and zooms with its cell, under the sticky headers', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/favorite-pokemon-picker');
  await page.getByTestId('favorites-cell-ice-4').click();
  const picker = page.getByTestId('favorites-picker');
  await expect(picker).toBeVisible();
  const atOpen = await paneBounds(page);

  const scrolled = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="favorites-grid-scroll"]')!;
    const pane = document.querySelector('[data-testid="favorites-picker"]')!;
    const cell = document.querySelector('[data-testid="favorites-cell-ice-4"]')!;
    const frame = el.getBoundingClientRect();
    const head = parseFloat(el.style.getPropertyValue('--head'));
    const offset = () => {
      const p = pane.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      return { x: Math.round(p.left - c.left), y: Math.round(p.top - c.top) };
    };
    const before = offset();
    el.scrollTop += pane.getBoundingClientRect().top - (frame.top + head / 4);
    const after = offset();
    const box = pane.getBoundingClientRect();
    const probe = { x: box.left + box.width / 2, y: frame.top + head / 2 };
    const target = document.elementFromPoint(probe.x, probe.y);
    return {
      before,
      after,
      probeInPane: probe.y > box.top && probe.y < box.bottom,
      headerOnTop: !target?.closest('[data-testid="favorites-picker"]'),
    };
  });

  await page.getByTestId('favorites-grid-scroll').evaluate((el) => { el.scrollTop = 0; });
  const box = (await picker.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20);
  const start = await page.getByTestId('favorites-grid-scroll').evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop, page: window.scrollY }));
  await page.mouse.wheel(240, 0);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.getByTestId('favorites-grid-scroll').evaluate((el) => el.scrollLeft > 100 && el.scrollTop > 50)).toBe(true);
  const wheeled = await page.getByTestId('favorites-grid-scroll').evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop, page: window.scrollY }));

  const zoomed = await page.evaluate(async () => {
    const el = document.querySelector<HTMLElement>('[data-testid="favorites-grid-scroll"]')!;
    const pane = document.querySelector('[data-testid="favorites-picker"]')!;
    const cell = document.querySelector('[data-testid="favorites-cell-ice-4"]')!;
    const gap = () => {
      const p = pane.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      return { y: Math.round(Math.max(p.top - c.bottom, c.top - p.bottom)), x: Math.round(p.left - c.left) };
    };
    const before = gap();
    const frame = el.getBoundingClientRect();
    el.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -50, clientX: frame.left + 300, clientY: frame.top + 300, bubbles: true, cancelable: true }));
    for (let i = 0; i < 50 && el.dataset.zoom === '1'; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return { zoom: Number(el.dataset.zoom), before, after: gap() };
  });

  await page.screenshot({ path: testInfo.outputPath('pane-zoomed.png') });
  await testInfo.attach('pane-tracking.json', {
    body: JSON.stringify({ atOpen, scrolled, start, wheeled, zoomed }, null, 2),
    contentType: 'application/json',
  });
  expect(atOpen.pane.top).toBeGreaterThanOrEqual(atOpen.body.top - 1);
  expect(atOpen.pane.left).toBeGreaterThanOrEqual(atOpen.body.left - 1);
  expect(scrolled.after).toEqual(scrolled.before);
  expect(scrolled.probeInPane).toBe(true);
  expect(scrolled.headerOnTop).toBe(true);
  expect(wheeled.page).toBe(start.page);
  expect(zoomed.zoom).toBeGreaterThan(1);
  expect(zoomed.after).toEqual(zoomed.before);
  expect(zoomed.before.y).toBeGreaterThanOrEqual(7);
  expect(zoomed.before.y).toBeLessThan(11);
});

test('desktop minimap shows on hover, and dragging its window scrolls the grid', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/favorite-pokemon-picker');
  const scroll = page.getByTestId('favorites-grid-scroll');
  const map = page.getByTestId('favorites-minimap');
  const opacity = () => map.evaluate((el) => Number(getComputedStyle(el).opacity));
  const offsets = () => scroll.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  const mapBox = (await map.boundingBox())!;
  const center = { x: mapBox.x + mapBox.width / 2, y: mapBox.y + mapBox.height / 2 };

  const under = await page.evaluate(({ x, y }) => {
    const cell = document.elementFromPoint(x, y)?.closest('button[data-testid^="favorites-cell-"]');
    return cell?.getAttribute('data-testid') ?? '';
  }, center);
  await page.mouse.move(20, 20);
  await page.mouse.click(center.x, center.y);
  const quickClick = { under, ring: await page.locator(`[data-testid="${under}"] [data-testid="favorites-focus-ring"]`).count() };

  await page.mouse.move(mapBox.x + 4, mapBox.y + 4);
  await page.waitForTimeout(600);
  const hover = await opacity();
  const view = (await page.getByTestId('favorites-minimap-viewport').boundingBox())!;
  const before = await offsets();
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  await page.mouse.down();
  await page.mouse.move(view.x + view.width / 2 + 40, view.y + view.height / 2 + 20, { steps: 5 });
  await page.waitForTimeout(600);
  const dragging = await opacity();
  await page.mouse.up();
  const after = await offsets();
  const paneOpen = await page.getByTestId('favorites-picker').count();
  const moved = (await page.getByTestId('favorites-minimap-viewport').boundingBox())!;
  await page.screenshot({ path: testInfo.outputPath('minimap-drag.png') });

  await page.mouse.move(mapBox.x - 300, mapBox.y - 300);
  await expect.poll(opacity, { timeout: 2000, intervals: [50, 100] }).toBe(0);
  const idle = await opacity();

  const result = { quickClick, hover, dragging, idle, before, after, paneOpen, window: { before: view, after: moved } };
  await testInfo.attach('minimap-drag.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(quickClick.under).not.toBe('');
  expect(quickClick.ring).toBe(1);
  expect(hover).toBe(1);
  expect(dragging).toBe(1);
  expect(idle).toBe(0);
  expect(paneOpen).toBe(1);
  expect(after.left - before.left).toBeGreaterThan(300);
  expect(after.top - before.top).toBeGreaterThan(150);
  expect(Math.abs(moved.x - view.x - 40)).toBeLessThan(3);
  expect(Math.abs(moved.y - view.y - 20)).toBeLessThan(3);
});

test('icon toggle starts off and persists across pickers and reloads', async ({ page }, testInfo) => {
  const saved = () => page.evaluate(() => localStorage.getItem('personal-151-favorites-show-icons-v2'));
  await page.goto('/favorite-pokemon-picker.html');
  await page.getByTestId('favorites-cell-fire-1').click();
  let toggle = page.getByTestId('favorites-type-toggle');
  await expect(toggle).toHaveAccessibleName('Icons');
  await expect(toggle).toHaveText('Icons', { useInnerText: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('favorites-type-icon')).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveText('Icons', { useInnerText: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await saved()).toBe('1');
  await page.keyboard.press('Escape');
  await page.getByTestId('favorites-cell-legendary-1').click();
  toggle = page.getByTestId('favorites-type-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByTestId('favorites-type-icon').count()).toBeGreaterThan(0);
  await page.reload();
  await page.getByTestId('favorites-cell-legendary-1').click();
  toggle = page.getByTestId('favorites-type-toggle');
  await expect(toggle).toHaveAccessibleName('Icons');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('favorites-type-icon')).toHaveCount(0);
  expect(await saved()).toBe('0');
  await testInfo.attach('icon-toggle.json', { body: JSON.stringify({ action: await toggle.innerText(), pressed: await toggle.getAttribute('aria-pressed'), persisted: await saved(), visibleIcons: await page.getByTestId('favorites-type-icon').count() }), contentType: 'application/json' });
});
