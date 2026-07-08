#!/usr/bin/env node
/**
 * Real-world spacing verification harness.
 *
 * Opens the app in a real browser, measures actual pixel positions of:
 * - Counter (n/151 text)
 * - Left divider (hairline)
 * - MilestoneBar (beads + icons)
 * - Right divider (hairline)
 * - Settings menu (icon buttons)
 *
 * Detects overlaps by comparing actual rendered bounding rectangles.
 * Reports findings with pixel-level precision.
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const ROOT_PX = 16; // assume 16px base font size

const VIEWPORTS = [
  { width: 390, height: 844, label: 'Mobile (iPhone 12)' },
  { width: 768, height: 1024, label: 'Tablet (iPad)' },
  { width: 1024, height: 768, label: 'Desktop (md breakpoint)' },
  { width: 1440, height: 900, label: 'Desktop (large)' },
  { width: 1920, height: 1080, label: 'Desktop (4K)' },
];

const PAGES_TO_TEST = [
  { path: '/', name: 'Home (Builder)' },
];

/**
 * Measure header layout elements and detect overlaps.
 * Returns: { success, elements, overlaps, clearances }
 */
async function measureHeaderLayout(page) {
  const measurements = await page.evaluate(() => {
    // Get the header container
    const header = document.querySelector('header');
    if (!header) return { error: 'Header not found' };

    // Get the counter (n/151)
    const counter = header.querySelector('h1 + div'); // Following the flex layout
    const counterH2 = header.querySelector('h2');

    // Get the settings menu
    const settingsMenu = header.querySelector('[data-nav="view"]')?.parentElement;

    // Get the MilestoneBar container and its dividers
    const buildPageSection = document.querySelector('[data-build-scroll]')?.parentElement;
    const pokedexHeader = buildPageSection?.querySelector('h2 + div'); // Should be the MilestoneBar wrapper
    const milestoneBar = document.querySelector('.milestone-bar');
    const dividers = Array.from(document.querySelectorAll('.milestone-bar > div[style*="height"]')).filter(
      el => el.style.width === '1px'
    );

    const measurements = {};

    // Measure counter if found
    if (counterH2) {
      const rect = counterH2.getBoundingClientRect();
      measurements.counter = {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        label: 'Counter (n/151)',
      };
    } else if (counter) {
      // Fallback: try to find counter in the header nav area
      const allElements = header.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.textContent;
        if (text && text.includes('/151') && text.length < 20) {
          const rect = el.getBoundingClientRect();
          measurements.counter = {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            label: 'Counter (n/151)',
          };
          break;
        }
      }
    }

    // Measure milestone bar container
    if (milestoneBar) {
      const rect = milestoneBar.getBoundingClientRect();
      measurements.milestoneBar = {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        label: 'MilestoneBar',
      };
    }

    // Measure dividers
    if (dividers.length >= 2) {
      measurements.leftDivider = {
        left: dividers[0].getBoundingClientRect().left,
        right: dividers[0].getBoundingClientRect().right,
        top: dividers[0].getBoundingClientRect().top,
        bottom: dividers[0].getBoundingClientRect().bottom,
        width: dividers[0].getBoundingClientRect().width,
        label: 'Left Divider',
      };
      measurements.rightDivider = {
        left: dividers[1].getBoundingClientRect().left,
        right: dividers[1].getBoundingClientRect().right,
        top: dividers[1].getBoundingClientRect().top,
        bottom: dividers[1].getBoundingClientRect().bottom,
        width: dividers[1].getBoundingClientRect().width,
        label: 'Right Divider',
      };
    }

    // Measure settings menu
    if (settingsMenu) {
      const rect = settingsMenu.getBoundingClientRect();
      measurements.settingsMenu = {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        label: 'Settings Menu',
      };
    }

    return measurements;
  });

  if (measurements.error) {
    return { success: false, error: measurements.error };
  }

  // Detect overlaps
  const overlaps = [];
  const clearances = [];

  const { counter, milestoneBar, leftDivider, rightDivider, settingsMenu } = measurements;

  // Check counter vs left divider
  if (counter && leftDivider) {
    const gap = leftDivider.left - counter.right;
    if (gap < 0) {
      overlaps.push({
        elements: ['Counter', 'Left Divider'],
        gap: gap.toFixed(1),
        severity: 'CRITICAL',
        detail: `Counter ends at ${counter.right.toFixed(0)}px, divider at ${leftDivider.left.toFixed(0)}px`,
      });
    } else {
      clearances.push({
        elements: ['Counter', 'Left Divider'],
        gap: gap.toFixed(1),
      });
    }
  }

  // Check right divider vs settings menu
  if (rightDivider && settingsMenu) {
    const gap = settingsMenu.left - rightDivider.right;
    if (gap < 0) {
      overlaps.push({
        elements: ['Right Divider', 'Settings Menu'],
        gap: gap.toFixed(1),
        severity: 'CRITICAL',
        detail: `Settings starts at ${settingsMenu.left.toFixed(0)}px, divider at ${rightDivider.right.toFixed(0)}px`,
      });
    } else {
      clearances.push({
        elements: ['Right Divider', 'Settings Menu'],
        gap: gap.toFixed(1),
      });
    }
  }

  // Check left divider vs milestone bar
  if (leftDivider && milestoneBar) {
    if (leftDivider.right > milestoneBar.left && leftDivider.left < milestoneBar.left) {
      overlaps.push({
        elements: ['Left Divider', 'MilestoneBar'],
        severity: 'CRITICAL',
      });
    }
  }

  // Check right divider vs milestone bar
  if (rightDivider && milestoneBar) {
    if (rightDivider.left < milestoneBar.right && rightDivider.right > milestoneBar.right) {
      overlaps.push({
        elements: ['Right Divider', 'MilestoneBar'],
        severity: 'CRITICAL',
      });
    }
  }

  return {
    success: true,
    measurements,
    overlaps,
    clearances,
  };
}

async function testViewport(browser, viewport) {
  console.log(`\n📱 Testing ${viewport.label} (${viewport.width}x${viewport.height})`);

  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(500);

    const result = await measureHeaderLayout(page);

    if (!result.success) {
      console.log(`   ❌ ${result.error}`);
      return;
    }

    const { measurements, overlaps, clearances } = result;

    // Print measurements
    console.log('\n   📏 Measurements:');
    for (const [key, m] of Object.entries(measurements)) {
      if (m.label) {
        console.log(
          `      ${m.label}: left=${m.left.toFixed(0)}px, right=${m.right.toFixed(0)}px, width=${m.width.toFixed(0)}px`
        );
      }
    }

    // Print clearances
    if (clearances.length > 0) {
      console.log('\n   ✅ Clearances:');
      for (const c of clearances) {
        console.log(`      ${c.elements.join(' ↔ ')}: ${c.gap}px gap`);
      }
    }

    // Print overlaps (CRITICAL)
    if (overlaps.length > 0) {
      console.log('\n   ❌ OVERLAPS DETECTED:');
      for (const o of overlaps) {
        console.log(`      ${o.elements.join(' ↔ ')}: ${o.gap}px overlap (${o.severity})`);
        if (o.detail) console.log(`         → ${o.detail}`);
      }
    } else {
      console.log('\n   ✅ NO OVERLAPS');
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
  } finally {
    await context.close();
  }
}

async function main() {
  console.log('🧪 Header Spacing Test Harness');
  console.log('=====================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('Testing: Counter ↔ Dividers ↔ MilestoneBar ↔ Dividers ↔ Settings');

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  try {
    for (const viewport of VIEWPORTS) {
      await testViewport(browser, viewport);
    }

    console.log('\n✅ Test harness complete!\n');
    console.log('Summary:');
    console.log('- Measurements are from actual browser rendering');
    console.log('- Overlaps are detected by comparing bounding rectangles');
    console.log('- Gaps are negative when overlapping, positive when clear');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
