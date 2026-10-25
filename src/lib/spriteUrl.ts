import revisions from '@/data/spriteRevisions.json';
import shinySprites from '@/data/shinySprites.json';

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

const SPRITE_FILE = /^\/sprites\/pokemon\/([^/?]+)\.png(?:\?|$)/;
let shinyFiles: Set<string> | undefined;

/**
 * The shiny version of a normal Pokémon sprite URL, or null when that art has
 * none (`src/data/shinySprites.json`, written by scripts/fetch-shiny-sprites.ts).
 * It looks up the file, not the Pokémon id: Palafin shows 10256.png in the
 * league builder, while the picker's 10256 is an Alcremie with its own file,
 * alcremie-star.png.
 */
export function shinySpriteUrl(sprite: string): string | null {
  const file = SPRITE_FILE.exec(sprite)?.[1];
  shinyFiles ??= new Set(shinySprites);
  return file && shinyFiles.has(file) ? revisedSprite(`/sprites/pokemon/shiny/${file}.png`) : null;
}
