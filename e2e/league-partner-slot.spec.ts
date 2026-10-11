import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { en } from '../src/i18n/catalogs/en';
import { blankLeague, fiveLineCardLeague, pairLeague } from './support/leagueSeed';

/**
 * Each shipped locale with its two widest species names in the caption face,
 * as the ace and the partner. German Gumshoos and Oranguru, MANGUSPEKTOR and
 * KOMMANDUTAN, are the widest in any locale.
 */
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

/** A heading as its locale's catalog words it, for comparing with what is drawn. */
function catalogHeading(lang: string, key: 'league.head.ace' | 'league.head.partner'): string {
  const text = lang === 'en' ? en[key] : readJson(`src/i18n/catalogs/ui/${lang}.json`)[key] as string;
  return text.replace(/\s+/g, '').toLocaleUpperCase(lang);
}

/**
 * The ace and the partner share the card's top-left slot, split by a diagonal.
 *
 * The partner is a team sprite on the column of cells below it, and the ace
 * is twice it on the pane's top-left cells. The captions' fit and the seam
 * are read from the drawn text (`showcaseLayout.ts`), so this spec measures
 * the drawn text too.
 */

const openCard = async (page: Page) => {
  await page.goto('/custom-gym-leader');
  await page.waitForSelector('[data-testid="league-slot-0"]');
  await page.click('[data-testid="league-slot-0"]');
  await page.waitForSelector('[data-testid="card-cell-1-1"]');
  await page.waitForTimeout(600);
};

/** Each half's sprite square, in shares of the slot, and what it paints. */
async function slotGeometry(page: Page) {
  return page.evaluate(() => {
    const seam = document.querySelector('svg line[vector-effect="non-scaling-stroke"]')!;
    const slot = seam.closest('div')!;
    const s = slot.getBoundingClientRect();
    const halves = ['slot-ace', 'slot-partner'].map((id) => {
      const half = slot.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      // The square the geometry reserves, which both states draw inside — the
      // ball and the sprite when filled, the placeholder when not. Comparing
      // a filled half's sprite against a null is how this spec once
      // "measured" a 50px difference between two halves that were in fact the
      // same size.
      const r = half.querySelector<HTMLElement>('[data-slot-art]')!.getBoundingClientRect();
      const sprite = r.width;
      const box = {
        left: r.left + r.width / 2 - sprite / 2,
        top: r.top + r.height / 2 - sprite / 2,
      };
      // Every line of caption text the half paints, so no word can leave
      // the slot unnoticed. The sprites may reach past it, as the cell
      // sprites reach past their cells.
      const runs = [...half.querySelectorAll<HTMLElement>('[data-slot-head], [data-slot-name]')]
        .map((el) => el.getBoundingClientRect())
        .filter((v) => v.width > 1);
      // The empty state's placeholder ball, and how far past the seam it
      // reaches. Negative is clear of it.
      const disc = half.querySelector<HTMLElement>('[data-slot-ring]')?.getBoundingClientRect();
      // Both ends off the drawn line, because the seam is no longer a
      // corner-to-corner diagonal: it runs at the placeholder ball's own 30
      // degrees, through the middle of the slot.
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
      // The slot's own size, so a share can be read back as pixels.
      slot: { width: s.width, height: s.height },
      // A team cell, which is the sprite the pair is judged against.
      team: document.querySelector('[data-testid="card-cell-1-1"] img')?.getBoundingClientRect().width ?? null,
      // The two sprites are allowed to cross at the corner, where a sprite
      // carries its transparent margin. How much they cross is the number.
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
    // "It is fine if they cross a tiny bit" is the design, so the check is on
    // how much: a corner, not a bite out of either sprite.
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
      // A sprite may cross the seam at its corner, which is its own
      // transparent margin. A drawn circle is ink the whole way round, so it
      // has no corner to spend and stops short instead.
      expect(half.ring, `${half.id} draws a placeholder when empty`).not.toBeNull();
      expect(half.ringPastSeam!, `${half.id} placeholder reaches past the seam`).toBeLessThan(0);
    }
  });

  test('the partner is a cell sprite on the column below it, and the ace twice it', { tag: '@viewport' }, async ({ page }, testInfo) => {
    // Five lines fill the Gym 8, Elite Four, Champion and Endgame cells
    // under the pane's right column.
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
      // The column under the pane's right cell, and the pane's bottom row.
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

    /**
     * Each half's heading and name, offset from the half's own top-left, in
     * the slot's own pixels.
     *
     * Divided by the card's zoom, because the card re-fits itself to its
     * content and its content changes here: an empty card's hints are not a
     * filled card's, and at 320px one of them wraps. Read on the screen,
     * every run would move by the change of scale and the check would be
     * about the fit; read in layout pixels it is about the slot.
     */
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

    /**
     * The partner caption's drawn lines, and how far their centre sits from
     * the partner square's, in the slot's own pixels.
     */
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

    // The partner's caption centres on its square either way: PARTNER /
    // SHOULDERMON alone while it is empty, and those two lines with the name
    // once it is filled. No line is kept for a name that is not there.
    expect(emptyPartner.lines, 'an empty partner draws its heading only').toBe(2);
    expect(Math.abs(emptyPartner.off), `the empty caption is ${emptyPartner.off.toFixed(2)}px off centre`).toBeLessThanOrEqual(0.5);
    expect(filledPartner.lines, 'a filled partner adds its name').toBe(3);
    expect(Math.abs(filledPartner.off), `the filled caption is ${filledPartner.off.toFixed(2)}px off centre`).toBeLessThanOrEqual(0.5);

    // The ace's heading sits under its square, so a name arriving below it
    // moves none of the runs the empty half had. A tenth of a pixel, not a
    // whole one: the runs are measured against the half's own box, and
    // nothing inside it should move at all. This does not see the pane's own
    // outline -- the half moves with it -- so a border that shifts the whole
    // pane is the card-slots spec's job, not this one's.
    empty[0].forEach((top, i) => {
      expect(Math.abs(filled[0][i] - top), `ace text run ${i} moved`).toBeLessThanOrEqual(0.1);
    });
  });

  test('a partner is not held to the team, and seats itself when there is room', async ({ page }) => {
    await blankLeague(page);
    await openCard(page);
    await page.click('[data-testid="slot-partner"]');
    await page.waitForSelector('[data-filter-chip="my-dex"]');
    // The ace picker locks to the card's own lines once the card is full; the
    // partner picker never does, so nothing here should be restricted.
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
    // An empty card has room, so the same pick also fills a line.
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
        // The caption's drawn lines: the heading's two, and the name's when
        // there is one.
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
      // The fit settles over a few frames once the names land.
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
        // Each line of text as drawn, clipped where its element clips it.
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
          // Form markers are visible SVGs; their aria-hidden wrapper does not hide their paint.
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
            // Range geometry includes clipped screen-reader text. Check each
            // visible text node against its own truncating ancestors instead.
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
            // Text may cross the seam, which fades next to the letters; only
            // count how often it does.
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
      // The ace's heading is one line and the partner's two, each worded as
      // the locale's catalog words it.
      expect(got.heads.ace).toHaveLength(1);
      expect(got.heads.partner).toHaveLength(2);
      expect(got.heads.ace.join('').replace(/\s+/g, '')).toBe(catalogHeading(lang, 'league.head.ace'));
      expect(got.heads.partner.join('').replace(/\s+/g, '')).toBe(catalogHeading(lang, 'league.head.partner'));
      expect(got.faults, 'every caption line clears the pane edge, the sprites and the other caption').toEqual([]);
      // A long name shrinks, but never under the 0.4rem floor the TM and badge
      // labels hold.
      expect(got.ace.namePx).toBeGreaterThanOrEqual(0.4 * got.rem - 0.01);
      expect(got.partner.namePx).toBeGreaterThanOrEqual(0.4 * got.rem - 0.01);
      expect(got.ace.clipped, 'the ace name is whole').toBe(false);
      // The last resort is an ellipsis, and only the narrowest pane, a 320px
      // phone that lays the card out at full height, needs it: there the
      // partner has 3.2rem beside it and KOMMANDUTAN is 3.5rem at the floor.
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
        // The ace square's centre, in shares of the pane.
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
    // A lone ace does not centre itself: it stays on the pane's top-left
    // cells.
    expect(got.cx, 'ace stays in its corner').toBeLessThan(0.42);
    expect(got.cy, 'ace stays in its corner').toBeLessThan(0.42);
    expect(got.css).toBeCloseTo(got.attr, 0);
    expect(got.twice, `the ace at ${got.css} pane px is two cell sprites`).toBe(true);

    await page.locator('[data-testid="slot-partner"]').click({ position: { x: 8, y: 8 }, force: true });
    await expect(page.locator('[data-filter-chip="my-dex"]')).toBeVisible();
  });

  test('a lone ace shows the full name inside the pane', async ({ page }) => {
    // Squat phone is where the sprite-width cap cuts ALAKAZAM. CSS truncate
    // keeps the full string in the DOM, so this check reads paint: no
    // ellipsis, and the last letter's box inside the pane.
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
        // The partner square's centre, in shares of the pane.
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
