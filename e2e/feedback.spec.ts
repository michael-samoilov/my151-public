import { expect, test, type Page, type Route } from '@playwright/test';
import { seedDex } from './support/dexSeed';

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
  await page.goto('/pokedex-builder');
  await page.getByRole('button', { name: 'Report a problem' }).first().click();
  // The dwell check rejects anything sent within 2s of the form opening, so a
  // test that types instantly would be indistinguishable from a bot. The form
  // loads lazily and starts its clock when it mounts, so wait for it first: a
  // wait that starts at the click comes up short when the chunk is slow.
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
    // The stable enum, never the label the user saw — a translated label would
    // arrive as "Falsche Übersetzung" and match nothing server-side.
    expect(body!.category).toBe('translation');
    expect(body!.message).toBe('The type badge says the wrong word.');
    expect(body!.dwellMs).toBeGreaterThan(2000);
  });

  test('attaches the context it shows, and nothing it does not', { tag: '@viewport' }, async ({ page }) => {
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
    await page.goto('/pokedex-builder');
    const footerLink = page.getByRole('button', { name: 'Report a problem' }).last();
    await footerLink.scrollIntoViewIfNeeded();
    await footerLink.click();
    await expect(page.getByRole('textbox', { name: 'What happened?' })).toBeVisible();
  });

  test('the footer link still opens the form after visiting another tab', async ({ page }) => {
    // The reported bug. Each page mounted its own copy of the report host, and
    // they shared one module-level opener slot, last writer wins. Visiting
    // Analytics made its copy the registered opener; that page then stayed
    // mounted but hidden. Back on Builder, the footer link opened the sheet
    // inside the hidden Analytics subtree, so nothing appeared on screen.
    await stubApi(page);
    // A seeded dex, so Analytics renders its full dashboard. Its report host
    // only mounts once there is data; the empty state returns before it. `?tune`
    // exposes the store the helper writes to.
    await page.goto('/pokedex-builder?tune');
    await seedDex(page);

    // Visit Analytics and let it finish mounting, which is when its copy of the
    // host claimed the shared opener. The dashboard is lazy-loaded, so wait for
    // its own content to appear: that guarantees its registration effect ran
    // before we navigate back, which clicking straight back would race.
    await page.locator('[data-nav="analytics"]').first().click();
    await expect(page.getByRole('heading', { name: 'Pokémon Type' })).toBeVisible();
    await page.locator('[data-nav="builder"]').first().click();

    const footerLink = page.getByRole('button', { name: 'Report a problem' }).last();
    await footerLink.scrollIntoViewIfNeeded();
    await footerLink.click();
    await expect(page.getByRole('textbox', { name: 'What happened?' })).toBeVisible();
  });

  /**
   * Every report button on the league builder opens the form.
   *
   * The league builder boots from its own root (`src/league/main.tsx`) rather
   * than from `App.tsx`, so it never inherited that app's `FeedbackHost`. An
   * unregistered opener is a no-op rather than an error, so all of its report
   * buttons did nothing at all, silently — which is exactly the failure a
   * report button cannot have.
   */
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

      // By attribute, not by accessible name: the name is translated, and
      // this page draws more than one of these.
      const buttons = page.locator('[data-feedback-open]');
      // Only the ones a person can reach. On mobile both panes stay mounted
      // and the one off screen is `inert` — its button is not hidden, so
      // Playwright counts it visible, and the pane track swallows the click.
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
