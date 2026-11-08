import { expect, test } from '../support/test';
import { seedDex, TUNE_URL } from '../support/dexSeed';

test.describe('poster export', () => {
  test('generates a non-trivial PNG without throwing', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto(TUNE_URL);
    await seedDex(page);
    await page.locator('[data-nav="view"]').click();
    await expect(page.getByRole('button', { name: 'View settings' })).toBeVisible();

    const result = await page.evaluate(async () => {
      // platform: Non-literal import specifiers stop TypeScript from resolving Vite dev-server URLs as files on disk.
      const exportPath = '/src/lib/exportImage.ts';
      const dataPath = '/src/hooks/usePokemonData.ts';
      const mod = await import(/* @vite-ignore */ exportPath);
      const data = await import(/* @vite-ignore */ dataPath);
      const store = (window as unknown as { __pokedexStore: { getState: () => { sections: Record<string, number[]> } } }).__pokedexStore;
      const sections = store.getState().sections;
      const pokemon = data.getPokemonByIds(Object.values(sections).flat());
      try {
        const blob: Blob = await mod.generateExportImage(pokemon, { sections });
        return { ok: true, size: blob.size, type: blob.type };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    });

    expect(result.ok, `export threw: ${result.error ?? ''}`).toBe(true);
    expect(result.type).toBe('image/png');
    expect(result.size ?? 0).toBeGreaterThan(50_000);
    expect(pageErrors).toEqual([]);
  });
});
