import { fluidSpriteCssPx, SPRITE_NATIVE } from './usePixelPerfectSprite';

const TILE_MOBILE_SPRITE_VW = 8.2;

const TILE_DESKTOP_MIN = 40;
const TILE_DESKTOP_VW = 7;
const TILE_DESKTOP_MAX = 96;
const TILE_DESKTOP_BREAKPOINT = 1024;

const TILE_DESKTOP_PANE_DIVISOR = 2;

const TILE_SPRITE_IMG_SCALE = 1.95;

export function tileImageCssPx(viewportCssPx: number): number {
  const width = viewportCssPx > 0 && Number.isFinite(viewportCssPx) ? viewportCssPx : 1024;
  const isDesktop = width >= TILE_DESKTOP_BREAKPOINT;
  const divisor = isDesktop ? TILE_DESKTOP_PANE_DIVISOR : 1;
  const oneX = fluidSpriteCssPx(
    width,
    TILE_MOBILE_SPRITE_VW,
    TILE_DESKTOP_MIN,
    TILE_DESKTOP_VW,
    TILE_DESKTOP_MAX,
    divisor,
  );
  if (!isDesktop) return Math.round(oneX * TILE_SPRITE_IMG_SCALE);
  const fluidImage = oneX * TILE_SPRITE_IMG_SCALE;
  const multiple = Math.max(1, Math.floor(fluidImage / SPRITE_NATIVE));
  return multiple * SPRITE_NATIVE;
}
