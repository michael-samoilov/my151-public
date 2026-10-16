import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import root from '../../playwright.config';
import { projectFilter, type Selection } from './policy';

const directory = process.env.MY151_CI_RUN_DIR;
if (!directory) throw new Error('Use npm run ci:fast, ci:affected, or ci:full.');
const selection: Selection = JSON.parse(readFileSync(join(directory, 'selection.json'), 'utf8'));
const config = root as PlaywrightTestConfig;
const external = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  ...config,
  testDir: '../../e2e',
  retries: 0,
  forbidOnly: true,
  workers: Number(process.env.MY151_CI_WORKERS ?? 2),
  outputDir: join(directory, 'test-results'),
  reporter: [['list'], ['./reporter.ts']],
  use: { ...config.use, ...(external ? { baseURL: external } : {}), trace: 'retain-on-failure' },
  projects: config.projects!.filter(project => !external || project.name !== 'dev').map(project => ({
    ...project,
    grep: projectFilter(selection.suitePattern, project.name === 'mobile' || project.name === 'narrow'),
  })),
  webServer: undefined,
});
