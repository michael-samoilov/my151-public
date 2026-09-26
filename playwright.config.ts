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

/**
 * A port pair of this checkout's own, from 10000 through 29999.
 *
 * Two worktrees on one machine each start these servers, and a local run
 * reuses whatever already answers on the port. On shared fixed ports, the
 * second worktree's run silently tests the first worktree's build. Hashing
 * the checkout path (FNV-1a) gives each worktree the same pair on every run
 * and, barring a hash collision, a different pair from its neighbors.
 * PLAYWRIGHT_PREVIEW_PORT and PLAYWRIGHT_DEV_PORT override it.
 */
function worktreePort(offset: 0 | 1): number {
  let hash = 2166136261;
  for (const char of path.resolve(process.cwd()).toLowerCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 10_000 + ((hash >>> 0) % 10_000) * 2 + offset;
}

function configuredPort(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer from 1 through 65535`);
  }
  return port;
}

const PREVIEW_PORT = configuredPort('PLAYWRIGHT_PREVIEW_PORT', worktreePort(0));
const DEV_PORT = configuredPort('PLAYWRIGHT_DEV_PORT', worktreePort(1));
if (PREVIEW_PORT === DEV_PORT) {
  throw new Error('PLAYWRIGHT_PREVIEW_PORT and PLAYWRIGHT_DEV_PORT must differ');
}

/**
 * Find a Chromium this machine actually has, without assuming a revision.
 *
 * An image that preinstalls browsers under PLAYWRIGHT_BROWSERS_PATH pins one
 * revision, and the pinned @playwright/test revision moves independently of it.
 * The moment the two diverge, Playwright's own resolution fails on a path that
 * was never installed, and the usual repair is unavailable because the browser
 * CDN is blocked. So never name a revision. Ask, in order:
 *
 *   1. PLAYWRIGHT_CHROMIUM_PATH, for a machine that keeps Chromium elsewhere.
 *   2. A system Chrome or Chromium installed by the Cloud engine setup.
 *   3. The unversioned `chromium` symlink the image maintains beside the
 *      revision directories. This is the one name that survives an image bump.
 *   4. The highest `chromium-<digits>` directory present. That pattern matches
 *      neither chromium_headless_shell-* nor chromium-tip-of-tree-*, which are
 *      a different binary and a different browser.
 *   5. Nothing, which leaves Playwright to resolve its own. That is correct
 *      wherever `npx playwright install` has run, CI included.
 *
 * Setting executablePath also opts out of the separate headless-shell binary,
 * whose absent revision is what the failure names first.
 *
 * `.claude/skills/verify-my151/harness/lib/engines.ts` and
 * `scripts/generate-og-image.mjs` carry the same lookup for the same reason.
 * The three stay separate on purpose: the harness ships as a self-contained
 * skill, and the og-image script is plain ESM that cannot import either.
 */
const CHROMIUM_LAYOUTS = [
  ['chrome-linux', 'chrome'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
  ['chrome-win', 'chrome.exe'],
];

function resolveChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  for (const bin of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium']) {
    if (fs.existsSync(bin)) return bin;
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root) return undefined;
  try {
    const stable = path.join(root, 'chromium');
    if (fs.existsSync(stable) && fs.statSync(stable).isFile()) return stable;
    const revisions = fs
      .readdirSync(root)
      .map((d) => /^chromium-(\d+)$/.exec(d))
      .filter((m): m is RegExpExecArray => m !== null)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    for (const match of revisions) {
      for (const layout of CHROMIUM_LAYOUTS) {
        const bin = path.join(root, match[0], ...layout);
        if (fs.existsSync(bin)) return bin;
      }
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
    // Without an explicit path, Playwright's default headless browser is the
    // separate chrome-headless-shell binary, which snaps glyph advances to
    // whole pixels where full Chromium does not. CI has no PLAYWRIGHT_BROWSERS_PATH
    // and so took that default while every local run used full Chromium; the
    // two disagreed on sub-pixel layout (0.59 px in the league card slots).
    // Pinning the channel makes both run the same binary.
    ...(CHROMIUM_PATH ? {} : { channel: 'chromium' as const }),
  },

  /**
   * Mobile and desktop are peers in this app (see CLAUDE.md), so both are
   * first-class projects rather than one being a variant of the other. `narrow`
   * exists specifically to guard the header, which is the tightest horizontal
   * budget in the UI and the thing most at risk from longer translated labels.
   *
   * `desktop` runs every test. `mobile` and `narrow` run only tests tagged
   * `@viewport`. Tag a test or a describe `@viewport` when its result depends
   * on the project's width or device: a measured box, overflow, wrap, scroll
   * offset, fit or scale, `page.viewportSize()`, the project name, touch, or a
   * sheet-versus-pane branch. A test that checks only state, copy, storage, or
   * network, or that pins its own viewport, gets the same result from one
   * desktop run. A test that skips `desktop` must carry the tag, or it runs
   * nowhere; `scripts/check-viewport-tags.mjs` enforces that.
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
      grep: /@viewport/,
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
      grep: /@viewport/,
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
