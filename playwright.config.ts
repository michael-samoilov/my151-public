import { defineConfig, devices } from '@playwright/test';

/**
 * One authoritative port, started automatically. The previous root-level
 * harnesses each hardcoded a different URL (:5173 and :5199) and required a
 * dev server to already be running, so one of them could never pass.
 *
 * Specs run against `vite preview`, i.e. the real production bundle, so they
 * exercise the same output Vercel deploys.
 */
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // Chromium is preinstalled in this environment at a fixed path; fall back to
    // Playwright's own resolution anywhere it isn't.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },

  /**
   * Mobile and desktop are peers in this app (see CLAUDE.md), so both are
   * first-class projects rather than one being a variant of the other. `narrow`
   * exists specifically to guard the header, which is the tightest horizontal
   * budget in the UI and the thing most at risk from longer translated labels.
   *
   * Specs under e2e/sweeps/ drive their own viewport sizes, so running them
   * under every project would just repeat the same work three times; only the
   * desktop project picks them up.
   */
  projects: [
    { name: 'mobile', testIgnore: '**/sweeps/**', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'narrow', testIgnore: '**/sweeps/**', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 844 } } },
  ],

  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
