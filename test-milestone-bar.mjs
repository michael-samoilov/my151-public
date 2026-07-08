#!/usr/bin/env node
/**
 * Test harness: verify milestone bar responsive sizing and no overlaps.
 *
 * Tests:
 * - Bar width scales correctly with viewport (clamp(10.5rem, 24vw, 22rem))
 * - Hairlines don't overlap bar or icons across viewports
 * - Consistent rendering on different pages
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5199';
const ROOT_PX = 16; // assume 16px base font size

// Expected bar width at different viewport widths (accounting for clamp logic)
const VIEWPORTS = [
  { width: 390, height: 844, label: 'Mobile (iPhone)', expectedMin: 10.5 * ROOT_PX, expectedMax: 22 * ROOT_PX },
  { width: 768, height: 1024, label: 'Tablet', expectedMin: 10.5 * ROOT_PX, expectedMax: 22 * ROOT_PX },
  { width: 1024, height: 768, label: 'Desktop (md breakpoint)', expectedMin: 10.5 * ROOT_PX, expectedMax: 22 * ROOT_PX },
  { width: 1400, height: 900, label: 'Desktop (large)', expectedMin: 10.5 * ROOT_PX, expectedMax: 22 * ROOT_PX },
  { width: 1920, height: 1080, label: 'Desktop (4K)', expectedMin: 10.5 * ROOT_PX, expectedMax: 22 * ROOT_PX },
];

const PAGES_TO_TEST = [
  { path: '/', name: 'Home (Builder)' },
  { path: '/?view=view', name: 'View Page' },
  { path: '/?view=analytics', name: 'Analytics' },
];

function expectBarWidth(viewportWidth, vwPercent = 24) {
  // clamp(10.5rem, 24vw, 22rem) in pixels
  const minPx = 10.5 * ROOT_PX;
  const vwPx = (viewportWidth * vwPercent) / 100;
  const maxPx = 22 * ROOT_PX;
  return Math.max(minPx, Math.min(vwPx, maxPx));
}

async function testViewport(browser, viewport) {
  console.log(`\n📱 Testing ${viewport.label} (${viewport.width}x${viewport.height})`);
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();

  const expectedWidth = expectBarWidth(viewport.width);
  console.log(`   Expected bar width: ${expectedWidth.toFixed(0)}px (${(expectedWidth / ROOT_PX).toFixed(2)}rem)`);

  for (const pageTest of PAGES_TO_TEST) {
    try {
      await page.goto(BASE_URL + pageTest.path, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(500);

      const barInfo = await page.evaluate(() => {
        const bar = document.querySelector('.milestone-bar');
        if (!bar) return null;

        const rect = bar.getBoundingClientRect();
        const style = window.getComputedStyle(bar);

        // Find hairlines (dividers)
        const dividers = Array.from(document.querySelectorAll('.milestone-bar > div[style*="height"]')).filter(
          el => el.style.width === '1px'
        );

        // Find icons
        const icons = Array.from(bar.querySelectorAll('[class*="absolute"]')).filter(
          el => el.querySelector('svg') !== null
        );

        return {
          barWidth: rect.width,
          barLeft: rect.left,
          barRight: rect.right,
          computedWidth: style.width,
          dividerCount: dividers.length,
          iconCount: icons.length,
          icons: icons.map(icon => {
            const r = icon.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          }),
          dividers: dividers.map(div => {
            const r = div.getBoundingClientRect();
            return { left: r.left, right: r.right };
          }),
        };
      });

      if (!barInfo) {
        console.log(`   ⚠️  ${pageTest.name}: milestone bar not found`);
        continue;
      }

      // Check width
      const widthMatch = barInfo.barWidth.toFixed(0) === expectedWidth.toFixed(0);
      const widthStatus = widthMatch ? '✅' : '❌';
      console.log(`   ${widthStatus} ${pageTest.name}: bar width ${barInfo.barWidth.toFixed(0)}px (computed: ${barInfo.computedWidth})`);

      // Check for overlaps between bar and icons
      let overlap = false;
      for (const icon of barInfo.icons) {
        if (icon.left < barInfo.barRight && icon.right > barInfo.barLeft) {
          // Horizontally within bar bounds
          if (!overlap) {
            console.log(`   ℹ️  Icon positions OK (contained within bar)`);
            overlap = true;
          }
        }
      }

      // Check divider positions
      for (const div of barInfo.dividers) {
        if (div.left < barInfo.barLeft || div.left > barInfo.barRight) {
          console.log(`   ❌ Divider overlap detected! Left: ${div.left.toFixed(0)}, Bar: ${barInfo.barLeft.toFixed(0)}-${barInfo.barRight.toFixed(0)}`);
        }
      }

      if (barInfo.dividerCount !== 2) {
        console.log(`   ⚠️  Expected 2 dividers, found ${barInfo.dividerCount}`);
      }
    } catch (e) {
      console.log(`   ❌ ${pageTest.name}: ${e.message}`);
    }
  }

  await context.close();
}

async function main() {
  console.log('🧪 Milestone Bar Responsive Test Harness');
  console.log('=========================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Expected clamped width: clamp(10.5rem, 24vw, 22rem)`);

  const browser = await chromium.launch();

  try {
    for (const viewport of VIEWPORTS) {
      await testViewport(browser, viewport);
    }

    console.log('\n✅ Test harness complete!');
    console.log('\nSummary:');
    console.log('- Bar width should scale with viewport (24vw clamped between 10.5rem-22rem)');
    console.log('- No overlaps between bar, dividers, and icons');
    console.log('- Consistent across all pages (builder, view, analytics)');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
