import revisions from '@/data/spriteRevisions.json';

/**
 * Sprites are served `immutable` for a year, and the service worker keeps them
 * forever, so a file replaced under the same name never reaches a browser that
 * already holds it. Zacian and Zamazenta showed their Crowned art for both forms
 * that way after 888.png and 889.png were replaced.
 *
 * A replaced file gets an entry in `spriteRevisions.json`: the first 8 hex digits
 * of its MD5, sent as `?v=`, which every cache treats as a new file.
 * `scripts/check-sprite-revisions.mjs` fails when a sprite differs from production
 * without a matching entry.
 */
export function revisedSprite(path: string): string {
  const revision = (revisions as Record<string, string>)[path];
  return revision ? `${path}?v=${revision}` : path;
}

export function pokemonSpriteUrl(id: number | string): string {
  return revisedSprite(`/sprites/pokemon/${id}.png`);
}
