import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { favoriteBrowserIdOverlay } from './build-favorite-browser-ids';

it('rejects a stale browser overlay after the picker catalog changes', () => {
  const saved = JSON.parse(readFileSync('src/components/browser/favoriteBrowserIds.json', 'utf8'));
  expect(saved, 'run npm run favorites:browser-ids').toEqual(favoriteBrowserIdOverlay());
});
