import revisions from '@/data/spriteRevisions.json';
import shinySprites from '@/data/shinySprites.json';

export function revisedSprite(path: string): string {
  const revision = (revisions as Record<string, string>)[path];
  return revision ? `${path}?v=${revision}` : path;
}

export function moveCategorySpriteUrl(category: string): string {
  return revisedSprite(`/sprites/moves/${category}.png`);
}

export function pokemonSpriteUrl(id: number | string): string {
  return revisedSprite(`/sprites/pokemon/${id}.png`);
}

const SPRITE_FILE = /^\/sprites\/pokemon\/([^/?]+)\.png(?:\?|$)/;
let shinyFiles: Set<string> | undefined;

export function shinySpriteUrl(sprite: string): string | null {
  const file = SPRITE_FILE.exec(sprite)?.[1];
  shinyFiles ??= new Set(shinySprites);
  return file && shinyFiles.has(file) ? revisedSprite(`/sprites/pokemon/shiny/${file}.png`) : null;
}
