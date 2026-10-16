import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

type Cell = { kind: string; ids?: number[]; sources?: string[] };
export const FAVORITE_CELLS = JSON.parse(readFileSync('api/_favoriteCells.json', 'utf8')) as Record<string, Cell>;

export const LAST_CELL = 'normal|1';

export function favoritesBoard(leaveOutLast: boolean): Record<string, number> {
  const fills: Record<string, number> = {};
  for (const [key, cell] of Object.entries(FAVORITE_CELLS)) if (cell.kind === 'pick' && cell.ids?.length) fills[key] = cell.ids[0];
  for (const [key, cell] of Object.entries(FAVORITE_CELLS)) {
    if (cell.kind !== 'pointer') continue;
    const source = cell.sources?.find((s) => s !== LAST_CELL && fills[s] != null);
    if (source) fills[key] = fills[source];
  }
  if (leaveOutLast) delete fills[LAST_CELL];
  return fills;
}

export async function seedFavorites(page: Page, fills: Record<string, number>): Promise<void> {
  await page.addInitScript((saved) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('favorite-picker', JSON.stringify({ state: { fills: saved }, version: 3 }));
    sessionStorage.setItem('seeded', '1');
  }, fills);
}

export async function pickLastCell(page: Page): Promise<number> {
  await page.getByTestId('favorites-cell-normal-1').click();
  const first = page.locator('[data-testid^="favorites-pick-"]').first();
  const id = Number((await first.getAttribute('data-testid'))!.replace('favorites-pick-', ''));
  await first.click();
  return id;
}

export async function clearLastCell(page: Page, id: number): Promise<void> {
  await page.getByTestId('favorites-cell-normal-1').click();
  await page.getByTestId(`favorites-pick-${id}`).click();
}
