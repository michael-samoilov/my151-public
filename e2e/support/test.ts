import { test as base } from '@playwright/test';
import { recordSources, TEST_MAP_DIR } from './testMap';

export * from '@playwright/test';

export const test = base.extend<{ testMapRecorder: void }>({
  testMapRecorder: [async ({ browser, context }, use, testInfo) => {
    if (!TEST_MAP_DIR) return use();
    await recordSources(browser, context, testInfo, () => use());
  }, { auto: true }],
});
