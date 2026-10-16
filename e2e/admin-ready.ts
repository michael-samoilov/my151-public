import type { Page } from '@playwright/test';

/** Open the dashboard and wait for its data before testing a feature. */
export async function openAdmin(page: Page, url: '/?admin' | '/?admin&demo') {
  await page.goto(url);
  // A saved token can show Sign out before data loads. Every loaded tool has Who.
  await page.getByRole('heading', { level: 2, name: /^Who\b/ }).waitFor({ state: 'visible' });
}
