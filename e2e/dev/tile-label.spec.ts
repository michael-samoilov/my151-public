import { expect, test } from '../support/test';

test.use({ viewport: { width: 320, height: 800 } });

test('the name truncates and the form marker survives', async ({ page }) => {
  await page.goto('/pokedex-builder?lang=en');
  await page.getByRole('button', { name: /^Add a Pokémon to / }).first().click();
  await page.getByRole('textbox').first().fill('raichu');

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
    const el = Array.from(document.querySelectorAll('[data-i18n-exempt="pokemon-name"]')).find(
      (e) => e.children.length === 2 && e.getBoundingClientRect().width > 10,
    ) as HTMLElement | undefined;
    if (!el) return null;

    const [name, mark] = Array.from(el.children) as HTMLElement[];
    const markWidthBefore = mark.getBoundingClientRect().width;

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
  expect(result!.labelOverflow, 'the label overflowed its tile').toBeLessThanOrEqual(1);
  expect(result!.nameIsClipped, 'the species name should be the part that clips').toBe(true);
  expect(result!.markKeptItsWidth, 'the marker was squeezed').toBe(true);
  expect(result!.markInsideLabel, 'the marker was pushed outside the tile').toBe(true);
});
