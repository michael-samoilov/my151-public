import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The report form, driven end to end with the API stubbed.
 *
 * `/api/feedback` needs Upstash credentials that no test environment has, and
 * the thing worth asserting on the client side is not that Redis accepted the
 * write — it is what the request body carries. In particular that the dex, the
 * search text and the category *label* never leave the browser, which is the
 * promise the form's own "what gets sent" panel makes to the user.
 */

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
  // Beacons would otherwise 404 noisily against the preview server.
  await page.route('**/api/event', (route) => route.fulfill({ status: 200, body: '{}' }));
  return { body: () => captured };
}

async function openForm(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Report a problem' }).first().click();
  // The dwell check rejects anything sent within 2s of the form opening, so a
  // test that types instantly would be indistinguishable from a bot.
  await page.waitForTimeout(2100);
}

test.describe('feedback', () => {
  test('sends a report and says thank you', async ({ page }) => {
    const api = await stubApi(page);
    await openForm(page);

    await page.getByRole('button', { name: 'Wrong translation' }).click();
    await page.getByRole('textbox', { name: 'What happened?' }).fill('The type badge says the wrong word.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('Thanks — that helps.')).toBeVisible();

    const body = api.body();
    expect(body).not.toBeNull();
    // The stable enum, never the label the user saw — a translated label would
    // arrive as "Falsche Übersetzung" and match nothing server-side.
    expect(body!.category).toBe('translation');
    expect(body!.message).toBe('The type badge says the wrong word.');
    expect(body!.dwellMs).toBeGreaterThan(2000);
  });

  test('attaches the context it shows, and nothing it does not', async ({ page }) => {
    const api = await stubApi(page);
    await openForm(page);
    await page.getByRole('textbox', { name: 'What happened?' }).fill('Something looks off here.');

    // Everything the disclosure lists must actually be in the payload...
    await page.getByText('What gets sent').click();
    await expect(page.getByText('page: builder')).toBeVisible();

    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Thanks — that helps.')).toBeVisible();

    const context = api.body()!.context!;
    expect(context.route).toBe('builder');
    expect(context.locale).toBe('en');
    expect(typeof context.viewport).toBe('string');

    // ...and the three things the form promises to keep must be absent. `search`
    // is a boolean by design: whether a search was active helps reproduce a bug,
    // what it said is the user's business.
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

    // Deliberately not `toBeHidden()`: `display: none` is exactly what a
    // form-filling bot skips, so the field has to stay in the layout. What must
    // be true is that no person can see it, tab to it, or hear it announced.
    const box = (await trap.boundingBox())!;
    expect(box.x + box.width, 'the trap is rendered off the left edge').toBeLessThan(0);
    await expect(trap).toHaveCSS('opacity', '0');
    await expect(trap).toHaveAttribute('tabindex', '-1');
    await expect(trap).toHaveAttribute('aria-hidden', 'true');
  });

  test('the footer link opens the same form', async ({ page }) => {
    await stubApi(page);
    await page.goto('/');
    const footerLink = page.getByRole('button', { name: 'Report a problem' }).last();
    await footerLink.scrollIntoViewIfNeeded();
    await footerLink.click();
    await expect(page.getByRole('textbox', { name: 'What happened?' })).toBeVisible();
  });
});
