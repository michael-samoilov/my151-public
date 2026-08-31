import { test, expect } from '@playwright/test';

/**
 * Width sweep for the router page at `?home`.
 *
 * The page has no fixed breakpoint layout to eyeball: every card measurement is
 * a share of the card's own width, so the widths *between* the design sizes are
 * where a mistake hides. This drives 20 of them and reads geometry, never text,
 * so a copy change never breaks it.
 *
 * The same checks run against the mockup generator in
 * `docs/future-tools/home-page/sweep.mjs`, which sweeps 45 frames and carries a
 * mutation test proving the checks can fail.
 */
const WIDTHS = [
  320, 360, 375, 390, 414, 428, 540, 600, 700, 768, 800, 834, 900, 1000, 1023,
  1024, 1180, 1280, 1440, 1920,
];

type Problem = string;

test.describe('home page responsive sweep', () => {
  for (const width of WIDTHS) {
    test(`layout holds at ${width}px`, async ({ page }) => {
      const height = width < 600 ? Math.round(width * 2.1) : width < 1024 ? Math.round(width * 1.33) : 900;
      await page.setViewportSize({ width, height });
      await page.goto('/?home');
      await page.waitForLoadState('networkidle');

      const problems = await page.evaluate((): Problem[] => {
        const fail: Problem[] = [];
        const R = (e: Element) => e.getBoundingClientRect();
        const root = document.documentElement;
        const grid = document.querySelector('main > div.grid');
        const cards = grid ? [...grid.children] : [];
        if (cards.length !== 4) fail.push(`expected 4 cards, found ${cards.length}`);

        // 1. The page may grow downward and scroll. It may never scroll sideways.
        if (root.scrollWidth - root.clientWidth > 0.5) {
          fail.push(`h-overflow ${root.scrollWidth} > ${root.clientWidth}`);
        }

        // 2. No two cards touch.
        for (let i = 0; i < cards.length; i += 1) {
          for (let j = i + 1; j < cards.length; j += 1) {
            const a = R(cards[i]);
            const b = R(cards[j]);
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 0.5 && oy > 0.5) fail.push(`cards ${i}/${j} overlap ${ox.toFixed(1)}x${oy.toFixed(1)}`);
          }
        }

        cards.forEach((cell, i) => {
          // The red panel, not the cell: the cell also holds the overhang, so a
          // structural selector picks the wrapper instead.
          const panel = cell.querySelector('[data-card-panel]');
          const h2 = cell.querySelector('h2');
          const p = cell.querySelector('h2 + p');
          if (!panel || !h2 || !p) {
            fail.push(`card ${i} is missing its panel or copy`);
            return;
          }
          const c = R(panel);

          // 3. Each heading stays on one line. A block reports one client rect
          // whatever it does, so the line count comes from the text range.
          const range = document.createRange();
          range.selectNodeContents(h2);
          const lines = range.getClientRects().length;
          const text = range.getBoundingClientRect().width;
          if (lines > 1) fail.push(`card ${i} title wrapped to ${lines} lines`);
          if (text - R(h2).width > 0.5) fail.push(`card ${i} title overruns by ${(text - R(h2).width).toFixed(1)}`);

          // 4. The blurb fits its fixed two-line band.
          if (p.scrollHeight - p.clientHeight > 0.5) {
            fail.push(`card ${i} blurb clipped by ${p.scrollHeight - p.clientHeight}`);
          }

          // 5. Artwork never reaches the card's right edge: a bare red strip has
          // to remain, or the screenshot reads as clipped there.
          [...cell.querySelectorAll('img')].forEach((img, k) => {
            const strip = c.right - R(img).right;
            if (strip < c.width * 0.08) {
              fail.push(`card ${i} shot ${k} leaves only ${strip.toFixed(1)}px of strip`);
            }
          });

          // 6. Artwork must not land on the card above it.
          [...cell.querySelectorAll('img')].forEach((img, k) => {
            cards.forEach((other, j) => {
              if (other === cell) return;
              const o = R(other);
              const r = R(img);
              if (o.bottom <= R(cell).top + 0.5) {
                const ox = Math.min(o.right, r.right) - Math.max(o.left, r.left);
                const oy = Math.min(o.bottom, r.bottom) - Math.max(o.top, r.top);
                if (ox > 0.5 && oy > 0.5) fail.push(`card ${i} shot ${k} lands on card ${j}`);
              }
            });
          });

          // 7. The build mark stays wholly inside its own card, with matching
          // air above it and below it.
          const svg = cell.querySelector('svg');
          if (svg) {
            const s = R(svg);
            if (s.top < c.top - 0.5 || s.bottom > c.bottom + 0.5) fail.push(`card ${i} mark escapes its card`);
            const above = s.top - c.top;
            const below = R(h2).top - s.bottom;
            if (Math.abs(above - below) > 2) {
              fail.push(`card ${i} mark air ${above.toFixed(1)} above vs ${below.toFixed(1)} below`);
            }
          }
        });

        // 8. Hero copy stays inside the frame and breaks rather than overrunning.
        const hero = document.querySelector('main > section');
        [...(hero?.querySelectorAll('h1, p') ?? [])].forEach((e, i) => {
          const r = R(e);
          if (r.left < -0.5 || r.right > root.clientWidth + 0.5) fail.push(`hero text ${i} outside the frame`);
          if (e.scrollWidth - e.clientWidth > 0.5) fail.push(`hero text ${i} overruns its measure`);
        });

        return fail;
      });

      expect(problems, `layout problems at ${width}px`).toEqual([]);
    });
  }
});
