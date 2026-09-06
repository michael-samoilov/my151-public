import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

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

/**
 * Find a Chromium this machine actually has.
 *
 * The cloud container preinstalls one revision under PLAYWRIGHT_BROWSERS_PATH
 * and forbids the browser CDN, so Playwright's own resolution fails the moment
 * the pinned @playwright/test revision moves ahead of the image. That is not a
 * hypothetical: a 1194 image against a 1228 pin fails every spec with
 * "Executable doesn't exist at .../chromium_headless_shell-1228/...". So read
 * the directory instead of trusting the revision, and set executablePath, which
 * also opts out of the separate headless-shell binary.
 *
 * PLAYWRIGHT_CHROMIUM_PATH overrides, for a machine that keeps Chromium
 * elsewhere. Undefined means "let Playwright resolve its own", which is right
 * wherever `npx playwright install` has run, including CI.
 *
 * `.claude/skills/verify-my151/harness/lib/engines.ts` carries the same logic
 * for the same reason. The two stay separate on purpose: the harness ships as a
 * self-contained skill and must not import from the app's test config.
 */
function resolveChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root) return undefined;
  try {
    const dir = fs.readdirSync(root).find((d) => d.startsWith('chromium-'));
    if (dir) {
      const bin = path.join(root, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  } catch {
    /* fall through to Playwright's own resolution */
  }
  return undefined;
}

const CHROMIUM_PATH = resolveChromium();

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
    // See resolveChromium() below. An empty launchOptions means "let Playwright
    // resolve its own browser", which is correct on a machine that ran
    // `npx playwright install`.
    launchOptions: CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {},
  },

  /**
   * Mobile and desktop are peers in this app (see CLAUDE.md), so both are
   * first-class projects rather than one being a variant of the other. `narrow`
   * exists specifically to guard the header, which is the tightest horizontal
   * budget in the UI and the thing most at risk from longer translated labels.
   *
   * Specs under e2e/sweeps/ drive their own viewport sizes, so running them
   * under every project would just repeat the same work three times; only the
   * desktop project picks them up. Specs under e2e/dev/ need the dev server and
   * run only in the `dev` project.
   */
  projects: [
    {
      name: 'mobile',
      testIgnore: ['**/sweeps/**', '**/dev/**'],
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop',
      testIgnore: '**/dev/**',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'narrow',
      testIgnore: ['**/sweeps/**', '**/dev/**'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 844 } },
    },
    // Specs that need the dev server rather than the production bundle:
    // pseudo-locales (PREVIEW_FEATURES is correctly false in a prod build) and
    // anything importing app source directly. Narrow-ish width, because that is
    // where expanded text breaks first.
    {
      name: 'dev',
      testMatch: '**/dev/**',
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
