import type { Page } from '@playwright/test';

export async function openAdmin(page: Page, url: '/?admin' | '/?admin&demo') {
  await page.goto(url);
  await page.getByRole('heading', { level: 2, name: /^Who\b/ }).waitFor({ state: 'visible' });
}
