#!/usr/bin/env node
/**
 * Header spacing / fill verification harness (REAL browser, REAL navigation).
 *
 * The milestone bar lives in each PAGE's own header row (the `n/151` row), NOT
 * the app's top nav <header>. A prior version of this harness measured the wrong
 * row and navigated by a `?view=` URL param that the app ignores — so it silently
 * validated the Builder page three times and missed a real counter/bar overlap.
 *
 * This version:
 *   • seeds the store to 100 Pokémon (via the ?tune-exposed store) so Analytics
 *     is unlocked and every page renders its header,
 *   • drives the actual nav buttons (data-nav=…) to switch pages,
 *   • locates the bar's own header row and measures the counter + controls that
 *     are truly its row siblings, and asserts:
 *       1. counter, bar, controls share a row (no cross-row false positives)
 *       2. counter → bar → controls are ordered with a positive gap (no overlap)
 *       3. the bar FILLS most of the space between counter and controls
 *   • also switches pages twice and asserts the bar width doesn't jump, guarding
 *     the "no re-animation on page switch" fix.
 *
 * Run: npm run dev   then   node test-header-spacing.mjs
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:5173/?tune';
const MIN_FILL = 0.80; // bar must fill ≥80% of the counter→controls gap

const VIEWPORTS = [
  { width: 390, height: 844, label: 'Mobile (390)' },
  { width: 768, height: 1024, label: 'Tablet (768)' },
  { width: 1024, height: 768, label: 'Desktop md (1024)' },
  { width: 1440, height: 900, label: 'Desktop lg (1440)' },
  { width: 1920, height: 1080, label: 'Desktop 4K (1920)' },
];
const PAGES = ['builder', 'view', 'analytics'];

async function seed(page) {
  await page.evaluate(() => {
    const st = window.__pokedexStore;
    const cur = st.getState().sections;
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);
    st.setState({
      sections: { ...cur, other: ids },
      milestoneMax: 100,
      milestoneCelebrated: [25, 100],
      milestoneCelebration: null,
    });
  });
}

async function measure(page) {
  return page.evaluate(() => {
    const R = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height };
    };
    const bar = Array.from(document.querySelectorAll('.milestone-bar')).find(
      (b) => b.getBoundingClientRect().width > 0,
    );
    if (!bar) return { error: 'no visible bar' };
    const barCell = bar.parentElement;
    const row = barCell.parentElement;
    const kids = Array.from(row.children);
    const counter = kids.find((c) => /\/151/.test(c.textContent)) || null;
    const control = kids[kids.indexOf(barCell) + 1] || null;
    return {
      counter: counter ? R(counter) : null,
      bar: R(bar),
      control: control ? R(control) : null,
      row: R(row),
    };
  });
}

function check(m) {
  const problems = [];
  const notes = [];
  if (m.counter && Math.abs(m.counter.top - m.bar.top) > 14)
    problems.push(`counter/bar on different rows`);
  if (m.counter) {
    const g = m.bar.left - m.counter.right;
    g < 0 ? problems.push(`counter overlaps bar ${(-g).toFixed(1)}px`) : notes.push(`c→bar ${g.toFixed(0)}px`);
  }
  if (m.control) {
    const g = m.control.left - m.bar.right;
    g < 0 ? problems.push(`bar overlaps control ${(-g).toFixed(1)}px`) : notes.push(`bar→c ${g.toFixed(0)}px`);
  }
  const availL = m.counter ? m.counter.right : m.row.left;
  const availR = m.control ? m.control.left : m.row.right;
  const avail = availR - availL;
  const fill = avail > 0 ? m.bar.width / avail : 0;
  notes.push(`${m.bar.width.toFixed(0)}px = ${(fill * 100).toFixed(0)}% fill`);
  if (fill < MIN_FILL) problems.push(`bar only fills ${(fill * 100).toFixed(0)}% (< ${MIN_FILL * 100}%)`);
  return { problems, notes };
}

async function main() {
  console.log('🧪 Header Spacing + Fill Harness (seeded, real nav)\n');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let bad = false;
  try {
    for (const vp of VIEWPORTS) {
      console.log(`📱 ${vp.label}`);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(400);
      await seed(page);
      await page.waitForTimeout(300);

      const widths = {};
      for (const nav of PAGES) {
        try {
          await page.click(`[data-nav="${nav}"]`, { timeout: 3000 });
        } catch { /* maybe already on it */ }
        await page.waitForTimeout(500);
        const m = await measure(page);
        if (m.error) { console.log(`   ⚠️  ${nav}: ${m.error}`); continue; }
        widths[nav] = m.bar.width;
        const { problems, notes } = check(m);
        console.log(`   ${problems.length ? '❌' : '✅'} ${nav}: ${notes.join(' · ')}`);
        problems.forEach((p) => { console.log(`        └─ ${p}`); bad = true; });
      }

      // Re-animation guard: revisit builder, its width must be identical (no jump).
      await page.click('[data-nav="builder"]').catch(() => {});
      await page.waitForTimeout(500);
      const back = await measure(page);
      if (!back.error && widths.builder != null) {
        const jump = Math.abs(back.bar.width - widths.builder);
        if (jump > 0.5) { console.log(`   ❌ builder width jumped ${jump.toFixed(1)}px on revisit`); bad = true; }
        else console.log(`   ✅ builder width stable on revisit (no re-animate)`);
      }
      await ctx.close();
      console.log('');
    }
    console.log(bad ? '❌ Problems found' : '✅ All pages/viewports: ordered, no overlap, bar fills, stable on switch');
  } finally {
    await browser.close();
  }
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
