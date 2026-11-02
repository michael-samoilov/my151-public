import { test, expect } from '@playwright/test';

const WIDTHS = [
  320, 360, 375, 390, 414, 428, 540, 600, 700, 768, 800, 834, 900, 1000, 1023,
  1024, 1180, 1280, 1299, 1300, 1440, 1920,
];

const CARDS = 4;

type Problem = string;

test.describe('home page responsive sweep', () => {
  for (const width of WIDTHS) {
    test(`layout holds at ${width}px`, async ({ page }) => {
      const height = width < 600 ? Math.round(width * 2.1) : width < 1024 ? Math.round(width * 1.33) : 900;
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const problems = await page.evaluate((cardCount): Problem[] => {
        const fail: Problem[] = [];
        const R = (e: Element) => e.getBoundingClientRect();
        const root = document.documentElement;
        const grid = document.querySelector('main > div.grid');
        const cards = grid ? [...grid.children] : [];
        const desktop = window.innerWidth >= 1024;
        if (cards.length !== cardCount) fail.push(`expected ${cardCount} cards, found ${cards.length}`);

        if (root.scrollWidth - root.clientWidth > 0.5) {
          fail.push(`h-overflow ${root.scrollWidth} > ${root.clientWidth}`);
        }

        const footer = document.querySelector('main')?.parentElement?.nextElementSibling;
        if (!footer) {
          fail.push('footer not found after the fold block');
        } else if (R(footer).top < window.innerHeight - 0.5) {
          fail.push(`footer top at ${R(footer).top.toFixed(1)}, above the ${window.innerHeight}px fold`);
        }

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

        for (let i = 0; i < cards.length; i += 1) {
          for (let j = i + 1; j < cards.length; j += 1) {
            const a = R(cards[i]);
            const b = R(cards[j]);
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 0.5 && oy > 0.5) fail.push(`cards ${i}/${j} overlap ${ox.toFixed(1)}x${oy.toFixed(1)}`);
          }
        }

        const wide = cards.filter((cell) => !cell.querySelector('[data-card-title]'));
        if (desktop && wide.length) fail.push(`${wide.length} cards have no caption at desktop width`);
        if (!desktop) {
          const wantWide = cardCount % 2 === 1 ? 1 : 0;
          if (wide.length !== wantWide) fail.push(`expected ${wantWide} wide bar on a phone, found ${wide.length}`);
          wide.forEach((cell) => {
            const spread = R(grid!).width - R(cell).width;
            if (spread > 0.5) fail.push(`the wide bar is ${spread.toFixed(1)}px short of the grid`);
          });
        }

        cards.forEach((cell, i) => {
          const panel = cell.querySelector('[data-card-panel]');
          if (!panel) {
            fail.push(`card ${i} is missing its panel`);
            return;
          }
          const c = R(panel);
          const images = [...cell.querySelectorAll('img')].filter(img => img.getClientRects().length > 0);
          const h2 = cell.querySelector('[data-card-title]');
          const p = cell.querySelector('[data-card-title] + p');

          if (h2 && p) {
            const range = document.createRange();
            range.selectNodeContents(h2);
            const text = range.getBoundingClientRect().width;
            if (h2.scrollHeight - h2.clientHeight > 0.5) {
              fail.push(`card ${i} title clipped by ${h2.scrollHeight - h2.clientHeight}`);
            }
            for (const line of range.getClientRects()) {
              const title = R(h2);
              if (line.left < title.left - 0.5 || line.right > title.right + 0.5
                || line.top < title.top - 0.5 || line.bottom > title.bottom + 0.5) {
                fail.push(`card ${i} title text escapes its caption`);
              }
            }
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

          images.forEach((img, k) => {
            const sheet = img.parentElement!;
            const box = R(sheet);
            const style = getComputedStyle(sheet);
            const matrix = new DOMMatrix(style.transform);
            const w = parseFloat(style.width);
            const h = parseFloat(style.height);
            const points = [[-w / 2, -h / 2], [w / 2, -h / 2],
              [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({
              x: box.left + box.width / 2 + matrix.a * x + matrix.c * y,
              y: box.top + box.height / 2 + matrix.b * x + matrix.d * y,
            }));
            const visible = points.filter(p => p.y <= c.bottom);
            points.forEach((a, j) => {
              const b = points[(j + 1) % points.length];
              if ((a.y < c.bottom) !== (b.y < c.bottom)) {
                visible.push({ x: a.x + (c.bottom - a.y) * (b.x - a.x) / (b.y - a.y), y: c.bottom });
              }
            });
            const strip = c.right - Math.max(...visible.map(p => p.x));
            if (strip < c.width * 0.04) {
              fail.push(`card ${i} shot ${k} leaves only ${strip.toFixed(1)}px of strip`);
            }
          });

          images.forEach((img, k) => {
            const short = c.bottom - R(img).bottom;
            if (short > 0.5) fail.push(`card ${i} shot ${k} stops ${short.toFixed(1)}px above the panel's edge`);
          });

          images.forEach((img, k) => {
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

        // platform: Tailwind sorts the px md breakpoint ahead of sm's 40rem, so a bare sm: utility beats its md: override above 1024px.
        const main = document.querySelector('main')!;
        const pad = (parseFloat(getComputedStyle(main).paddingLeft) / window.innerWidth) * 100;
        const wantPad = desktop ? 5.6 : window.innerWidth >= 640 ? 5.3 : 4;
        if (Math.abs(pad - wantPad) > 0.05) {
          fail.push(`gutter is ${pad.toFixed(2)}%, expected ${wantPad}% at ${window.innerWidth}px`);
        }

        const hero = document.querySelector('main > section');
        [...(hero?.querySelectorAll('h1, p') ?? [])].forEach((e, i) => {
          const r = R(e);
          if (r.left < -0.5 || r.right > root.clientWidth + 0.5) fail.push(`hero text ${i} outside the frame`);
          if (e.scrollWidth - e.clientWidth > 0.5) fail.push(`hero text ${i} overruns its measure`);
        });

        if (desktop && grid) {
          const tracks = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean);
          const wantTracks = window.innerWidth >= 1300 ? cardCount : 2;
          if (tracks.length !== wantTracks) {
            fail.push(`desktop grid has ${tracks.length} columns, expected ${wantTracks}`);
          }
          if (cards.length) {
            const g = R(grid);
            const firstLeft = Math.min(...cards.map((c) => R(c).left));
            const lastRight = Math.max(...cards.map((c) => R(c).right));
            if (Math.abs(firstLeft - g.left) > 1) fail.push(`row not flush left: ${(firstLeft - g.left).toFixed(1)}px`);
            if (Math.abs(g.right - lastRight) > 1) fail.push(`row not flush right: ${(g.right - lastRight).toFixed(1)}px`);
          }
        }

        if (desktop) {
          cards.forEach((cell, i) => {
            const panel = cell.querySelector('[data-card-panel]');
            if (!panel) return;
            const c = R(panel);
            if (c.width < c.height * 2) {
              fail.push(`card ${i} panel is ${c.width.toFixed(0)}x${c.height.toFixed(0)}, not a wide band`);
            }
          });
        }

        document.querySelectorAll('.hub-stage').forEach((stage, i) => {
          const clip = R(stage.children[0]);
          stage.querySelectorAll('[data-shot]').forEach((shot, k) => {
            const room = clip.right - R(shot).right;
            if (room < 16) fail.push(`card ${i} shot ${k} shadow cut ${(16 - room).toFixed(1)}px short`);
          });
        });

        return fail;
      }, CARDS);

      expect(problems, `layout problems at ${width}px`).toEqual([]);
    });
  }
});
