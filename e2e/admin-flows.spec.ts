import { openAdmin } from './admin-ready';
import { expect, test, type Locator } from './support/test';
import { buildDashboard } from '../api/_dashboard';

test.describe('admin flows', () => {
  test.beforeEach(async ({ page }) => {
    await openAdmin(page, '/?admin&demo');
    await expect(page.getByRole('heading', { name: /Analytics/ })).toBeVisible();
  });

  test('usage percentages are painted beneath counts with explicit populations', { tag: '@viewport' }, async ({ page }, info) => {
    await page.addInitScript(() => {
      const fill = CanvasRenderingContext2D.prototype.fillText;
      const stroke = CanvasRenderingContext2D.prototype.strokeText;
      type FlowCanvas = HTMLCanvasElement & { flowText?: { text: string; x: number; y: number; visible: boolean }[]; flowStrokes?: number };
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        const canvas = this.canvas as FlowCanvas;
        if (/usage funnel/.test(canvas.closest('[role="img"]')?.getAttribute('aria-label') ?? '')) {
          const m = this.getTransform();
          const px = m.a * x + m.c * y + m.e;
          const py = m.b * x + m.d * y + m.f;
          (canvas.flowText ??= []).push({ text, x: px, y: py, visible: px >= 0 && px <= canvas.width && py >= 0 && py <= canvas.height });
        }
        return maxWidth === undefined ? fill.call(this, text, x, y) : fill.call(this, text, x, y, maxWidth);
      };
      CanvasRenderingContext2D.prototype.strokeText = function (text, x, y, maxWidth) {
        const canvas = this.canvas as FlowCanvas;
        if (/usage funnel/.test(canvas.closest('[role="img"]')?.getAttribute('aria-label') ?? '')) canvas.flowStrokes = (canvas.flowStrokes ?? 0) + 1;
        return maxWidth === undefined ? stroke.call(this, text, x, y) : stroke.call(this, text, x, y, maxWidth);
      };
    });
    await page.reload();
    const measurements = [];
    for (const [tab, chartName] of [['Dex', 'Dex'], ['League', 'League'], ['Picker', 'Favorite Pokémon']]) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      const chart = page.getByRole('img', { name: new RegExp(`${chartName} usage funnel`) });
      await expect(chart.locator('canvas')).toBeVisible();
      const label = await chart.getAttribute('aria-label') ?? '';
      expect(label, 'usage percentages round to whole points').not.toMatch(/\d+\.\d+%/);
      expect(label).toMatch(/Bounced: [\d.]+% of entrants/);
      expect(label).toMatch(/Exported: [\d.]+% of non-bouncers/);
      expect(label).toMatch(/(?:Completed|Full league): [\d.]+% of non-bouncers/);
      if (tab === 'League') expect(label).not.toContain('filled a gym');
      if (tab !== 'Dex') expect(label).toMatch(/% of exported browsers/);
      const percentages = [...label.matchAll(/: ([\d.]+%) of /g)].map((m) => m[1]);
      for (const percentage of percentages) await expect.poll(async () => chart.locator('canvas').evaluate((canvas) =>
        ((canvas as HTMLCanvasElement & { flowText?: { text: string; visible: boolean }[] }).flowText ?? []).filter((p) => p.visible).map((p) => p.text).join('|'),
      )).toContain(percentage);
      const graph = await chart.evaluate((el) => {
        type Rect = { x: number; y: number; width: number; height: number; clone(): Rect; applyTransform(matrix: number[]): void };
        type Glyph = { type: string; style?: { text?: string; fill?: string }; getBoundingRect(): Rect; getComputedTransform(): number[] | undefined };
        type Chart = { getZr(): { storage: { getDisplayList(update: boolean): Glyph[] } }; getModel(): { getSeriesByIndex(index: number): { getGraph(): {
          nodes: { id: string; getLayout(): { y: number; value: number } }[];
          edges: { node1: { id: string }; node2: { id: string } }[];
        } } } };
        type Hook = { memoizedState: unknown; next: Hook | null };
        type Fiber = { memoizedState: Hook | null; return: Fiber | null };
        const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))!;
        let fiber = (el as unknown as Record<string, Fiber>)[key];
        let instance: Chart | undefined;
        for (let i = 0; fiber && i < 30 && !instance; i++, fiber = fiber.return!) {
          for (let hook = fiber.memoizedState; hook && !instance; hook = hook.next) {
            const current = (hook.memoizedState as { current?: Chart } | null)?.current;
            if (current && typeof current.getModel === 'function') instance = current;
          }
        }
        if (!instance) throw new Error('Rendered usage chart instance missing');
        const glyphs = instance.getZr().storage.getDisplayList(true).filter((g) => g.type === 'tspan' && g.style?.fill !== 'transparent' && !!(g.style?.text ?? '').trim()).map((g) => {
          const rect = g.getBoundingRect().clone(), transform = g.getComputedTransform();
          if (transform) rect.applyTransform(transform);
          return { text: g.style!.text!, rect };
        });
        for (const rate of glyphs.filter((g) => /^\d+%?$/.test(g.text))) for (const other of glyphs.filter((g) => g !== rate)) {
          const a = rate.rect, b = other.rect;
          if (Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5) {
            throw new Error(`Usage rate/count labels overlap: ${rate.text}/${other.text}`);
          }
        }
        const graph = instance.getModel().getSeriesByIndex(0).getGraph();
        return {
          nodes: graph.nodes.map((n) => ({ name: n.id, ...n.getLayout() })),
          links: graph.edges.map((e) => ({ source: e.node1.id, target: e.node2.id })),
        };
      });
      if (tab === 'League') {
        expect(graph.nodes.map((n) => n.name)).not.toContain('One gym full');
        expect(graph.links.filter((l) => /gyms|Full league|Card not finished/.test(l.target)).every((l) => l.source === 'Placed a Pokémon')).toBe(true);
      }
      if (tab !== 'Dex') {
        const varieties = tab === 'League' ? ['League export', 'Gym export', 'Both exported'] : ['Full grid', 'Simplified', 'Both exported'];
        expect(graph.links.filter((l) => varieties.includes(l.target)).every((l) => l.source === 'Exported')).toBe(true);
        const privateNode = graph.nodes.find((n) => /Kept private|Not exported/.test(n.name));
        if (privateNode) expect(graph.nodes.find((n) => n.name === 'Exported')!.y).toBeGreaterThan(privateNode.y);
      }
      const paint = await chart.locator('canvas').evaluate((canvas) => ({
        text: (canvas as HTMLCanvasElement & { flowText?: unknown[] }).flowText,
        strokes: (canvas as HTMLCanvasElement & { flowStrokes?: number }).flowStrokes ?? 0,
      }));
      if (tab === 'Picker') expect(paint.strokes, 'Picker text has no painted outline').toBe(0);
      measurements.push({ tab, label, percentages, graph, paint });
      await info.attach(`${tab.toLowerCase()}-percentage-screen`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
    await info.attach('usage-percentage-populations', { body: JSON.stringify(measurements), contentType: 'application/json' });
  });

  test('crowded export labels remain finite when every completed browser exports', { tag: '@viewport' }, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const fixture = buildDashboard({ clients: {}, archived: [], funnel: {}, funnelWindow: null, leagueClients: {} }, { range: 'all' }, Date.now());
    fixture.leagueFunnel = {
      opened: 120, placed: 100, bounced: 20, oneGymFull: 80, cardNotFinished: 20,
      gymBuckets: ['1–4 gyms', '5–8 gyms', '9–12 gyms', 'Full league'].map((label) => ({
        label, count: 20, exports: { league: 7, both: 7, card: 6 },
      })),
      fullLeague: 20, exports: { league: 28, both: 28, card: 24 }, keptPrivate: 0,
    };
    await page.route('**/api/submissions**', (route) => route.fulfill({ json: fixture }));
    await page.evaluate(() => localStorage.setItem('p151-admin-token', 'e2e'));
    await openAdmin(page, '/?admin');
    await page.getByRole('button', { name: 'League', exact: true }).click();
    const funnel = page.getByRole('img', { name: /League usage funnel/ });
    await expect(funnel.locator('canvas')).toBeVisible();
    const annotations = await funnel.evaluate((el) => {
      type Glyph = { type: string; style?: { text?: string }; getBoundingRect(): { x: number; y: number; width: number; height: number; clone(): ReturnType<Glyph['getBoundingRect']>; applyTransform(matrix: number[]): void }; getComputedTransform(): number[] | undefined };
      type Chart = { getWidth(): number; getHeight(): number; getModel(): { getSeriesByIndex(i: number): { getGraph(): { nodes: { id: string; getGraphicEl(): { getTextContent(): Glyph } }[] } } } };
      type Hook = { memoizedState: unknown; next: Hook | null };
      type Fiber = { memoizedState: Hook | null; return: Fiber | null };
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))!;
      let fiber = (el as unknown as Record<string, Fiber>)[key], instance: Chart | undefined;
      for (let i = 0; fiber && i < 30 && !instance; i++, fiber = fiber.return!) for (let hook = fiber.memoizedState; hook && !instance; hook = hook.next) {
        const current = (hook.memoizedState as { current?: Chart } | null)?.current;
        if (current && typeof current.getModel === 'function') instance = current;
      }
      if (!instance) throw new Error('Rendered export chart missing');
      return instance.getModel().getSeriesByIndex(0).getGraph().nodes.filter((n) => /^(League export|Gym export|Both exported)$/.test(n.id)).map((n) => {
        const g = n.getGraphicEl().getTextContent();
        const r = g.getBoundingRect().clone(), matrix = g.getComputedTransform();
        if (matrix) r.applyTransform(matrix);
        return { text: g.style!.text!, finite: [r.x, r.y, r.width, r.height].every(Number.isFinite), inside: r.x >= 0 && r.y >= 0 && r.x + r.width <= instance!.getWidth() && r.y + r.height <= instance!.getHeight() };
      });
    });
    expect(annotations).toHaveLength(3);
    expect(annotations.every((a) => a.finite && a.inside), JSON.stringify(annotations)).toBe(true);
  });

  test('dex usage funnel peels incomplete builds by size', async ({ page }) => {
    const funnel = page.getByRole('img', { name: /Dex usage funnel/ });
    await expect(funnel).toBeVisible();
    const label = await funnel.getAttribute('aria-label');
    expect(label).toContain('1–30');
    expect(label).toContain('31–60');
    expect(label).toContain('61–90');
    expect(label).toContain('91–120');
    expect(label).toContain('121–150');
  });

  test('picker flows include every progress stage and exclusive export outcomes', async ({ page }, info) => {
    await page.getByRole('button', { name: 'Picker', exact: true }).click();
    const funnel = page.getByRole('img', { name: /Favorite Pokémon usage funnel/ });
    await expect(funnel).toBeVisible();
    await expect(funnel.locator('canvas')).toBeVisible();
    const label = await funnel.getAttribute('aria-label');
    for (const stage of ['bounced', 'placed a Pokémon', '1–64 cells', '65–128 cells', '129–192 cells', '193–256 cells', 'completed']) {
      expect(label).toContain(stage);
    }
    expect(label).toMatch(/full grid only.*simplified only.*both exported.*not exported/);
    await info.attach('picker-flow-stages', { body: JSON.stringify({ label }), contentType: 'application/json' });
  });

  test('picker flow fits every viewport without sideways pan', { tag: '@viewport' }, async ({ page }, info) => {
    await page.getByRole('button', { name: 'Picker', exact: true }).click();
    const funnel = page.getByRole('img', { name: /Favorite Pokémon usage funnel/ });
    await expect(funnel.locator('canvas')).toBeVisible();
    await expectNoSidewaysPan(funnel);
    if (info.project.name !== 'desktop') await expectFitsPhoneHeight(funnel);
    await info.attach('picker-flow-viewport', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });

  test('referrer flow keeps an unknown-referrer source', async ({ page }) => {
    await page.getByRole('button', { name: 'Referrer → landing' }).click();
    const chart = page.getByRole('img', { name: /Referrer to landing/ });
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute('aria-label', /referrer not known/);
    await expect(chart).toHaveAttribute('aria-label', /favorites/);
  });

  test('league tab shows a gym-leader usage funnel', async ({ page }) => {
    await page.getByRole('button', { name: 'League', exact: true }).click();
    const funnel = page.getByRole('img', { name: /League usage funnel/ });
    await expect(funnel).toBeVisible();
    const label = await funnel.getAttribute('aria-label');
    expect(label).toMatch(/opened/i);
    expect(label).toMatch(/placed a pokémon/i);
    expect(label).toMatch(/1–4 gyms|5–8 gyms|9–12 gyms/);
    expect(label).toMatch(/full league/i);
    expect(label).toMatch(/kept private/i);
  });

  test('phone dex funnel is a Sankey that stays in the column', { tag: '@viewport' }, async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'desktop width is not the pan risk');
    const funnel = page.getByRole('img', { name: /Dex usage funnel/ });
    await expect(funnel).toBeVisible();
    await expect(funnel.locator('canvas')).toBeVisible();
    await expectNoSidewaysPan(funnel);
    await expectFitsPhoneHeight(funnel);
  });

  test('phone league funnel is a Sankey that stays in the column', { tag: '@viewport' }, async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'desktop width is not the pan risk');
    await page.getByRole('button', { name: 'League', exact: true }).click();
    const funnel = page.getByRole('img', { name: /League usage funnel/ });
    await expect(funnel).toBeVisible();
    await expect(funnel.locator('canvas')).toBeVisible();
    await expectNoSidewaysPan(funnel);
    await expectFitsPhoneHeight(funnel);
  });

  test('referrer labels each fit on one line inside the chart, apart from each other', { tag: '@viewport' }, async ({ page }) => {
    const now = Date.now();
    const builder = { cid: 'flow-e2e', firstTs: now - 60_000, lastTs: now, submits: 1, sessions: 1, sessionMs: [60_000],
      sessionLog: [{ ts: now - 60_000, ids: [1] }, { ts: now, ids: [1] }], maxDepth: 1, everIds: [1], latestIds: [1], completed: false, exported: false };
    const payload = buildDashboard({ clients: { 'flow-e2e': JSON.stringify(builder) }, archived: [], funnel: {}, funnelWindow: null, leagueClients: {} }, { range: 'all' }, now);
    payload.referrerFlow = [
      ['www.google.com', 50, 15, 8], ['www.bing.com', 20, 9, 3], ['duckduckgo.com', 7, 3, 1], ['noai.duckduckgo.com', 2, 1, 0],
      ['search.yahoo.com', 2, 1, 0], ['arch.b4k.dev', 1, 1, 0], ['search.brave.com', 1, 1, 0], ['it.search.yahoo.com', 1, 0, 0],
      ['referrer not known', 960, 640, 276],
    ].map(([host, dex, league, favorites]) => ({ host: host as string, dex: dex as number, league: league as number, favorites: favorites as number, total: (dex as number) + (league as number) + (favorites as number) }));
    await page.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.fillText;
      const state = window as unknown as { referrerPaints: string[] };
      state.referrerPaints = [];
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
        if (/Referrer to landing/.test(this.canvas.closest('[role="img"]')?.getAttribute('aria-label') ?? '')) state.referrerPaints.push(text);
        return maxWidth === undefined ? original.call(this, text, x, y) : original.call(this, text, x, y, maxWidth);
      };
    });
    await page.route('**/api/submissions?**', (route) => route.fulfill({ json: payload }));
    await page.evaluate(() => localStorage.setItem('p151-admin-token', 'e2e'));
    await openAdmin(page, '/?admin');
    await page.getByRole('button', { name: 'Referrer → landing' }).click();
    const chart = page.getByRole('img', { name: /Referrer to landing/ });
    await expect(chart.locator('canvas')).toBeVisible();
    const labels = await chart.evaluate((el) => {
      type Rect = { x: number; y: number; width: number; height: number; clone(): Rect; applyTransform(matrix: number[]): void };
      type Glyph = { getBoundingRect(): Rect; getComputedTransform(): number[] | undefined };
      type Chart = { getWidth(): number; getHeight(): number; getModel(): { getSeriesByIndex(i: number): { getGraph(): { nodes: { id: string; getGraphicEl(): { getTextContent(): Glyph } }[] } } } };
      type Hook = { memoizedState: unknown; next: Hook | null };
      type Fiber = { memoizedState: Hook | null; return: Fiber | null };
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))!;
      let fiber = (el as unknown as Record<string, Fiber>)[key], instance: Chart | undefined;
      for (let i = 0; fiber && i < 30 && !instance; i++, fiber = fiber.return!) for (let hook = fiber.memoizedState; hook && !instance; hook = hook.next) {
        const current = (hook.memoizedState as { current?: Chart } | null)?.current;
        if (current && typeof current.getModel === 'function') instance = current;
      }
      if (!instance) throw new Error('Rendered referrer chart missing');
      return { width: instance.getWidth(), height: instance.getHeight(), rects: instance.getModel().getSeriesByIndex(0).getGraph().nodes.map((n) => {
        const g = n.getGraphicEl().getTextContent();
        const r = g.getBoundingRect().clone(), matrix = g.getComputedTransform();
        if (matrix) r.applyTransform(matrix);
        return { name: n.id, x: r.x, y: r.y, width: r.width, height: r.height };
      }) };
    });
    const line = Math.min(...labels.rects.map((r) => r.height));
    for (const r of labels.rects) {
      expect(r.x >= 0 && r.y >= 0 && r.x + r.width <= labels.width && r.y + r.height <= labels.height, `${r.name} stays inside ${JSON.stringify(r)}`).toBe(true);
      expect(r.height, `${r.name} stays on one line`).toBeLessThan(line * 1.5);
    }
    const sources = labels.rects.filter((r) => payload.referrerFlow!.some((row) => row.host === r.name)).sort((a, b) => a.y - b.y);
    for (let i = 1; i < sources.length; i++) {
      expect(sources[i].y, `${sources[i].name} clears ${sources[i - 1].name}`).toBeGreaterThanOrEqual(sources[i - 1].y + sources[i - 1].height);
    }
    const paints = await page.evaluate(() => (window as unknown as { referrerPaints: string[] }).referrerPaints);
    for (const row of payload.referrerFlow!) expect(paints, `${row.host} paints in full`).toContain(row.host);
  });

  test('phone referrer Sankey stays in the column', { tag: '@viewport' }, async ({ page }, info) => {
    test.skip(info.project.name === 'desktop', 'desktop width is not the pan risk');
    await page.getByRole('button', { name: 'Referrer → landing' }).click();
    const chart = page.getByRole('img', { name: /Referrer to landing/ });
    await expect(chart).toBeVisible();
    await expect(chart.locator('canvas')).toBeVisible();
    await expectNoSidewaysPan(chart);
  });
});

async function expectNoSidewaysPan(chart: Locator) {
  await chart.scrollIntoViewIfNeeded();
  const metrics = await chart.evaluate((el) => {
    const nodes = [el, ...el.querySelectorAll('*')];
    const rights = nodes.map((n) => n.getBoundingClientRect().right);
    const r = el.getBoundingClientRect();
    return {
      elOverflow: el.scrollWidth - el.clientWidth,
      widerThanViewport: r.width - window.innerWidth,
      pastRight: Math.max(...rights) - window.innerWidth,
    };
  });
  expect(metrics.elOverflow, 'chart scrolls sideways').toBeLessThanOrEqual(1);
  expect(metrics.widerThanViewport, 'chart wider than viewport').toBeLessThanOrEqual(2);
  expect(metrics.pastRight, 'chart extends past the right edge').toBeLessThanOrEqual(2);
}

async function expectFitsPhoneHeight(chart: Locator) {
  const h = await chart.evaluate((el) => el.getBoundingClientRect().height);
  expect(h, 'funnel taller than a phone can show with Who').toBeLessThan(360);
}
