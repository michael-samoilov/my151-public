import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import root from '../playwright.config';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
if (!baseURL) {
  throw new Error(
    'Set PLAYWRIGHT_BASE_URL to the preview origin, then run: npx playwright test -c e2e/preview.config.ts',
  );
}

const rootConfig = root as PlaywrightTestConfig;

export default defineConfig({
  ...rootConfig,
  testDir: '.',
  webServer: undefined,
  projects: (rootConfig.projects ?? []).filter((project) => project.name !== 'dev'),
  use: {
    ...rootConfig.use,
    baseURL,
  },
});
