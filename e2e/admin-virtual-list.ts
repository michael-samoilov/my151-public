import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Brings a Newest browsers row on screen. The list renders only the rows near
 * the viewport, so a row far down does not exist until the page scrolls
 * toward it. Each step moves less than the rows rendered past the viewport's
 * edge, so no row is skipped.
 */
export async function scrollToRow(page: Page, name: string): Promise<Locator> {
  const row = page.getByRole('link', { name, exact: true });
  for (let i = 0; i < 400 && (await row.count()) === 0; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight + 600);
      return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
  }
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeInViewport();
  return row;
}
