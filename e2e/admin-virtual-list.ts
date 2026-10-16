import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Brings a Newest browsers row on screen. The list renders only the rows near
 * the viewport, so a row far down does not exist until the page scrolls
 * toward it. Each step moves less than the rows rendered past the viewport's
 * edge, so no row is skipped.
 */
export async function scrollToRow(page: Page, name: string): Promise<Locator> {
  const row = page.getByRole('link', { name, exact: true });
  // Keep the search between frames in the page. Repeated accessible-tree
  // queries and protocol round trips can outlast the test on long mobile lists.
  await page.evaluate(async (label) => {
    const rendered = () => [...document.querySelectorAll('[data-user-preview][role="link"]')]
      .some(element => element.getAttribute('aria-label') === label);
    for (let i = 0; i < 400 && !rendered(); i++) {
      window.scrollBy(0, window.innerHeight + 600);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    }
  }, name);
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeInViewport();
  return row;
}
