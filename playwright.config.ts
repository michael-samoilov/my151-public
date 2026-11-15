import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { resolveChromium } from './scripts/chromium-path';

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

const CHROMIUM_PATH = resolveChromium();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PREVIEW_PORT}`,
    trace: 'off',

    launchOptions: CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {},
    // platform: Playwright's default chrome-headless-shell snaps glyph advances to whole pixels, so pinning the chromium channel matches full Chromium.
    ...(CHROMIUM_PATH ? {} : { channel: 'chromium' as const }),
  },

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
