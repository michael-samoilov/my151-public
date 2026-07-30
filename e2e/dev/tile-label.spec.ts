import { expect, test } from '@playwright/test';

/**
 * The tile label: a species name that may truncate, and a form marker that may
 * not.
 *
 * This is the whole reason the label is two elements rather than one string.
 * When the marker lived inside the name — `raichu-A`, produced by slicing the
 * slug — it was the *last* thing in the string, so a text overflow ate it
 * first. On a narrow tile that made "Raichu" and "Alolan Raichu" render
 * identically, which is precisely where telling them apart matters most.
 *
 * A tile at 320px is about 45 CSS pixels wide, so almost any name truncates
 * there. That makes it the right width to prove the split at.
 */

test.use({ viewport: { width: 320, height: 800 } });

test('the name truncates and the form marker survives', async ({ page }) => {
  await page.goto('/?lang=en');
  await page.getByRole('button', { name: /^Add a Pokémon to / }).first().click();
  await page.getByRole('textbox').first().fill('raichu');

  // Waiting on `.first()` being visible would wait forever: the browser sheet
  // builds every row, so the first label in the DOM is off-screen. Poll for a
  // *measurable* one instead.
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          Array.from(document.querySelectorAll('[data-i18n-exempt="pokemon-name"]')).filter(
            (e) => e.children.length === 2 && e.getBoundingClientRect().width > 10,
          ).length,
      ),
    )
    .toBeGreaterThan(0);

  const result = await page.evaluate(() => {
    // A visible label with both parts: a species name and a form marker.
    // Off-screen tiles measure zero and would make every assertion below
    // vacuously true.
    const el = Array.from(document.querySelectorAll('[data-i18n-exempt="pokemon-name"]')).find(
      (e) => e.children.length === 2 && e.getBoundingClientRect().width > 10,
    ) as HTMLElement | undefined;
    if (!el) return null;

    const [name, mark] = Array.from(el.children) as HTMLElement[];
    const markWidthBefore = mark.getBoundingClientRect().width;

    // Force a name far longer than any real one, so the assertions describe the
    // layout rule rather than today's longest Pokémon.
    name.textContent = 'Averyveryverylongspeciesnameindeed';

    const label = el.getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    return {
      labelOverflow: el.scrollWidth - el.clientWidth,
      nameIsClipped: name.scrollWidth > name.clientWidth,
      markKeptItsWidth: Math.abs(markBox.width - markWidthBefore) < 0.5,
      markInsideLabel: markBox.right <= label.right + 0.5,
    };
  });

  expect(result, 'no visible tile carried a form marker').not.toBeNull();
  // The label as a whole stays inside the tile...
  expect(result!.labelOverflow, 'the label overflowed its tile').toBeLessThanOrEqual(1);
  // ...because the species name gave way...
  expect(result!.nameIsClipped, 'the species name should be the part that clips').toBe(true);
  // ...and not because the marker was squeezed or pushed out of view.
  expect(result!.markKeptItsWidth, 'the marker was squeezed').toBe(true);
  expect(result!.markInsideLabel, 'the marker was pushed outside the tile').toBe(true);
});
