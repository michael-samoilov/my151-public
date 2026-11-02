import { expect, test, type Page, type Route } from '@playwright/test';
import { seedDex } from './support/dexSeed';

interface Captured {
  category?: string;
  message?: string;
  cid?: string;
  dwellMs?: number;
  website?: string;
  context?: Record<string, unknown>;
}

async function stubApi(page: Page): Promise<{ body(): Captured | null }> {
  let captured: Captured | null = null;
  await page.route('**/api/feedback', async (route: Route) => {
    captured = route.request().postDataJSON() as Captured;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/event', (route) => route.fulfill({ status: 200, body: '{}' }));
  return { body: () => captured };
}

async function openForm(page: Page) {
  await page.goto('/pokedex-builder');
  await page.getByRole('button', { name: 'Report a problem' }).first().click();
  await page.getByRole('textbox', { name: 'What happened?' }).waitFor();
  await page.waitForTimeout(2100);
}

test.describe('feedback', () => {
  test('sends a report and says thank you', { tag: '@viewport' }, async ({ page }) => {
    const api = await stubApi(page);
    await openForm(page);

    await page.getByRole('button', { name: 'Translation' }).click();
    await page.getByRole('textbox', { name: 'What happened?' }).fill('The type badge says the wrong word.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('Thanks — that helps.')).toBeVisible();

    const body = api.body();
    expect(body).not.toBeNull();
    expect(body!.category).toBe('translation');
    expect(body!.message).toBe('The type badge says the wrong word.');
    expect(body!.dwellMs).toBeGreaterThan(2000);
  });

  test('attaches the context it shows, and nothing it does not', { tag: '@viewport' }, async ({ page }) => {
    const api = await stubApi(page);
    await openForm(page);
    await page.getByRole('textbox', { name: 'What happened?' }).fill('Something looks off here.');

    await page.getByText('What gets sent').click();
    await expect(page.getByText('page: builder')).toBeVisible();

    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Thanks — that helps.')).toBeVisible();

    const context = api.body()!.context!;
    expect(context.route).toBe('builder');
    expect(context.locale).toBe('en');
    expect(typeof context.viewport).toBe('string');

    expect(context).not.toHaveProperty('sections');
    expect(context).not.toHaveProperty('ids');
    expect(context).not.toHaveProperty('searchQuery');
    expect(typeof context.search).toBe('boolean');
  });

  test('will not send an empty report', async ({ page }) => {
    await stubApi(page);
    await openForm(page);
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.getByRole('textbox', { name: 'What happened?' }).fill('hi');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.getByRole('textbox', { name: 'What happened?' }).fill('this is long enough');
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  });

  test('the honeypot is out of reach of everyone but a bot', async ({ page }) => {
    await stubApi(page);
    await openForm(page);
    const trap = page.locator('input[name="website"]');

    const box = (await trap.boundingBox())!;
    expect(box.x + box.width, 'the trap is rendered off the left edge').toBeLessThan(0);
    await expect(trap).toHaveCSS('opacity', '0');
    await expect(trap).toHaveAttribute('tabindex', '-1');
    await expect(trap).toHaveAttribute('aria-hidden', 'true');
  });

  test('the footer link opens the same form', async ({ page }) => {
    await stubApi(page);
    await page.goto('/pokedex-builder');
    const footerLink = page.getByRole('button', { name: 'Report a problem' }).last();
    await footerLink.scrollIntoViewIfNeeded();
    await footerLink.click();
    await expect(page.getByRole('textbox', { name: 'What happened?' })).toBeVisible();
  });

  test('the footer link still opens the form after visiting another tab', async ({ page }) => {
    await stubApi(page);
    await page.goto('/pokedex-builder?tune');
    await seedDex(page);

    await page.locator('[data-nav="analytics"]').first().click();
    await expect(page.getByRole('heading', { name: 'Pokémon Type' })).toBeVisible();
    await page.locator('[data-nav="builder"]').first().click();

    const footerLink = page.getByRole('button', { name: 'Report a problem' }).last();
    await footerLink.scrollIntoViewIfNeeded();
    await footerLink.click();
    await expect(page.getByRole('textbox', { name: 'What happened?' })).toBeVisible();
  });

  for (const openCard of [false, true]) {
    const where = openCard ? 'an open gym card' : 'the league home';
    test(`every report button opens the form on ${where}`, async ({ page }) => {
      await stubApi(page);
      await page.goto('/custom-gym-leader');
      await page.waitForSelector('[data-testid="league-slot-0"]');
      if (openCard) {
        await page.click('[data-testid="league-slot-0"]');
        await page.waitForSelector('[data-testid="slot-tm"]');
      }
      await page.waitForTimeout(400);

      const buttons = page.locator('[data-feedback-open]');
      // platform: Playwright counts a button in an inert pane as visible, so the test keeps only buttons a person can reach.
      const reachable = await buttons.evaluateAll((els) =>
        els.flatMap((el, i) => {
          const r = el.getBoundingClientRect();
          const onScreen =
            r.width > 0 && r.left >= 0 && r.top >= 0
            && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
          return !el.closest('[inert]') && onScreen ? [i] : [];
        }),
      );
      expect(reachable.length, 'the page draws a report button').toBeGreaterThan(0);

      const field = page.getByRole('textbox', { name: 'What happened?' });
      for (const [k, i] of reachable.entries()) {
        await buttons.nth(i).click();
        await expect(field, `report button ${k + 1} of ${reachable.length}`).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(field).toBeHidden();
      }
    });
  }
});
