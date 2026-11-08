import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './support/test';
import { en } from '../src/i18n/catalogs/en';
import { blankLeague, fiveLineCardLeague, pairLeague } from './support/leagueSeed';

const WIDEST = [
  { lang: 'en', ace: 947, partner: 908 },
  { lang: 'de', ace: 735, partner: 765 },
  { lang: 'fr', ace: 819, partner: 740 },
  { lang: 'es', ace: 947, partner: 908 },
  { lang: 'it', ace: 947, partner: 1005 },
  { lang: 'ja', ace: 678, partner: 721 },
  { lang: 'ko', ace: 695, partner: 937 },
  { lang: 'zh-Hans', ace: 82, partner: 139 },
  { lang: 'zh-Hant', ace: 82, partner: 139 },
] as const;

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

function catalogHeading(lang: string, key: 'league.head.ace' | 'league.head.partner'): string {
  const text = lang === 'en' ? en[key] : readJson(`src/i18n/catalogs/ui/${lang}.json`)[key] as string;
  return text.replace(/\s+/g, '').toLocaleUpperCase(lang);
}

const openCard = async (page: Page) => {
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
};

async function slotGeometry(page: Page) {
  return page.evaluate(() => {
    const seam = document.querySelector('svg line[vector-effect="non-scaling-stroke"]')!;
    const slot = seam.closest('div')!;
    const s = slot.getBoundingClientRect();
    const halves = ['slot-ace', 'slot-partner'].map((id) => {
      const half = slot.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      const r = half.querySelector<HTMLElement>('[data-slot-art]')!.getBoundingClientRect();
      const sprite = r.width;
      const box = {
        left: r.left + r.width / 2 - sprite / 2,
        top: r.top + r.height / 2 - sprite / 2,
      };
      const runs = [...half.querySelectorAll<HTMLElement>('[data-slot-head], [data-slot-name]')]
        .map((el) => el.getBoundingClientRect())
        .filter((v) => v.width > 1);
      const disc = half.querySelector<HTMLElement>('[data-slot-ring]')?.getBoundingClientRect();
      const at = (n: string, size: number) => (Number(seam.getAttribute(n)) / 100) * size;
      const [ax, ay, bx, by] = [at('x1', s.width), at('y1', s.height), at('x2', s.width), at('y2', s.height)];
      const len = Math.hypot(bx - ax, by - ay);
      const past = disc
        ? disc.width / 2 - Math.abs(
            (bx - ax) * (disc.top + disc.height / 2 - s.top - ay)
            - (by - ay) * (disc.left + disc.width / 2 - s.left - ax),
          ) / len
        : null;
      return {
        id,
        sprite,
        ring: disc ? disc.width : null,
        ringPastSeam: past,
        cx: (box.left + sprite / 2 - s.left) / s.width,
        cy: (box.top + sprite / 2 - s.top) / s.height,
        box: { left: box.left, top: box.top, right: box.left + sprite, bottom: box.top + sprite },
        outOfSlot: Math.max(
          0,
          ...runs.flatMap((v) => [s.left - v.left, v.right - s.right, s.top - v.top, v.bottom - s.bottom]),
        ),
      };
    });
    const [ace, partner] = halves;
    return {
      halves,
      slot: { width: s.width, height: s.height },
      team: document.querySelector('[data-testid="card-cell-1-1"] img')?.getBoundingClientRect().width ?? null,
      overlap:
        Math.max(0, Math.min(ace.box.right, partner.box.right) - Math.max(ace.box.left, partner.box.left)) *
        Math.max(0, Math.min(ace.box.bottom, partner.box.bottom) - Math.max(ace.box.top, partner.box.top)),
    };
  });
}

test.describe('the ace and partner slot', () => {
  test('the two halves are a mirrored pair, at any width', { tag: '@viewport' }, async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    const { halves, slot } = await slotGeometry(page);
    const ace = halves.find((h) => h.id === 'slot-ace')!;
    const partner = halves.find((h) => h.id === 'slot-partner')!;
    const where = `in a slot ${slot.width.toFixed(0)}px wide`;
    expect(ace.cx, `ace stays left, ${where}`).toBeLessThan(0.5);
    expect(ace.cy, `ace stays top, ${where}`).toBeLessThan(0.5);
    expect(partner.cx, `partner stays on the right, ${where}`).toBeGreaterThan(0.5);
    expect(partner.cy, `partner stays on the bottom, ${where}`).toBeGreaterThan(0.5);
    for (const half of halves) {
      expect(half.outOfSlot, `${half.id} paints outside the slot`).toBeLessThanOrEqual(1);
    }
  });

  test('the two sprites cross only at the corner', { tag: '@viewport' }, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'narrow',
      '1× at dpr 1 is 96 CSS px; two squares do not fit a 320 pane',
    );
    await blankLeague(page);
    await openCard(page);
    const { halves, overlap } = await slotGeometry(page);
    const area = halves[0].sprite ** 2;
    expect(overlap / area, 'the sprites overlap').toBeLessThanOrEqual(0.02);
  });

  test('the placeholder rings stop short of the seam', { tag: '@viewport' }, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'narrow',
      '1× at dpr 1 is 96 CSS px; two squares do not fit a 320 pane',
    );
    await blankLeague(page);
    await openCard(page);
    const { halves } = await slotGeometry(page);
    for (const half of halves) {
      expect(half.ring, `${half.id} draws a placeholder when empty`).not.toBeNull();
      expect(half.ringPastSeam!, `${half.id} placeholder reaches past the seam`).toBeLessThan(0);
    }
  });

  test('the partner is a cell sprite on the column below it, and the ace twice it', { tag: '@viewport' }, async ({ page }, testInfo) => {
    await fiveLineCardLeague(page);
    await openCard(page);
    const got = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
      const p = pane.getBoundingClientRect();
      const mid = (r: DOMRect) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, w: r.width });
      const partner = mid(pane.querySelector('[data-slot-half="partner"] [data-slot-art]')!.getBoundingClientRect());
      const ace = mid(pane.querySelector('[data-slot-half="ace"] [data-slot-art]')!.getBoundingClientRect());
      const cells = [...document.querySelectorAll<HTMLElement>('[data-testid^="card-cell-"] img')]
        .map((img) => mid(img.getBoundingClientRect()));
      const below = cells.filter((c) => c.y > p.bottom && c.x > p.left + (2 * p.width) / 3 && c.x < p.right + 8);
      const row4 = [...document.querySelectorAll<HTMLElement>('[data-testid^="card-cell-4-"] img')]
        .map((img) => mid(img.getBoundingClientRect()));
      return { partner, ace, below, row4 };
    });
    await testInfo.attach('alignment.json', { body: JSON.stringify(got, null, 2), contentType: 'application/json' });
    expect(got.below.length, 'sprites in the column below the pane').toBeGreaterThanOrEqual(3);
    for (const cell of got.below) {
      expect(Math.abs(got.partner.x - cell.x), 'the partner centres on the column below').toBeLessThanOrEqual(1);
      expect(Math.abs(got.partner.w - cell.w), 'the partner is a cell sprite').toBeLessThanOrEqual(0.5);
    }
    expect(got.row4.length, 'sprites in the card\'s 4th row').toBeGreaterThan(0);
    expect(Math.abs(got.partner.y - got.row4[0].y), 'the partner lines up with the 4th row').toBeLessThanOrEqual(1);
    expect(Math.abs(got.ace.w - 2 * got.partner.w), 'the ace is twice the partner').toBeLessThanOrEqual(0.5);
  });

  test('Hisuian Braviary and Celesteela do not overlap', { tag: '@viewport' }, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'narrow',
      '1× at dpr 1 is 96 CSS px; two squares do not fit a 320 pane',
    );
    await pairLeague(page, 10240, 797);
    await openCard(page);
    const { halves, overlap } = await slotGeometry(page);
    const area = halves[0].sprite ** 2;
    expect(halves[0].sprite, 'ace sprite is on the card').toBeGreaterThan(8);
    expect(overlap / area, 'large sprites overlap').toBeLessThanOrEqual(0.02);
  });

  test('the empty state centres the partner heading as the filled one does', { tag: '@viewport' }, async ({ page }) => {
    await blankLeague(page);
    await openCard(page);

    const runs = () =>
      page.evaluate(() =>
        ['slot-ace', 'slot-partner'].map((id) => {
          const half = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
          const box = half.getBoundingClientRect();
          const zoom = box.width / half.offsetWidth;
          return [...half.querySelectorAll('span')]
            .filter((el) => (el.textContent ?? '').trim().length > 0 || el.innerHTML === '&nbsp;')
            .map((el) => Number(((el.getBoundingClientRect().top - box.top) / zoom).toFixed(2)));
        }),
      );

    const pick = async (slot: string, query: string, throughOverlay = false) => {
      await page.click(
        `[data-testid="${slot}"]`,
        throughOverlay ? { position: { x: 8, y: 8 }, force: true } : {},
      );
      await page.waitForSelector('[data-filter-chip="my-dex"]');
      await page.evaluate((q) => {
        const inputs = [...document.querySelectorAll('input')];
        const el = inputs[inputs.length - 1];
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        set.call(el, q);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, query);
      await page.waitForTimeout(700);
      await page.click('[data-testid="verify-evo-card"]');
      await page.waitForTimeout(700);
    };

    const partnerCaption = () =>
      page.evaluate(() => {
        const half = document.querySelector<HTMLElement>('[data-testid="slot-partner"]')!;
        const zoom = half.getBoundingClientRect().width / half.offsetWidth;
        const art = half.querySelector('[data-slot-art]')!.getBoundingClientRect();
        const lines = [...half.querySelectorAll('[data-slot-head] > span, [data-slot-name]')]
          .filter((el) => (el.textContent ?? '').trim() !== '')
          .map((el) => el.getBoundingClientRect());
        const top = Math.min(...lines.map((r) => r.top));
        const bottom = Math.max(...lines.map((r) => r.bottom));
        return { lines: lines.length, off: ((top + bottom) / 2 - (art.top + art.bottom) / 2) / zoom };
      });

    const empty = await runs();
    const emptyPartner = await partnerCaption();
    await pick('slot-partner', 'pikachu');
    await pick('slot-ace', 'bulbasaur', true);
    const filled = await runs();
    const filledPartner = await partnerCaption();

    expect(emptyPartner.lines, 'an empty partner draws its heading only').toBe(2);
    expect(Math.abs(emptyPartner.off), `the empty caption is ${emptyPartner.off.toFixed(2)}px off centre`).toBeLessThanOrEqual(0.5);
    expect(filledPartner.lines, 'a filled partner adds its name').toBe(3);
    expect(Math.abs(filledPartner.off), `the filled caption is ${filledPartner.off.toFixed(2)}px off centre`).toBeLessThanOrEqual(0.5);

    empty[0].forEach((top, i) => {
      expect(Math.abs(filled[0][i] - top), `ace text run ${i} moved`).toBeLessThanOrEqual(0.1);
    });
  });

  test('a partner is not held to the team, and seats itself when there is room', async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    await page.click('[data-testid="slot-partner"]');
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    expect(await page.locator('[data-filter-chip="scope-locked"]').count()).toBe(0);
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      const el = inputs[inputs.length - 1];
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      set.call(el, 'pikachu');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    await page.click('[data-testid="verify-evo-card"]');
    await page.waitForTimeout(700);

    const state = await page.evaluate(() => {
      const raw = localStorage.getItem('league-builder');
      const card = raw ? JSON.parse(raw).state?.cards?.[0] : null;
      return { partnerId: card?.partnerId ?? null, lines: card?.lines?.length ?? 0 };
    });
    expect(state.partnerId, 'the card remembers its partner').not.toBeNull();
    expect(state.lines, 'the partner seats itself when there is room').toBeGreaterThan(0);
  });

  test('the ace is twice the partner', { tag: '@viewport' }, async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    const { halves } = await slotGeometry(page);
    const ace = halves.find((h) => h.id === 'slot-ace')!;
    const partner = halves.find((h) => h.id === 'slot-partner')!;
    expect(Math.abs(ace.sprite - 2 * partner.sprite), 'the ace is 2x').toBeLessThanOrEqual(1);
  });

  for (const [state, aceId, partnerId] of [
    ['empty', null, null],
    ['ace only', 95, null],
    ['partner only', null, 25],
    ['both', 95, 25],
  ] as const) {
    test(`the partner caption centres on the partner square: ${state}`, { tag: '@viewport' }, async ({ page }) => {
      await pairLeague(page, aceId, partnerId);
      await page.goto('/custom-gym-leader');
      await page.waitForSelector('[data-testid="league-slot-0"]');
      await page.click('[data-testid="league-slot-0"]');
      await page.waitForSelector('[data-testid="slot-tm"]');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      const got = await page.evaluate(() => {
        const half = document.querySelector('[data-slot-half="partner"]')!;
        const art = half.querySelector('[data-slot-art]')!.getBoundingClientRect();
        const lines = [...half.querySelectorAll('[data-slot-head] > span, [data-slot-name]')]
          .filter((el) => (el.textContent ?? '').trim() !== '')
          .map((el) => el.getBoundingClientRect());
        const top = Math.min(...lines.map((r) => r.top));
        const bottom = Math.max(...lines.map((r) => r.bottom));
        return { lines: lines.length, off: (top + bottom) / 2 - (art.top + art.bottom) / 2 };
      });
      expect(got.lines, 'the heading, and the name only when there is one').toBe(partnerId === null ? 2 : 3);
      expect(Math.abs(got.off), `the caption's centre is ${got.off.toFixed(2)}px off the partner's`).toBeLessThanOrEqual(0.5);
    });
  }

  for (const { lang, ace: aceId, partner: partnerId } of WIDEST) {
    test(`the widest names and the headings keep off the seam, the sprites and each other: ${lang}`, { tag: '@viewport' }, async ({ page }, testInfo) => {
      const species = readJson(`src/i18n/names/${lang}.json`).species as string[];
      await pairLeague(page, aceId, partnerId);
      await page.goto(`/custom-gym-leader?lang=${lang}`);
      await page.waitForSelector('[data-testid="league-slot-0"]');
      await page.click('[data-testid="league-slot-0"]');
      await expect(page.locator('[data-slot-name="partner"]')).toHaveText(species[partnerId - 1]);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800);

      const got = await page.evaluate(() => {
        const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
        const p = pane.getBoundingClientRect();
        const zoom = p.width / pane.offsetWidth;
        const W = pane.offsetWidth;
        const H = pane.offsetHeight;
        type Box = { x: number; y: number; w: number; h: number };
        const rel = (r: DOMRect): Box => ({
          x: (r.left - p.left) / zoom, y: (r.top - p.top) / zoom, w: r.width / zoom, h: r.height / zoom,
        });
        const line = pane.querySelector('svg line')!;
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2']
          .map((k, i) => (Number(line.getAttribute(k)) / 100) * (i % 2 ? H : W));
        const seamY = (x: number) => y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
        const lines = (el: Element): Box[] => {
          const out: Box[] = [];
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          const range = document.createRange();
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!(n.textContent ?? '').trim() || n.parentElement?.closest('.sr-only')) continue;
            range.selectNodeContents(n);
            for (const r of range.getClientRects()) {
              let left = r.left;
              let right = r.right;
              for (let ancestor = n.parentElement; ancestor && el.contains(ancestor); ancestor = ancestor.parentElement) {
                if (!['hidden', 'clip'].includes(getComputedStyle(ancestor).overflowX)) continue;
                const clip = ancestor.getBoundingClientRect();
                left = Math.max(left, clip.left);
                right = Math.min(right, clip.right);
              }
              if (right - left > 0.5) out.push(rel(new DOMRect(left, r.top, right - left, r.height)));
            }
          }
          out.push(...[...el.querySelectorAll('svg')].map(svg => rel(svg.getBoundingClientRect())));
          return out;
        };
        const half = (h: string) => {
          const root = pane.querySelector(`[data-slot-half="${h}"]`)!;
          const name = root.querySelector<HTMLElement>('[data-slot-name]')!;
          return {
            art: rel(root.querySelector('[data-slot-art]')!.getBoundingClientRect()),
            runs: [...lines(root.querySelector('[data-slot-head]')!), ...lines(name)],
            namePx: parseFloat(getComputedStyle(name).fontSize),
            // platform: Range geometry includes clipped screen-reader text, so each visible text node is checked against its truncating ancestors.
            clipped: (() => {
              const range = document.createRange();
              const walker = document.createTreeWalker(name, NodeFilter.SHOW_TEXT);
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (!(n.textContent ?? '').trim() || n.parentElement?.closest('.sr-only')) continue;
                range.selectNodeContents(n);
                const ink = range.getBoundingClientRect();
                for (let ancestor = n.parentElement; ancestor && name.contains(ancestor); ancestor = ancestor.parentElement) {
                  if (ancestor !== name && !['hidden', 'clip'].includes(getComputedStyle(ancestor).overflowX)) continue;
                  const box = ancestor.getBoundingClientRect();
                  if (ink.left < box.left - 0.25 || ink.right > box.right + 0.25) return true;
                }
              }
              const box = name.getBoundingClientRect();
              return [...name.querySelectorAll('svg')].some(svg => {
                const ink = svg.getBoundingClientRect();
                return ink.left < box.left - 0.25 || ink.right > box.right + 0.25;
              });
            })(),
            hiddenRuns: [...name.querySelectorAll('.sr-only')].map(el => {
              const range = document.createRange();
              range.selectNodeContents(el);
              return rel(range.getBoundingClientRect());
            }),
          };
        };
        const ace = half('ace');
        const partner = half('partner');
        const hit = (a: Box, b: Box) =>
          a.x < b.x + b.w - 0.25 && a.x + a.w > b.x + 0.25 && a.y < b.y + b.h - 0.25 && a.y + a.h > b.y + 0.25;
        const faults: string[] = [];
        let crossings = 0;
        for (const [side, mine, other] of [['ace', ace, partner], ['partner', partner, ace]] as const) {
          for (const r of mine.runs) {
            const at = `${side} line at ${r.x.toFixed(1)},${r.y.toFixed(1)}`;
            if (r.x < -0.5 || r.y < -0.5 || r.x + r.w > W + 0.5 || r.y + r.h > H + 0.5) faults.push(`${at} leaves the pane`);
            if (hit(r, ace.art) || hit(r, partner.art)) faults.push(`${at} is on a sprite`);
            if (other.runs.some((o) => hit(r, o))) faults.push(`${at} is on the other caption`);
            const gap = Math.min(...[r.x, r.x + r.w].flatMap((x) => [r.y, r.y + r.h].map((y) => (
              side === 'ace' ? seamY(x) - y : y - seamY(x)))));
            if (gap < 0) crossings += 1;
          }
        }
        const drawn = (h: string) => [...pane.querySelectorAll(`[data-slot-half="${h}"] [data-slot-head] > span`)]
          .map((el) => el.textContent ?? '');
        return {
          heads: { ace: drawn('ace'), partner: drawn('partner') },
          pane: { W, H, zoom }, seam: [x1, y1, x2, y2], faults, crossings,
          rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
          ace: { namePx: ace.namePx, clipped: ace.clipped, visibleRuns: ace.runs, hiddenRuns: ace.hiddenRuns },
          partner: { namePx: partner.namePx, clipped: partner.clipped, visibleRuns: partner.runs, hiddenRuns: partner.hiddenRuns },
        };
      });
      await testInfo.attach('widest-names.json', { body: JSON.stringify(got, null, 2), contentType: 'application/json' });
      expect(got.heads.ace).toHaveLength(1);
      expect(got.heads.partner).toHaveLength(2);
      expect(got.heads.ace.join('').replace(/\s+/g, '')).toBe(catalogHeading(lang, 'league.head.ace'));
      expect(got.heads.partner.join('').replace(/\s+/g, '')).toBe(catalogHeading(lang, 'league.head.partner'));
      expect(got.faults, 'every caption line clears the pane edge, the sprites and the other caption').toEqual([]);
      expect(got.ace.namePx).toBeGreaterThanOrEqual(0.4 * got.rem - 0.01);
      expect(got.partner.namePx).toBeGreaterThanOrEqual(0.4 * got.rem - 0.01);
      expect(got.ace.clipped, 'the ace name is whole').toBe(false);
      if (testInfo.project.name !== 'narrow') {
        expect(got.partner.clipped, 'the partner name is whole').toBe(false);
      }
    });
  }

  test('a lone ace keeps the empty partner half and the diagonal', { tag: '@viewport' }, async ({ page }) => {
    await pairLeague(page, 334, null);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="card-cell-1-1"]');
    await page.waitForTimeout(600);

    const got = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
      const art = pane.querySelector<HTMLElement>('[data-slot-art]')!;
      const slot = pane.getBoundingClientRect();
      const box = art.getBoundingClientRect();
      const zoom = slot.width / pane.offsetWidth;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const css = art.offsetWidth;
      return {
        mode: pane.dataset.showcase,
        seam: !!pane.querySelector('svg line[vector-effect="non-scaling-stroke"]'),
        arts: pane.querySelectorAll('[data-slot-art] img').length,
        heads: [...pane.querySelectorAll('[data-slot-head]')].map((el) => el.getAttribute('data-slot-head')),
        cx: ((box.left + box.right) / 2 - slot.left) / slot.width,
        cy: ((box.top + box.bottom) / 2 - slot.top) / slot.height,
        rem,
        css,
        attr: Number(pane.dataset.slotSprite),
        twice: Math.abs(box.width / zoom - 2 * 3.25 * rem) < 0.5,
        partner: !!pane.querySelector('[data-testid="slot-partner"]'),
      };
    });
    expect(got.mode, 'one filled seat is still a split pane').toBe('split');
    expect(got.seam, 'the diagonal stays').toBe(true);
    expect(got.arts, 'one sprite').toBe(1);
    expect(got.heads, 'both headings').toEqual(['ace', 'partner']);
    expect(got.partner, 'empty partner half stays').toBe(true);
    expect(got.cx, 'ace stays in its corner').toBeLessThan(0.42);
    expect(got.cy, 'ace stays in its corner').toBeLessThan(0.42);
    expect(got.css).toBeCloseTo(got.attr, 0);
    expect(got.twice, `the ace at ${got.css} pane px is two cell sprites`).toBe(true);

    await page.locator('[data-testid="slot-partner"]').click({ position: { x: 8, y: 8 }, force: true });
    await expect(page.locator('[data-filter-chip="my-dex"]')).toBeVisible();
  });

  test('a lone ace shows the full name inside the pane', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await pairLeague(page, 65, null);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="slot-ace"]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    const got = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
      const cluster = pane.querySelector<HTMLElement>('[data-testid="slot-ace"]')!;
      const name = [...cluster.querySelectorAll('span')].find(
        (el) => /alakaz/i.test(el.textContent ?? '') && el.childElementCount === 0,
      );
      if (!name) {
        return {
          text: '',
          ellipsis: true,
          lastInsidePane: false,
          partner: false,
          seam: false,
          mode: null as string | null,
        };
      }
      const raw = (name.textContent ?? '').replace(/\s+/g, '');
      const cs = getComputedStyle(name);
      const node = [...name.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      let lastInsidePane = false;
      if (node && raw.length > 0) {
        const range = document.createRange();
        range.setStart(node, raw.length - 1);
        range.setEnd(node, raw.length);
        const last = range.getBoundingClientRect();
        const pr = pane.getBoundingClientRect();
        lastInsidePane = last.width > 0.5
          && last.left >= pr.left - 0.5
          && last.right <= pr.right + 0.5
          && last.top >= pr.top - 0.5
          && last.bottom <= pr.bottom + 0.5;
      }
      return {
        text: raw,
        ellipsis: cs.textOverflow === 'ellipsis',
        lastInsidePane,
        partner: !!pane.querySelector('[data-testid="slot-partner"]'),
        seam: !!pane.querySelector('svg line[vector-effect="non-scaling-stroke"]'),
        mode: pane.dataset.showcase ?? null,
      };
    });
    expect(got.text.toUpperCase(), 'the DOM still holds ALAKAZAM').toBe('ALAKAZAM');
    expect(got.ellipsis, 'the name must not clip with an ellipsis').toBe(false);
    expect(got.lastInsidePane, 'the last letter stays inside the pane').toBe(true);
    expect(got.mode, 'one filled seat is still a split pane').toBe('split');
    expect(got.partner, 'empty partner half stays').toBe(true);
    expect(got.seam, 'the diagonal stays').toBe(true);
  });

  test('a lone partner keeps the empty ace half and the diagonal', { tag: '@viewport' }, async ({ page }) => {
    await pairLeague(page, null, 179);
    await page.goto('/custom-gym-leader');
    await page.waitForSelector('[data-testid="league-slot-0"]');
    await page.click('[data-testid="league-slot-0"]');
    await page.waitForSelector('[data-testid="slot-tm"]');
    await page.waitForTimeout(600);

    const got = await page.evaluate(() => {
      const pane = document.querySelector<HTMLElement>('[data-ace-partner-slot]')!;
      const art = pane.querySelector<HTMLElement>('[data-testid="slot-partner"] [data-slot-art]')!;
      const box = art.getBoundingClientRect();
      const slot = pane.getBoundingClientRect();
      return {
        mode: pane.dataset.showcase,
        seam: !!pane.querySelector('svg line[vector-effect="non-scaling-stroke"]'),
        arts: pane.querySelectorAll('[data-slot-art] img').length,
        heads: [...pane.querySelectorAll('[data-slot-head]')].map((el) => el.getAttribute('data-slot-head')),
        cx: ((box.left + box.right) / 2 - slot.left) / slot.width,
        cy: ((box.top + box.bottom) / 2 - slot.top) / slot.height,
        ace: !!pane.querySelector('[data-testid="slot-ace"]'),
      };
    });
    expect(got.mode).toBe('split');
    expect(got.seam).toBe(true);
    expect(got.arts).toBe(1);
    expect(got.heads).toEqual(['ace', 'partner']);
    expect(got.ace).toBe(true);
    expect(got.cx, 'partner stays in its corner').toBeGreaterThan(0.58);
    expect(got.cy, 'partner stays in its corner').toBeGreaterThan(0.58);
  });
});
