import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { typeGlyphPaths } from './build-type-glyph-paths';

it('rejects stale confetti glyph paths after the type glyphs change', () => {
  const saved = JSON.parse(readFileSync('src/data/typeGlyphPaths.json', 'utf8'));
  expect(saved, 'run npm run type-icons:glyph-paths').toEqual(typeGlyphPaths());
});
