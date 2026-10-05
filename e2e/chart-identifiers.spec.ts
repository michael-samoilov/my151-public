import { test, expect, type Page } from '@playwright/test';
import { filledPicker, openStatsFlow, nativeImage, toggleStats } from './support/statsFrameEvidence';
import { seedDex, TUNE_URL } from './support/dexSeed';
import { observeChartPaint, paintedAxes } from './support/chartPaintEvidence';

test.setTimeout(120_000);
async function openPickerAnalytics(page: Page, lang = 'en') {
  await page.addInitScript(fills => localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills }, version: 3 })), filledPicker);
  await page.goto(`/favorite-pokemon-by-type?notme&lang=${lang}`);
  await page.locator('#favorites-tab-analytics').click();
  await expect(page.locator('[data-favorite-chart=type] svg').first()).toBeVisible();
}
async function svgEvidence(page: Page) {
  return page.locator('[data-favorite-chart]').evaluateAll(cards => cards.filter(card => card.getAttribute('data-favorite-chart') !== 'bst').map(card => {
    const svg = card.querySelector('svg')!;
    const axes = [...svg.querySelectorAll(':scope > line')].map(line => Number(line.getAttribute('x1')));
    const circles = [...svg.querySelectorAll('circle')].map(circle => ({
      title: (circle.closest('g')?.querySelector('title') ?? circle.closest('g')?.parentElement?.querySelector('title'))?.textContent,
      r: Number(circle.getAttribute('r')), cx: Number(circle.getAttribute('cx')),
    }));
    const texts = [...svg.querySelectorAll('text')].filter(text => !text.closest('[data-audit-clip]')).map(text => {
      const rect = text.getBoundingClientRect(), svgRect = svg.getBoundingClientRect();
      return { text: text.textContent, left: rect.left - svgRect.left, right: rect.right - svgRect.left, y: rect.top - svgRect.top };
    });
    return { chart: card.getAttribute('data-favorite-chart'), width: svg.getBoundingClientRect().width, axes, circles, texts };
  }));
}

test('fixed chart axes and equal-area standalone evolution dot survive sorting @viewport', async ({ page }, testInfo) => {
  await openPickerAnalytics(page);
  const evidence = await svgEvidence(page);
  expect(evidence).toHaveLength(4);
  for (const card of evidence) {
    expect(card.width).toBeCloseTo(evidence[0].width, 1);
    expect(card.axes).toHaveLength(2);
    card.axes.forEach((axis, index) => expect(axis).toBeCloseTo(evidence[0].axes[index], 1));
  }
  const circles = evidence.find(card => card.chart === 'evolution')!.circles;
  const standalone = circles.filter(circle => circle.title === 'No evo');
  expect(standalone).toHaveLength(1);
  const stages = circles.filter(circle => circle.title !== 'No evo');
  expect(stages.length).toBeGreaterThan(3);
  for (const circle of stages) expect(circle.r ** 2).toBeCloseTo(standalone[0].r ** 2, 2);
  const middleDots = stages.filter((_, index) => index % 3 === 1);
  for (const middle of middleDots) expect(middle.cx).toBeCloseTo(standalone[0].cx, 2);
  for (const dimension of ['type', 'color', 'shape', 'evolution']) {
    const card = page.locator(`[data-favorite-chart=${dimension}]`);
    await card.locator('svg > text').filter({ hasText: /^COUNT$/ }).click();
  }
  const sorted = await svgEvidence(page);
  sorted.forEach((card, index) => card.axes.forEach((axis, axisIndex) => expect(axis).toBeCloseTo(evidence[index].axes[axisIndex], 1)));
  await testInfo.attach('painted-chart-geometry', { body: JSON.stringify({ evidence, sorted }, null, 2), contentType: 'application/json' });
  await testInfo.attach('chart-screen', { body: await page.screenshot(), contentType: 'image/png' });
});

test('localized identifiers fit their fixed rail without touching chart bars @viewport', async ({ page }, testInfo) => {
  const evidence = [];
  for (const locale of ['en','de','es','fr','it','ja','ko','zh-Hans','zh-Hant']) {
    await openPickerAnalytics(page, locale);
    await page.evaluate(() => document.fonts.ready);
    const cards = await svgEvidence(page);
    for (const card of cards) {
      // Row identifiers precede the count axis; numeric values and chart headers do not.
      const rowLabels = card.texts.filter(text => text.y > 30 && text.left < card.axes[0] && !/^[-\d.,+]/.test(text.text ?? ''));
      for (const label of rowLabels) {
        expect(label.left, `${locale}/${card.chart}/${label.text} left`).toBeGreaterThanOrEqual(-.5);
        expect(label.right, `${locale}/${card.chart}/${label.text} rail`).toBeLessThan(card.axes[0]);
      }
      card.axes.forEach((axis, index) => expect(axis, `${locale}/${card.chart}`).toBeCloseTo(cards[0].axes[index], 1));
    }
    evidence.push({ locale, cards });
  }
  await testInfo.attach('nine-locale-chart-fit', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});

test('native detailed sheets use matching local axes and readable badge labels @viewport', async ({ page }, testInfo) => {
  const evidence = [];
  for (const tool of ['picker','dex'] as const) {
    await observeChartPaint(page);
    await openStatsFlow(page, tool);
    const plain = await nativeImage(page, tool);
    await toggleStats(page, tool);
    const detailed = await nativeImage(page, tool);
    const axes = await paintedAxes(page);
    const texts = await page.evaluate(() => (window as unknown as { frameTexts: { text: string; bounds: { left: number; right: number; top: number; bottom: number } }[] }).frameTexts);
    const labels = texts.filter(record => record.bounds.left > plain.width && record.text.length > 1).map(record => record.text);
    expect(labels).toContain('FIRE');
    if (tool === 'picker') {
      expect(labels).toContain('BROWN'); expect(labels).toContain('BIPED, TAIL');
      const circles = await page.evaluate(mainWidth => (window as unknown as { chartCircles: { x:number; y:number; r:number }[] }).chartCircles.filter(circle => circle.x > mainWidth && circle.r < 10), plain.width);
      expect(circles.length).toBeGreaterThanOrEqual(10);
      for (const circle of circles) expect(circle.r ** 2).toBeCloseTo(circles[0].r ** 2, 2);
    }
    else expect(labels).toContain('GEN I');
    // Each rendered butterfly ends with count/index vertical strokes sharing top/bottom.
    const pairs = axes.filter((line, index) => index % 2 === 0 && axes[index + 1] && Math.abs(line.points[0].y - axes[index + 1].points[0].y) < .1).map(line => {
      const index = axes.indexOf(line); return { count: line.points[0].x, index: axes[index + 1].points[0].x, y: line.points[0].y, width: line.width };
    });
    expect(pairs.length).toBeGreaterThanOrEqual(tool === 'picker' ? 4 : 2);
    // Pairs on the same source canvas are normalized by their chart column origin.
    const local = pairs.map(pair => ({ ...pair, distance: pair.index - pair.count }));
    local.forEach(pair => expect(pair.distance).toBeCloseTo(local[0].distance, 1));
    if (tool === 'picker') {
      const columns = local.map(pair => pair.count).sort((a,b) => a-b);
      expect(Math.abs(columns[0] - columns[1])).toBeLessThan(.1);
      expect(Math.abs(columns[2] - columns[3])).toBeLessThan(.1);
    } else local.forEach(pair => expect(pair.count).toBeCloseTo(local[0].count, 1));
    evidence.push({ tool, plain: { width: plain.width, height: plain.height, sha: plain.sha256 }, detailed: { width: detailed.width, height: detailed.height }, local, labels });
    await testInfo.attach(`${tool}-native-detail`, { body: Buffer.from(detailed.png, 'base64'), contentType: 'image/png' });
    await page.goto('/');
  }
  await testInfo.attach('actual-native-axes', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});


test('native localized badge ink stays within its painted pill @viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Native PNG dimensions are independent of viewport.');
  test.setTimeout(180_000);
  const evidence = [];
  for (const locale of ['en','de','es','fr','it','ja','ko','zh-Hans','zh-Hant']) {
    await observeChartPaint(page);
    await openStatsFlow(page, 'picker', locale);
    const plain = await nativeImage(page, 'picker');
    await toggleStats(page, 'picker');
    const detailed = await nativeImage(page, 'picker');
    const paint = await page.evaluate(({ mainWidth, outputWidth }) => {
      type Bounds = { width:number; left:number;right:number;top:number;bottom:number; text?:string };
      const target = window as unknown as { chartBadges:Bounds[]; chartBadgeTexts:Bounds[] };
      const badges = target.chartBadges.filter(item => item.width === outputWidth && item.left > mainWidth);
      const texts = target.chartBadgeTexts.filter(item => item.width === outputWidth && item.left > mainWidth);
      return { badges, texts };
    }, { mainWidth: plain.width, outputWidth: detailed.width });
    expect(paint.badges.length).toBeGreaterThan(30);
    expect(paint.texts.length).toBeGreaterThan(30);
    for (const text of paint.texts) {
      const badge = paint.badges.find(b => text.top >= b.top - .5 && text.bottom <= b.bottom + .5 && text.left >= b.left - .5 && text.right <= b.right + .5);
      expect(badge, `${locale}: ${text.text} painted outside pill`).toBeDefined();
      expect(text.right - text.left).toBeGreaterThan(2);
    }
    evidence.push({ locale, ...paint });
    await page.goto('/');
  }
  await testInfo.attach('native-nine-locale-pill-ink', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});


test('Dex type generation and shape charts share axes and pill identifiers @viewport', async ({ page }, testInfo) => {
  await page.goto(`${TUNE_URL}&notme&lang=en`);
  await seedDex(page);
  await page.locator('[data-nav=analytics]').click();
  await expect(page.getByRole('heading', { name: 'Generation Origin' })).toBeVisible();
  const evidence = await page.locator('svg').evaluateAll(svgs => svgs.flatMap(svg => {
    const header = [...svg.querySelectorAll(':scope > text')].find(text => ['TYPE','GEN','SHAPE'].includes(text.textContent ?? ''));
    const lines = [...svg.querySelectorAll(':scope > line')];
    if (!header || lines.length !== 2) return [];
    const badges = [...svg.querySelectorAll('rect')].filter(rect => Number(rect.getAttribute('width')) / Number(rect.getAttribute('height')) > 4.8);
    return [{ header:header.textContent, width:svg.getBoundingClientRect().width, axes:lines.map(line => Number(line.getAttribute('x1'))), badges:badges.length, genPills:svg.querySelectorAll('svg[data-gen]').length }];
  }));
  expect(evidence.map(card => card.header).sort()).toEqual(['GEN','SHAPE','TYPE']);
  for (const card of evidence) {
    expect(card.width).toBeCloseTo(evidence[0].width, 1);
    card.axes.forEach((axis,index) => expect(axis).toBeCloseTo(evidence[0].axes[index], 1));
    if (card.header === 'GEN') expect(card.genPills).toBe(9);
    else expect(card.badges).toBeGreaterThanOrEqual(card.header === 'TYPE' ? 18 : 14);
  }
  await testInfo.attach('dex-actual-axes-and-pill-shapes', { body:JSON.stringify(evidence,null,2), contentType:'application/json' });
});
