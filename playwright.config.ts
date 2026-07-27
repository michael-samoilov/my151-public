import { defineConfig, devices } from '@playwright/test';

/**
 * Two servers, each authoritative for what it can actually prove.
 *
 * Most specs run against `vite preview` — the real production bundle, the same
 * output Vercel deploys. The pseudo-locale specs cannot: `PREVIEW_FEATURES` is
 * deliberately false in a production build, so `?lang=en-XA` is ignored there.
 * That gate is correct (a real user seeing "[Ɓúíłđ···]" would think the app was
 * broken), so those specs run against the dev server instead, which is where
 * the pseudo-locales are actually used.
 *
 * The previous root-level harnesses each hardcoded a different URL (:5173 and
 * :5199) and needed a server started by hand, so one of them could never pass.
 */
const PREVIEW_PORT = 4173;
const DEV_PORT = 4174;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PREVIEW_PORT}`,
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
    {
      name: 'mobile',
      testIgnore: ['**/sweeps/**', '**/i18n-layout.spec.ts'],
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop',
      testIgnore: '**/i18n-layout.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'narrow',
      testIgnore: ['**/sweeps/**', '**/i18n-layout.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 844 } },
    },
    // Pseudo-locales, against the dev server. Runs at the narrow width because
    // that is where expanded text breaks first.
    {
      name: 'pseudo',
      testMatch: '**/i18n-layout.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 844 },
        baseURL: `http://localhost:${DEV_PORT}`,
      },
    },
  ],

  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
      port: PREVIEW_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
      port: DEV_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
