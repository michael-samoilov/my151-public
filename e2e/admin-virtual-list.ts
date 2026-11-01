import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Scrolls the virtual list until the row is rendered. Each step waits for the list to
 * render, so a long walk is slow under parallel load: start at the end for a row near it.
 */
export async function scrollToRow(page: Page, name: string, { fromEnd = false } = {}): Promise<Locator> {
  const row = page.getByRole('link', { name, exact: true });
  await page.evaluate(async ({ label, fromEnd }) => {
    const rendered = () => [...document.querySelectorAll('[data-user-preview][role="link"]')]
      .some(element => element.getAttribute('aria-label') === label);
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    if (fromEnd) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await frame();
    }
    const step = (fromEnd ? -1 : 1) * (window.innerHeight + 600);
    for (let i = 0; i < 400 && !rendered(); i++) {
      window.scrollBy(0, step);
      await frame();
    }
  }, { label: name, fromEnd });
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeInViewport();
  return row;
}
