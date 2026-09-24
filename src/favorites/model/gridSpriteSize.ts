import spriteInk from './spriteInk.json';

const MAX_CANVAS_PERCENT = 120;
const MAX_VISIBLE_PERCENT = 88;

/** Cap visible artwork, not its 96px transparent canvas. */
export function gridSpriteSizePercent(sprite: string): number {
  const id = /^\/sprites\/pokemon\/([^/]+)\.png$/.exec(sprite)?.[1];
  const diameter = id ? (spriteInk as Record<string, number>)[id] : undefined;
  return Math.round(Math.min(MAX_CANVAS_PERCENT, MAX_VISIBLE_PERCENT / (diameter ?? 1)) * 10) / 10;
}
