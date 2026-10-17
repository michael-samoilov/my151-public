import { expect, test, type Page } from '@playwright/test';
import { seededLeague } from './support/leagueSeed';
import { auditLayout } from './support/layoutAudit';

const MOBILE = { width: 390, height: 844 } as const;
const KEYBOARD_LEAVES = 338;

async function raiseKeyboard(page: Page, visible: number) {
  await page.evaluate((v) => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, 'height', { value: v, configurable: true });
    Object.defineProperty(vv, 'scale', { value: 0.9999999403953552, configurable: true });
    vv.dispatchEvent(new Event('resize'));
  }, visible);
  await page.waitForTimeout(400);
}

async function openSurveyForm(page: Page) {
  await seededLeague(page);
  await page.addInitScript(() => {
    window.localStorage.removeItem('my151-export-survey-seen');
    Object.defineProperty(navigator, 'canShare', { value: () => false });
  });
  await page.route('**/api/league', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          highlight: { ordinal: 151, tool: 'league', firstPokemonId: 25 },
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto('/custom-gym-leader');
  await page.locator('[data-testid="league-slot-0"]').waitFor();
  await page.locator('[data-league-export]').first().click();
  await page.locator('[data-export-preview-layer] img').waitFor({ timeout: 45_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45_000 }).catch(() => null),
    page.locator('[data-league-export-confirm]').click(),
  ]);
  await download?.cancel().catch(() => undefined);
  await page.locator('[data-export-survey-intro]').waitFor({ timeout: 20_000 });
}

type EventBody = { event?: string; exportTool?: string; reason?: string };

async function collectEvents(page: Page): Promise<EventBody[]> {
  const events: EventBody[] = [];
  await page.route('**/api/event', async (route) => {
    if (route.request().method() === 'POST') {
      events.push(route.request().postDataJSON() as EventBody);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  return events;
}

function skipBeacons(events: EventBody[]) {
  return events.filter((e) => e.event === 'export_survey_skipped');
}

test.describe('league export survey', () => {
  test.use({ viewport: MOBILE });

  test('preview still opens the survey when the seen key is already set', async ({ page }) => {
    await seededLeague(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('my151-export-survey-seen', '1');
      Object.defineProperty(navigator, 'canShare', { value: () => false });
    });
    await page.route('**/api/league', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            highlight: { ordinal: 151, tool: 'league', firstPokemonId: 25 },
          }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto('/custom-gym-leader');
    await page.locator('[data-testid="league-slot-0"]').waitFor();
    await page.locator('[data-league-export]').first().click();
    await page.locator('[data-export-preview-layer] img').waitFor({ timeout: 45_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 45_000 }).catch(() => null),
      page.locator('[data-league-export-confirm]').click(),
    ]);
    await download?.cancel().catch(() => undefined);
    await page.locator('[data-export-survey-intro]').waitFor({ timeout: 20_000 });
    await expect(page.locator('[data-export-survey-intro]')).toContainText('Lucky you!');
  });

  test('intro shows Lucky you and a first-Pokémon line', async ({ page }) => {
    await openSurveyForm(page);
    const intro = page.locator('[data-export-survey-intro]');
    await expect(intro).toContainText('Lucky you!');
    await expect(intro).toContainText('151st');
    await expect(intro).toContainText('Pikachu');
    await expect(intro).toContainText('first person to have');
    await expect(page.getByRole('button', { name: /not now/i })).toBeVisible();
  });

  test('Not now beacons export_survey_skipped with reason not_now', async ({ page }) => {
    const events = await collectEvents(page);
    await openSurveyForm(page);
    await page.getByRole('button', { name: /not now/i }).click();
    await expect(page.locator('[data-export-survey-intro]')).toHaveCount(0);
    await expect.poll(() => skipBeacons(events)).toEqual([
      expect.objectContaining({
        event: 'export_survey_skipped',
        exportTool: 'league',
        reason: 'not_now',
      }),
    ]);
    expect(events.filter((e) => e.event === 'league-export-league')).toEqual([
      expect.objectContaining({ event: 'league-export-league', exportTool: 'league' }),
    ]);
  });

  test('form offers send without Skip', async ({ page }) => {
    await openSurveyForm(page);
    await page.getByRole('button', { name: /sure, i'll help/i }).click();
    await page.locator('[data-export-survey]').waitFor();
    await expect(page.getByRole('button', { name: /send feedback/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^skip$/i })).toHaveCount(0);
  });

  test('Other input stays in the visible sheet above a keyboard', async ({ page }) => {
    await openSurveyForm(page);
    await page.getByRole('button', { name: /sure, i'll help/i }).click();
    await page.locator('[data-export-survey]').waitFor();

    const other = page.locator('[data-export-other-input]');
    await page.locator('[data-export-other]').click();
    await expect(other).toBeFocused();

    const afterFocus = await other.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    });
    expect(afterFocus.height, 'the Where? field collapsed').toBeGreaterThan(24);
    expect(afterFocus.top, 'Other is not in the upper half after focus').toBeLessThan(MOBILE.height * 0.45);
    expect(afterFocus.bottom, 'Other sits on the home-indicator').toBeLessThan(MOBILE.height * 0.55);

    await raiseKeyboard(page, KEYBOARD_LEAVES);
    await other.evaluate((el) => el.scrollIntoView({ block: 'center' }));

    const box = await page.evaluate(() => {
      const input = document.querySelector<HTMLElement>('[data-export-other-input]');
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!input || !dialog) return null;
      const i = input.getBoundingClientRect();
      const d = dialog.getBoundingClientRect();
      return {
        inputTop: i.top,
        inputBottom: i.bottom,
        inputHeight: i.height,
        dialogTop: d.top,
        dialogBottom: d.bottom,
        visible: input.checkVisibility(),
      };
    });
    expect(box, 'Other field missing').not.toBeNull();
    expect(box!.visible, 'Other field is not painted').toBe(true);
    expect(box!.inputHeight).toBeGreaterThan(24);
    expect(box!.dialogBottom, 'the sheet extends behind the keyboard').toBeLessThanOrEqual(
      KEYBOARD_LEAVES + 1,
    );
    expect(box!.inputTop, 'Other is above the sheet').toBeGreaterThanOrEqual(box!.dialogTop - 1);
    expect(box!.inputBottom, 'Other is under the keyboard').toBeLessThanOrEqual(KEYBOARD_LEAVES + 1);
    expect(box!.inputBottom, 'Other is below the sheet fold').toBeLessThanOrEqual(box!.dialogBottom + 1);

    const problems = await auditLayout(page, '[role="dialog"]');
    expect(problems.map((p) => `${p.kind}: ${p.detail}`)).toEqual([]);
  });
});

test.describe('league export survey desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('last page has Send feedback, no Skip, and the scrim still closes', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one desktop pass');
    const events = await collectEvents(page);
    await openSurveyForm(page);
    await page.getByRole('button', { name: /sure, i'll help/i }).click();
    await page.locator('[data-export-survey]').waitFor();
    await expect(page.getByRole('button', { name: /send feedback/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^skip$/i })).toHaveCount(0);
    await page.locator('[data-export-scrim] button[aria-label="Close export"]').click();
    await expect(page.locator('[data-export-survey]')).toHaveCount(0);
    await expect(page.locator('[data-export-overlay]')).toHaveCount(0);
    await expect.poll(() => skipBeacons(events)).toEqual([
      expect.objectContaining({
        event: 'export_survey_skipped',
        exportTool: 'league',
        reason: 'abandon',
      }),
    ]);
  });
});
