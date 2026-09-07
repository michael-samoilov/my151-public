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

/**
 * Three tools ship today. The favorite picker returns as a fourth, and when it
 * does this number changes with it — the page reads the count and lays itself
 * out from that, so a stale number here would pass while the page is wrong.
 */
const CARDS = 3;

type Problem = string;

test.describe('home page responsive sweep', () => {
  for (const width of WIDTHS) {
    test(`layout holds at ${width}px`, async ({ page }) => {
      const height = width < 600 ? Math.round(width * 2.1) : width < 1024 ? Math.round(width * 1.33) : 900;
      await page.setViewportSize({ width, height });
      await page.goto('/?home');
      await page.waitForLoadState('networkidle');

      const problems = await page.evaluate((cardCount): Problem[] => {
        const fail: Problem[] = [];
        const R = (e: Element) => e.getBoundingClientRect();
        const root = document.documentElement;
        const grid = document.querySelector('main > div.grid');
        const cards = grid ? [...grid.children] : [];
        const desktop = window.innerWidth >= 1024;
        if (cards.length !== cardCount) fail.push(`expected ${cardCount} cards, found ${cards.length}`);

        // 1. The page may grow downward and scroll. It may never scroll sideways.
        if (root.scrollWidth - root.clientWidth > 0.5) {
          fail.push(`h-overflow ${root.scrollWidth} > ${root.clientWidth}`);
        }

        // 2. The footer starts below the fold at every size. What a visitor
        // sees before scrolling is the header, the hero and the grid — the
        // footer is something they scroll to, never part of the first screen.
        const footer = document.querySelector('main')?.parentElement?.nextElementSibling;
        if (!footer) {
          fail.push('footer not found after the fold block');
        } else if (R(footer).top < window.innerHeight - 0.5) {
          fail.push(`footer top at ${R(footer).top.toFixed(1)}, above the ${window.innerHeight}px fold`);
        }

        // 3. Panels in one row share a top edge, which is what puts the first
        // line of every title in that row on one baseline. The overhang reserve
        // is shared across a row for exactly this reason, so a row that mixes a
        // card with artwork and one without still lines up. Cells whose tops
        // match are one row; their panels must match too.
        const rows = new Map<number, number[]>();
        cards.forEach((cell) => {
          const panel = cell.querySelector('[data-card-panel]');
          if (!panel) return;
          const key = Math.round(R(cell).top);
          rows.set(key, [...(rows.get(key) ?? []), R(panel).top]);
        });
        for (const [cellTop, tops] of rows) {
          const spread = Math.max(...tops) - Math.min(...tops);
          if (spread > 0.5) fail.push(`row at ${cellTop}: panel tops differ by ${spread.toFixed(1)}px`);
        }

        // 4. No two cards touch.
        for (let i = 0; i < cards.length; i += 1) {
          for (let j = i + 1; j < cards.length; j += 1) {
            const a = R(cards[i]);
            const b = R(cards[j]);
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 0.5 && oy > 0.5) fail.push(`cards ${i}/${j} overlap ${ox.toFixed(1)}x${oy.toFixed(1)}`);
          }
        }

        // 5. The call to action is the wide bar below the desktop breakpoint and
        // an ordinary card at or above it. The two are different markup, and
        // exactly one of them mounts, so the caption is the tell: the bar keeps
        // its copy inside the panel and has none.
        const wide = cards.filter((cell) => !cell.querySelector('h2'));
        if (desktop && wide.length) fail.push(`${wide.length} cards have no caption at desktop width`);
        if (!desktop) {
          if (wide.length !== 1) fail.push(`expected 1 wide bar on a phone, found ${wide.length}`);
          wide.forEach((cell) => {
            const spread = R(grid!).width - R(cell).width;
            if (spread > 0.5) fail.push(`the wide bar is ${spread.toFixed(1)}px short of the grid`);
          });
        }

        cards.forEach((cell, i) => {
          // The red panel, not the cell: the cell also holds the overhang, so a
          // structural selector picks the wrapper instead.
          const panel = cell.querySelector('[data-card-panel]');
          if (!panel) {
            fail.push(`card ${i} is missing its panel`);
            return;
          }
          const c = R(panel);
          const h2 = cell.querySelector('h2');
          const p = cell.querySelector('h2 + p');

          // 6. Copy fits. A caption's title stays on one line and its blurb is
          // never clipped; the wide bar's copy stays inside the panel it sits
          // in. A block reports one client rect whatever it does, so the line
          // count comes from the text range.
          if (h2 && p) {
            const range = document.createRange();
            range.selectNodeContents(h2);
            const lines = range.getClientRects().length;
            const text = range.getBoundingClientRect().width;
            if (lines > 1) fail.push(`card ${i} title wrapped to ${lines} lines`);
            if (text - R(h2).width > 0.5) fail.push(`card ${i} title overruns by ${(text - R(h2).width).toFixed(1)}`);
            if (p.scrollHeight - p.clientHeight > 0.5) {
              fail.push(`card ${i} blurb clipped by ${p.scrollHeight - p.clientHeight}`);
            }
          } else {
            [...panel.querySelectorAll('span > span')].forEach((line, k) => {
              const r = R(line);
              if (r.right > c.right + 0.5 || r.bottom > c.bottom + 0.5) {
                fail.push(`card ${i} bar copy ${k} escapes its panel`);
              }
            });
          }

          // 7. Artwork never reaches the card's right edge: a bare red strip has
          // to remain, or the screenshot reads as clipped there.
          [...cell.querySelectorAll('img')].forEach((img, k) => {
            const strip = c.right - R(img).right;
            if (strip < c.width * 0.08) {
              fail.push(`card ${i} shot ${k} leaves only ${strip.toFixed(1)}px of strip`);
            }
          });

          // 8. Artwork breaks out of the panel's top and left, so it has to
          // clear both the card above it and the window's own left edge.
          [...cell.querySelectorAll('img')].forEach((img, k) => {
            const r = R(img);
            if (r.left < -0.5) fail.push(`card ${i} shot ${k} runs ${(-r.left).toFixed(1)}px off the left edge`);
            cards.forEach((other, j) => {
              if (other === cell) return;
              const o = R(other);
              if (o.bottom <= R(cell).top + 0.5) {
                const ox = Math.min(o.right, r.right) - Math.max(o.left, r.left);
                const oy = Math.min(o.bottom, r.bottom) - Math.max(o.top, r.top);
                if (ox > 0.5 && oy > 0.5) fail.push(`card ${i} shot ${k} lands on card ${j}`);
              }
            });
          });

          // 9. A card with no artwork carries the build mark instead. It stays
          // wholly inside its panel, and where it is the only thing in there it
          // sits centred. Centred means the two centres agree — not equal air on
          // every side, which a panel wider than it is tall never has.
          const badge = cell.querySelector('[data-card-badge]');
          const mark = badge?.querySelector('svg');
          if (badge && mark) {
            const s = R(mark);
            if (s.top < c.top - 0.5 || s.bottom > c.bottom + 0.5) fail.push(`card ${i} mark escapes its panel`);
            if (h2) {
              const dx = (s.left + s.right) / 2 - (c.left + c.right) / 2;
              const dy = (s.top + s.bottom) / 2 - (c.top + c.bottom) / 2;
              if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                fail.push(`card ${i} mark is off centre by ${dx.toFixed(1)}/${dy.toFixed(1)}px`);
              }
            }
          }
        });

        // 10. The band's own knobs resolve to what the band intends. This repo
        // sets `--breakpoint-md: 1024px`, and Tailwind sorts that px value ahead
        // of `sm`'s 40rem, so it emits the md block FIRST: a bare `sm:` utility
        // silently beats its own `md:` override above 1024px. That is invisible
        // to every geometric check here — the page still looks plausible — so
        // the one place the page uses all three bands gets its own assertion.
        // A media query's rem is the initial 16px, not the root font-size knob,
        // so `sm` is 640px whatever that knob has done.
        const main = document.querySelector('main')!;
        const pad = (parseFloat(getComputedStyle(main).paddingLeft) / window.innerWidth) * 100;
        const wantPad = desktop ? 5.6 : window.innerWidth >= 640 ? 5.3 : 4;
        if (Math.abs(pad - wantPad) > 0.05) {
          fail.push(`gutter is ${pad.toFixed(2)}%, expected ${wantPad}% at ${window.innerWidth}px`);
        }

        // 11. Hero copy stays inside the frame and breaks rather than overrunning.
        const hero = document.querySelector('main > section');
        [...(hero?.querySelectorAll('h1, p') ?? [])].forEach((e, i) => {
          const r = R(e);
          if (r.left < -0.5 || r.right > root.clientWidth + 0.5) fail.push(`hero text ${i} outside the frame`);
          if (e.scrollWidth - e.clientWidth > 0.5) fail.push(`hero text ${i} overruns its measure`);
        });

        return fail;
      }, CARDS);

      expect(problems, `layout problems at ${width}px`).toEqual([]);
    });
  }
});
