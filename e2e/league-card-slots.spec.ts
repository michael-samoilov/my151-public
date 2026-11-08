import { expect, test, type Page } from './support/test';
import { blankLeague, pairLeague, seededLeague } from './support/leagueSeed';

const openCard = async (page: Page) => {
  await blankLeague(page);
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(500);
};

const seat = async (page: Page, cell: string, query: string) => {
  await page.click(cell);
  await page.waitForTimeout(600);
  await page.evaluate((q) => {
    const inputs = [...document.querySelectorAll('input')];
    const el = inputs[inputs.length - 1];
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await page.waitForTimeout(700);
  await page.click('[data-testid="verify-evo-card"]');
  await page.waitForTimeout(400);
};

const PHONES = [
  { width: 360, height: 661 },
  { width: 393, height: 800 },
  { width: 412, height: 915 },
];

test.describe('the longest move in the TM box', () => {
  for (const viewport of PHONES) {
    test(`stays inside it at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const cards = Array.from({ length: 14 }, () => ({
          type: null as string | null,
          theme: '',
          lines: [] as unknown[],
          signatureSeat: null as number | null,
          tmMoveId: null as number | null,
          badgeName: '',
          legend: null as unknown,
          powerup: null as unknown,
        }));
        cards[0].tmMoveId = 53;
        window.localStorage.setItem(
          'league-builder',
          JSON.stringify({ state: { name: '', cards }, version: 1 }),
        );
      });
      await page.goto('/custom-gym-leader');
      await page.waitForSelector('[data-testid="league-slot-0"]');
      await page.click('[data-testid="league-slot-0"]');
      await page.waitForSelector('[data-testid="card-cell-1-1"]');
      await page.waitForTimeout(700);

      const fit = await page.evaluate(() => {
        const slot = document.querySelector('[data-testid="slot-tm"]')!;
        const name = [...slot.querySelectorAll('span')]
          .find((el) => el.textContent === 'Flamethrower');
        if (!name) return null;
        const box = slot.getBoundingClientRect();
        const run = name.getBoundingClientRect();
        return { spill: +(run.right - box.right).toFixed(2) };
      });
      expect(fit, 'the move is on the card').not.toBeNull();
      expect(fit!.spill, 'the name never reaches past its own box').toBeLessThanOrEqual(0.5);
      await context.close();
    });
  }
});

test.describe('gym card slots', () => {
  test('the signature pane reads the team as lines, in league order', async ({ page }, testInfo) => {
    await openCard(page);
    await seat(page, '[data-testid="card-cell-1-1"]', 'lotad');
    await seat(page, '[data-testid="card-cell-1-2"]', 'magnezone');
    await seat(page, '[data-testid="card-cell-2-3"]', 'chinchou');
    await seat(page, '[data-testid="card-cell-5-4"]', 'caterpie');

    await page.click('[data-testid="slot-ace"]', { position: { x: 8, y: 8 } });
    await page.waitForSelector('[data-filter-chip="scope"]');
    await page.click('[data-filter-chip="scope"]');
    await page.waitForTimeout(700);

    const view = await page.evaluate(() => ({
      headings: [...document.querySelectorAll('.uppercase.tracking-wide')].map((h) => h.textContent?.trim()),
      members: [...document.querySelectorAll('[data-testid="verify-evo-card"] img[alt]')].map((i) => (i as HTMLImageElement).alt),
    }));

    expect(view.headings).toEqual(['Current Team']);
    expect(view.members).toEqual([
      'Caterpie', 'Metapod', 'Butterfree',
      'Magnemite', 'Magneton', 'Magnezone',
      'Chinchou', 'Lanturn',
      'Lotad', 'Lombre', 'Ludicolo',
    ]);
    await testInfo.attach('team-line-order', { body: JSON.stringify(view), contentType: 'application/json' });
  });

  test('the team scope draws the seated branch, not the whole chain', async ({ page }, testInfo) => {
    await openCard(page);
    await seat(page, '[data-testid="card-cell-1-1"]', 'scizor');
    await seat(page, '[data-testid="card-cell-1-2"]', 'chinchou');

    await page.click('[data-testid="slot-ace"]', { position: { x: 8, y: 8 } });
    await page.waitForSelector('[data-filter-chip="scope"]');
    await page.click('[data-filter-chip="scope"]');
    await page.waitForTimeout(700);

    const view = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('[data-testid="verify-evo-card"]')];
      const names = tiles.flatMap((t) => [...t.querySelectorAll('img[alt]')].map((i) => (i as HTMLImageElement).alt));
      const cell = document.querySelector('[data-row-cell]')!.getBoundingClientRect().width;
      const backs = [...document.querySelectorAll('div.absolute.rounded-md.border')]
        .map((e) => e.getBoundingClientRect().width);
      return {
        names,
        count: Number(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')),
        cell,
        widestBack: Math.max(...backs),
      };
    });

    expect(view.names).toEqual(['Scyther', 'Scizor', 'Chinchou', 'Lanturn']);
    expect(view.names).not.toContain('Kleavor');
    expect(view.count).toBe(4);
    expect(view.widestBack).toBeLessThan(view.cell);
    await testInfo.attach('seated-branch', { body: JSON.stringify(view), contentType: 'application/json' });
  });

  test('My dex on an empty dex filters to nothing, not to everything', async ({ page }) => {
    await openCard(page);
    await page.click('[data-testid="card-cell-1-1"]');
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    const before = await page.evaluate(
      () => Number(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')),
    );
    expect(before).toBeGreaterThan(100);

    await page.click('[data-filter-chip="my-dex"]');
    await page.waitForTimeout(600);
    const after = await page.evaluate(
      () => Number(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')),
    );
    expect(after).toBe(0);
  });

  test('the Current Team chip stays on until the card is emptied', async ({ page }) => {
    await openCard(page);
    const results = () =>
      page.evaluate(() => Number(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')));
    const chipIsOff = () => page.locator('[data-filter-chip="scope"]').count();

    await page.click('[data-testid="slot-ace"]', { position: { x: 8, y: 8 } });
    await page.waitForSelector('[data-result-count]', { state: 'attached' });
    await page.waitForTimeout(500);
    expect(await chipIsOff(), 'no chip on an empty card').toBe(0);
    expect(await page.evaluate(() => /Current Team/.test(document.body.innerText))).toBe(false);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    await seat(page, '[data-testid="card-cell-1-1"]', 'chinchou');
    await seat(page, '[data-testid="card-cell-1-2"]', 'lotad');

    await page.click('[data-testid="slot-ace"]', { position: { x: 8, y: 8 } });
    await page.waitForSelector('[data-filter-chip="scope"]');
    await page.click('[data-filter-chip="scope"]');
    await page.waitForTimeout(600);
    const scoped = await results();
    expect(scoped).toBe(5);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.click('[data-testid="slot-ace"]', { position: { x: 8, y: 8 } });
    await page.waitForTimeout(800);
    expect(await chipIsOff(), 'still on after reopening').toBe(0);
    expect(await results()).toBe(scoped);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    for (let i = 0; i < 2; i++) {
      await page.locator('[aria-label^="Remove"]').first().click();
      await page.waitForTimeout(500);
    }
    await page.click('[data-testid="slot-ace"]', { position: { x: 8, y: 8 } });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => /Current Team/.test(document.body.innerText))).toBe(false);
    expect(await results()).toBeGreaterThan(100);
  });

  test('the My dex chip stays on until it is turned off', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('personal-151-pokedex-v3', JSON.stringify({
        state: {
          sections: { starter: [1, 2, 3, 4, 5, 6], forest: [10, 11, 12] },
          customOrder: {}, sortOption: 'dex', groupSpecialAtEnd: false,
        },
        version: 3,
      }));
    });
    await openCard(page);
    const results = () =>
      page.evaluate(() => Number(document.querySelector('[data-result-count]')?.getAttribute('data-result-count')));

    await page.click('[data-testid="card-cell-1-1"]');
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    const unfiltered = await results();
    await page.click('[data-filter-chip="my-dex"]');
    await page.waitForTimeout(500);
    const filtered = await results();
    expect(filtered).toBeLessThan(unfiltered);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.click('[data-testid="card-cell-1-2"]');
    await page.waitForTimeout(800);
    expect(await page.locator('[data-filter-chip="my-dex"]').count(), 'the off-state chip is gone').toBe(0);
    expect(await results(), 'the filter is still applied').toBe(filtered);

    await page.evaluate(() => {
      const chip = [...document.querySelectorAll('span')].find(
        (el) => /My dex/.test(el.textContent ?? '') && el.className.includes('bg-foreground'),
      );
      (chip?.querySelectorAll('button')[1] as HTMLButtonElement | undefined)?.click();
    });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.click('[data-testid="card-cell-2-3"]');
    await page.waitForTimeout(800);
    expect(await page.locator('[data-filter-chip="my-dex"]').count(), 'it stayed off').toBe(1);
  });

  test('the TM disc takes the move\'s type, not the gym\'s', { tag: '@viewport' }, async ({ page }) => {
    await openCard(page);
    await page.click('text=Pick a move');
    await page.waitForSelector('[data-testid="tm-filter-category"]');
    await page.fill('input[placeholder="Search moves"]', 'flamethrower');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Flamethrower/ }).first().click();
    await page.waitForTimeout(400);

    const stroke = await page.evaluate(() => {
      const disc = [...document.querySelectorAll('svg')].find((s) => s.querySelector('g[transform*="skew"]'));
      return disc?.querySelector('circle')?.getAttribute('stroke') ?? null;
    });
    expect(stroke?.toUpperCase()).toBe('#E62829');
  });

  test('TM search ignores the gym type chip', async ({ page }) => {
    await page.addInitScript(() => {
      const cards = Array.from({ length: 14 }, () => ({
        type: null as string | null,
        theme: '',
        lines: [] as unknown[],
        signatureSeat: null as number | null,
        tmMoveId: null as number | null,
        badgeName: '',
        legend: null as unknown,
        powerup: null as unknown,
      }));
      cards[0].type = 'fire';
      window.localStorage.setItem(
        'league-builder',
        JSON.stringify({ state: { name: '', cards }, version: 1 }),
      );
    });
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);
    await page.click('[data-testid="slot-tm"]');
    await page.waitForSelector('[data-testid="tm-chip-type-fire"]');
    await page.fill('input[placeholder="Search moves"]', 'surf');
    await expect(page.getByRole('button', { name: /Surf/ }).first()).toBeVisible();
  });

  test('the badge name and the word Badge are one wrapping phrase', { tag: '@viewport' }, async ({ page }) => {
    await openCard(page);
    await expectThunderBadge(page);
  });

  test('the badge refuses text that would spill out of its slot', { tag: '@viewport' }, async ({ page }) => {
    await openCard(page);
    await expectBadgePreservesOrderWithFittedTail(page);
  });
});

async function expectThunderBadge(page: Page) {
  const field = page.locator('[aria-label="Badge name"]');
  await field.click();
  await page.keyboard.type('Thunder');
  await page.waitForTimeout(200);

  const short = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Badge name"]')!;
    const box = el.parentElement!;
    const text = el.firstChild;
    let lines = 0;
    if (text?.nodeType === Node.TEXT_NODE && text.textContent?.startsWith('Thunder')) {
      const word = document.createRange();
      word.setStart(text, 0);
      word.setEnd(text, 'Thunder'.length);
      lines = new Set([...word.getClientRects()].map((r) => Math.round(r.top))).size;
    }
    return { field: el.textContent, phrase: box.textContent, lines };
  });
  await test.info().attach('badge-thunder.json', { body: JSON.stringify(short), contentType: 'application/json' });
  expect(short.field).toBe('Thunder Badge');
  expect(short.phrase).toBe('Thunder Badge');
  expect(short.lines, 'Thunder is drawn whole, on one line').toBe(1);
}

async function expectBadgePreservesOrderWithFittedTail(page: Page) {
  const field = page.locator('[aria-label="Badge name"]');
  await field.click();
  await page.keyboard.type('Thunder Cascade Marsh Rainbow Soul Volcano Earth Boulder Zephyr Glacier');
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Badge name"]')!;
    const box = el.parentElement!;
    const slot = box.parentElement!;
    return {
      stored: (JSON.parse(localStorage.getItem('league-builder') ?? '{}').state?.cards?.[0]?.badgeName ?? '') as string,
      rendered: el.textContent ?? '',
      overflows: box.scrollHeight > box.clientHeight + 1,
      insideSlot: box.getBoundingClientRect().bottom <= slot.getBoundingClientRect().bottom + 1,
    };
  });
  await test.info().attach('badge-long-name.json', { body: JSON.stringify(state), contentType: 'application/json' });
  expect(state.overflows).toBe(false);
  expect(state.insideSlot).toBe(true);
  expect(state.rendered.length).toBeGreaterThan(4);
  expect(state.rendered.length).toBeLessThan(60);
  const typed = 'Thunder Cascade Marsh Rainbow Soul Volcano Earth Boulder Zephyr Glacier';
  const kept = state.rendered.replace(/\u00a0/g, ' ').replace(/\s*Badge$/, '').trimEnd();
  let common = 0;
  while (common < kept.length && kept[common] === typed[common]) common++;
  const FITTED_TAIL_ALLOWANCE = 2;
  expect(common, `"${kept}" preserves the typed order within its final two fitted characters`)
    .toBeGreaterThanOrEqual(kept.length - FITTED_TAIL_ALLOWANCE);
  expect(common, 'and enough of it to show the order held').toBeGreaterThan(4);
  expect(state.stored.replace(/\u00a0/g, ' ').trimEnd()).toBe(kept);
}

test.describe('the partner heading', () => {
  test('keeps both words inside the rounded pane', { tag: '@viewport' }, async ({ page }) => {
    await openCard(page);
    await page.waitForTimeout(400);
    const got = await page.evaluate(() => {
      const slot = document.querySelector('[data-ace-partner-slot]');
      const head = document.querySelector('[data-slot-head="partner"]');
      const lines = [...head?.querySelectorAll('span.block') ?? []]
        .map((el) => (el.textContent ?? '').trim());
      if (!(slot instanceof HTMLElement) || !head) return { lines, inside: false, detail: 'missing' };
      const box = slot.getBoundingClientRect();
      const zoom = box.width / slot.offsetWidth || 1;
      const raw = getComputedStyle(slot).borderTopLeftRadius;
      let radius = parseFloat(raw) || 8;
      if (raw.includes('rem')) {
        radius *= parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      }
      radius *= zoom;
      const range = document.createRange();
      range.selectNodeContents(head);
      const ink = range.getBoundingClientRect();
      const air = 1;
      const pastRect =
        ink.left < box.left - air ||
        ink.right > box.right + air ||
        ink.top < box.top - air ||
        ink.bottom > box.bottom + air;
      const cx = box.right - radius;
      const cy = box.bottom - radius;
      let pastCorner = false;
      if (ink.right > cx && ink.bottom > cy && radius > 0) {
        pastCorner = Math.hypot(ink.right - cx, ink.bottom - cy) > radius + air;
      }
      const inside = ink.width > 0 && !pastRect && !pastCorner;
      return {
        lines,
        inside,
        detail: `ink r=${(box.right - ink.right).toFixed(1)} b=${(box.bottom - ink.bottom).toFixed(1)} corner=${pastCorner}`,
      };
    });
    expect(got.lines, got.detail).toEqual(['PARTNER /', 'SHOULDERMON']);
    expect(got.inside, got.detail).toBe(true);
    const align = await page.evaluate(() => {
      const head = document.querySelector('[data-slot-head="partner"]');
      const art = document.querySelector('[data-testid="slot-partner"] [data-slot-art]');
      const aceHead = document.querySelector('[data-slot-head="ace"]');
      const aceArt = document.querySelector('[data-testid="slot-ace"] [data-slot-art]');
      if (!head || !art || !aceHead || !aceArt) return { ok: false, detail: 'missing' };
      const h = head.getBoundingClientRect();
      const a = art.getBoundingClientRect();
      const ah = aceHead.getBoundingClientRect();
      const aa = aceArt.getBoundingClientRect();
      const slot = head.closest('[data-ace-partner-slot]') as HTMLElement;
      const zoom = slot.getBoundingClientRect().width / slot.offsetWidth || 1;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const partnerGap = (a.left - h.right) / zoom;
      const aceDrift = Math.abs((ah.left + ah.right) / 2 - (aa.left + aa.right) / 2) / zoom;
      return {
        ok: partnerGap >= 0 && partnerGap <= 0.25 * rem && aceDrift <= 1 && ah.top >= aa.bottom - 1,
        detail: `partner gap ${partnerGap.toFixed(2)}px ace drift ${aceDrift.toFixed(2)}px`,
      };
    });
    expect(align.ok, align.detail).toBe(true);
    const type = await page.evaluate(() => {
      const ace = document.querySelector('[data-slot-head="ace"]');
      const partner = document.querySelector('[data-slot-head="partner"]');
      if (!ace || !partner) return { ok: false, detail: 'missing' };
      const a = getComputedStyle(ace);
      const p = getComputedStyle(partner);
      const scaled = (el: Element) => /scale\(/i.test(getComputedStyle(el).transform);
      return {
        ok: a.fontSize === p.fontSize
          && a.letterSpacing === p.letterSpacing
          && a.fontWeight === p.fontWeight
          && !scaled(ace)
          && !scaled(partner)
          && a.transform === 'none'
          && p.transform === 'none',
        detail: `ace ${a.fontSize}/${a.letterSpacing}/${a.transform} partner ${p.fontSize}/${p.letterSpacing}/${p.transform}`,
      };
    });
    expect(type.ok, type.detail).toBe(true);
  });
});

test.describe('an empty slot and a filled one', () => {
  const anchors = (page: Page) =>
    page.evaluate(() => {
      const hex = (c: string) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
        return m ? '#' + [1, 2, 3].map((k) => Number(m[k]).toString(16).padStart(2, '0')).join('') : c;
      };
      const rel = (pane: Element, inner: Element) => {
        const p = pane.getBoundingClientRect();
        const i = inner.getBoundingClientRect();
        const zoom = p.width / (pane as HTMLElement).offsetWidth;
        return [(i.left - p.left) / zoom, (i.top - p.top) / zoom].map((v) => Number(v.toFixed(2)));
      };
      const tm = document.querySelector('[data-testid="slot-tm"]')!;
      const badge = document.querySelector('[data-testid="slot-badge"]')!;
      const ace = document.querySelector('[data-testid="slot-ace"]')!;
      const partner = document.querySelector('[data-testid="slot-partner"]')!;
      const pane = ace.parentElement!;
      const word = (root: Element, text: string) =>
        [...root.querySelectorAll('span')].find((el) => el.childElementCount === 0 && el.textContent === text)!;
      return {
        tm: rel(tm, tm.querySelector('svg')!),
        badge: rel(badge, badge.querySelector('svg')!),
        ace: rel(pane, ace.querySelector('[data-slot-art]')!),
        partner: rel(pane, partner.querySelector('[data-slot-art]')!),
        colours: {
          aceHead: hex(getComputedStyle(ace.querySelector('[data-slot-head] > span')!).color),
          partnerHead: hex(getComputedStyle(partner.querySelector('[data-slot-head] > span')!).color),
          tmWord: hex(getComputedStyle(word(tm, 'TM')).color),
          badgeWord: hex(getComputedStyle(word(badge, 'BADGE')).color),
        },
      };
    });

  test('the placement survives a webfont that lands late', { tag: '@viewport' }, async ({ page }) => {
    await page.route('**/*.woff2', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await openCard(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const late = await anchors(page);

    await page.unroute('**/*.woff2');
    await openCard(page);
    const resident = await anchors(page);

    for (const key of ['tm', 'badge', 'ace', 'partner'] as const) {
      expect(Math.abs(late[key][0] - resident[key][0]), `${key} x`).toBeLessThanOrEqual(0.05);
      expect(Math.abs(late[key][1] - resident[key][1]), `${key} y`).toBeLessThanOrEqual(0.05);
    }
  });

  test('put their content in the same place', { tag: '@viewport' }, async ({ page }) => {
    await openCard(page);
    const empty = await anchors(page);

    await seededLeague(page);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);
    const seeded = await page.evaluate(() => {
      const hex = (c: string) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
        return m ? '#' + [1, 2, 3].map((k) => Number(m[k]).toString(16).padStart(2, '0')).join('') : c;
      };
      const pane = document.querySelector('[data-ace-partner-slot]')!;
      const ace = document.querySelector('[data-testid="slot-ace"]')!;
      return {
        mode: pane.getAttribute('data-showcase'),
        seam: !!pane.querySelector(':scope > svg line'),
        partnerHead: !!document.querySelector('[data-slot-head="partner"]'),
        arts: pane.querySelectorAll('[data-slot-art] img').length,
        aceHead: hex(getComputedStyle(ace.querySelector('[data-slot-head] > span')!).color),
      };
    });
    expect(seeded.mode, 'seeded Brock keeps a split pane').toBe('split');
    expect(seeded.seam, 'the diagonal stays').toBe(true);
    expect(seeded.partnerHead, 'empty partner heading stays').toBe(true);
    expect(seeded.arts).toBe(1);

    expect(empty.colours.aceHead).toBe(empty.colours.tmWord);
    expect(empty.colours.partnerHead).toBe(empty.colours.tmWord);
    expect(seeded.aceHead).not.toBe(empty.colours.aceHead);

    await pairLeague(page, 10240, 797);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);
    const paired = await anchors(page);
    for (const key of ['ace', 'partner'] as const) {
      expect(Math.abs(paired[key][0] - empty[key][0]), `${key} x`).toBeLessThanOrEqual(0.05);
      expect(Math.abs(paired[key][1] - empty[key][1]), `${key} y`).toBeLessThanOrEqual(0.05);
    }
  });
});

test.describe('the red marks', () => {
  const asRgb = (page: Page, value: string) =>
    page.evaluate((v) => {
      const el = document.createElement('span');
      el.style.color = v;
      document.body.append(el);
      const out = getComputedStyle(el).color;
      el.remove();
      return out;
    }, value);

  test('the card\'s mark is a red tile with white on it, and the summary\'s square is grey', async ({ page }) => {
    await openCard(page);
    const got = await page.evaluate(() => {
      const mark = [...document.querySelectorAll('span')]
        .find((s) => s.childElementCount === 0 && s.textContent?.trim() === 'TYPE')
        ?.parentElement;
      const square = [...document.querySelectorAll<HTMLElement>('[data-testid="league-slot-0"] span')]
        .find((s) => getComputedStyle(s).borderTopStyle === 'dashed' && !s.dataset.testid);
      const action = document.querySelector('[data-testid="league-action-0"]');
      const cs = (el: Element | null | undefined) => (el ? getComputedStyle(el) : null);
      return {
        mark: { fill: cs(mark)?.backgroundColor, text: cs(mark)?.color, border: cs(mark)?.borderTopWidth },
        square: cs(square)?.borderTopColor,
        action: cs(action)?.borderTopColor,
      };
    });
    expect(got.mark.text, 'the "+ TYPE" mark exists').toBeTruthy();
    expect(got.square, 'the summary square exists').toBeTruthy();
    expect(got.mark.fill, 'the mark is filled with the primary red').toBe(await asRgb(page, 'var(--color-primary)'));
    expect(got.mark.text, 'the mark\'s plus and word are white on it').toBe(await asRgb(page, 'var(--color-primary-foreground)'));
    expect(got.mark.border, 'the mark has no border').toBe('0px');
    expect(got.square, 'the square is the grey its neighbour paints').toBe(got.action);
    expect(got.square, 'and that grey is the border token').toBe(await asRgb(page, 'var(--color-border)'));
  });

  test('both header pencils wear the primary token', async ({ page }) => {
    await page.addInitScript(() => {
      const blank = { type: null, theme: '', lines: [], signatureSeat: null, tmMoveId: null, badgeName: '', legend: null, powerup: null };
      const cards: unknown[] = Array.from({ length: 14 }, () => ({ ...blank }));
      cards[0] = { ...blank, theme: 'Rock' };
      window.localStorage.setItem('league-builder', JSON.stringify({ state: { name: 'Kanto', cards }, version: 1 }));
    });
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(500);
    const got = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-primary)';
      document.body.append(probe);
      const primary = getComputedStyle(probe).color;
      probe.remove();
      return { primary, pencils: [...document.querySelectorAll('svg.lucide-pencil')].map((p) => getComputedStyle(p).color) };
    });
    expect(got.pencils.length, 'the league name and the theme each show a pencil').toBe(2);
    for (const c of got.pencils) expect(c, 'the pencil wears the primary token').toBe(got.primary);
  });
});

async function openTmCard(
  page: Page,
  opts: { tmMoveId: number; badgeName?: string; width?: number; height?: number },
) {
  await page.setViewportSize({ width: opts.width ?? 390, height: opts.height ?? 667 });
  await page.addInitScript(({ tmMoveId, badgeName }) => {
    const empty = {
      type: null as string | null,
      theme: '',
      lines: [] as unknown[],
      signatureSeat: null as number | null,
      tmMoveId: null as number | null,
      badgeName: '',
      legend: null as unknown,
      powerup: null as unknown,
    };
    const cards = Array.from({ length: 14 }, () => ({ ...empty }));
    cards[0] = { ...empty, type: 'psychic', theme: 'Sabrina', tmMoveId, badgeName: badgeName ?? 'Marsh' };
    window.localStorage.setItem('league-builder', JSON.stringify({ state: { name: '', cards }, version: 1 }));
  }, { tmMoveId: opts.tmMoveId, badgeName: opts.badgeName ?? 'Marsh' });
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="slot-tm"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

function measureTm(source: string) {
  const needle = new RegExp(source, 'i');
  const slot = document.querySelector('[data-testid="slot-tm"]');
  if (!slot) {
    return { found: false, text: '', ellipsis: true, lines: 0, fits: false, topGap: 0, bottomGap: 0, lastVisible: false };
  }
  const named = slot.querySelector<HTMLElement>('[data-tm-name]');
  const name = named ?? [...slot.querySelectorAll('span')].find(
    (el): el is HTMLSpanElement => needle.test(el.textContent ?? '') && el.childElementCount === 0,
  );
  const disc = slot.querySelector('svg[viewBox="0 0 24 24"] circle[r="9"]');
  const badge = slot.querySelector('svg[viewBox="0 0 200 40"]');
  const tm = slot.querySelector<HTMLElement>('[data-mark-label="tm"]');
  if (!name || !disc || !badge || !tm) {
    return { found: false, text: name?.textContent ?? '', ellipsis: true, lines: 0, fits: false, topGap: 0, bottomGap: 0, lastVisible: false };
  }
  const cs = getComputedStyle(name);
  const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
  const lines = lineH > 0 ? Math.round(name.offsetHeight / lineH) : 0;
  const wrap = name.style.whiteSpace;
  name.style.whiteSpace = 'nowrap';
  const fits = name.scrollWidth <= name.clientWidth + 1;
  name.style.whiteSpace = wrap;
  const zoom = name.offsetHeight > 0 ? name.getBoundingClientRect().height / name.offsetHeight : 1;
  const node = [...name.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
  const tmNode = [...tm.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
  const inkBottom = (el: Element, textNode: ChildNode | undefined) => {
    if (!textNode || !(textNode.textContent ?? '').length) return el.getBoundingClientRect().bottom;
    const range = document.createRange();
    range.selectNodeContents(textNode);
    return range.getBoundingClientRect().bottom;
  };
  const discTop = disc.getBoundingClientRect().top;
  const badgeTop = badge.getBoundingClientRect().top;
  const tmBottom = inkBottom(tm, tmNode);
  const nameBottom = inkBottom(name, node);
  const raw = (name.textContent ?? '').replace(/\s+/g, ' ').trim();
  let lastVisible = false;
  if (node && raw.length > 0) {
    const range = document.createRange();
    range.setStart(node, (node.textContent ?? '').length - 1);
    range.setEnd(node, (node.textContent ?? '').length);
    const last = range.getBoundingClientRect();
    const slotBox = slot.getBoundingClientRect();
    lastVisible = last.width > 0.5
      && last.right <= slotBox.right + 0.5
      && last.bottom <= slotBox.bottom + 0.5;
  }
  return {
    found: true,
    text: raw,
    ellipsis: name.scrollWidth > name.clientWidth + 1,
    lines,
    fits,
    topGap: (badgeTop - discTop) / zoom,
    bottomGap: (tmBottom - nameBottom) / zoom,
    lastVisible,
  };
}

test.describe('TM names wrap only when they do not fit', () => {
  for (const vp of [
    { width: 390, height: 667, label: 'squat 390×667' },
    { width: 1280, height: 800, label: '~1280' },
  ]) {
    for (const move of [
      { id: 707, name: 'Stomping Tantrum', fits: false },
      { id: 157, name: 'Rock Slide', fits: true },
      { id: 94, name: 'Psychic', fits: true },
    ]) {
      test(`${move.name} takes ${move.fits ? 'one line' : 'two lines'} with equal gaps at ${vp.label}`, async ({ page }, testInfo) => {
        await openTmCard(page, { tmMoveId: move.id, width: vp.width, height: vp.height });
        const got = await page.evaluate(measureTm, move.name.split(' ')[0]);
        await testInfo.attach('tm-name.json', { body: JSON.stringify(got, null, 2), contentType: 'application/json' });
        expect(got.found, 'the move is on the card').toBe(true);
        expect(got.text).toBe(move.name);
        expect(got.fits, 'whether one line holds the name').toBe(move.fits);
        expect(got.lines, 'one line when it fits, two when it wraps').toBe(move.fits ? 1 : 2);
        expect(got.ellipsis, 'the name is whole').toBe(false);
        expect(got.lastVisible, 'the last letter stays inside the slot').toBe(true);
        expect(Math.abs(got.topGap - got.bottomGap), `top=${got.topGap.toFixed(1)} bottom=${got.bottomGap.toFixed(1)}`)
          .toBeLessThanOrEqual(1.25);
      });
    }
  }
});

function badgeVisibility() {
  const field = document.querySelector<HTMLElement>('[aria-label="Badge name"]');
  const suffix = document.querySelector<HTMLElement>('[data-badge-suffix]');
  const box = field?.parentElement;
  if (!field || !box) {
    return { rendered: '', stored: '', suffixVisible: false, overflows: true };
  }
  const br = box.getBoundingClientRect();
  const rects = suffix ? [...suffix.getClientRects()] : [];
  const suffixVisible = !!suffix && rects.length > 0 && rects.every((r) => (
    r.width < 0.5
    || (r.left >= br.left - 1 && r.right <= br.right + 1 && r.top >= br.top - 1 && r.bottom <= br.bottom + 1)
  ));
  const stored = (JSON.parse(localStorage.getItem('league-builder') ?? '{}').state?.cards?.[0]?.badgeName ?? '') as string;
  return {
    rendered: (field.textContent ?? '').replace(/\u00a0/g, ' '),
    stored,
    suffixVisible,
    overflows: box.scrollHeight > box.clientHeight + 1,
  };
}

test.describe('the badge word stays fully visible', () => {
  for (const vp of [
    { width: 390, height: 667, label: 'squat 390×667' },
    { width: 1280, height: 800, label: '~1280' },
  ]) {
    test(`Thunder Thunder Badge fits and Thunder Thunder Thunder is refused at ${vp.label}`, async ({ page }) => {
      await openTmCard(page, { tmMoveId: 94, badgeName: '', width: vp.width, height: vp.height });
      const field = page.locator('[aria-label="Badge name"]');
      await field.click();
      await page.keyboard.type('Thunder Thunder');
      await page.waitForTimeout(200);
      const fit = await page.evaluate(badgeVisibility);
      expect(fit.rendered).toMatch(/Thunder Thunder\s+Badge/);
      expect(fit.suffixVisible, 'Badge stays fully inside the box on the longest accepted name').toBe(true);
      expect(fit.overflows).toBe(false);

      await page.keyboard.type(' Thunder');
      await page.waitForTimeout(200);
      const refused = await page.evaluate(badgeVisibility);
      expect(refused.rendered, 'the third Thunder does not land').not.toMatch(/Thunder Thunder Thunder/);
      expect(refused.stored).not.toMatch(/Thunder Thunder Thunder/);
      expect(refused.suffixVisible, 'Badge stays fully visible after the rejected character').toBe(true);
      expect(refused.overflows).toBe(false);
    });

    test(`a stored name that hid Badge is clamped so Badge paints at ${vp.label}`, async ({ page }) => {
      await openTmCard(page, { tmMoveId: 94, badgeName: 'Thunder Thunder Thunder', width: vp.width, height: vp.height });
      const got = await page.evaluate(badgeVisibility);
      expect(got.rendered).toMatch(/Badge/);
      expect(got.suffixVisible, 'Badge is fully inside the box after clamp').toBe(true);
      expect(got.overflows).toBe(false);
      expect(got.stored).not.toBe('Thunder Thunder Thunder');
      expect(got.rendered).not.toMatch(/Thunder Thunder Thunder/);
    });
  }
});
