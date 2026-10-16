export const SPRITE_REM = 3.25;

type SpriteScale = 1 | 2 | 3;

const SLOT_PAD_REM = 0.5;

const SLOT_HEAD_REM = 0.53125;
const SLOT_HEAD_LEADING = 1.4;
const SLOT_HEAD_LINES = 2;

export const BALL_OF_SPRITE = 1 / 1.2;
export const RING_OF_SPRITE = 0.8 / 1.2;

function slotHeadPx(remPx: number): number {
  return SLOT_HEAD_REM * SLOT_HEAD_LEADING * SLOT_HEAD_LINES * remPx;
}

function spriteEdge(n: SpriteScale, remPx: number): number {
  return n * SPRITE_REM * remPx;
}

function soloMaxEdge(w: number, h: number, remPx: number = 16): number {
  const pad = SLOT_PAD_REM * remPx;
  const headH = slotHeadPx(remPx);
  const nameH = SLOT_HEAD_REM * SLOT_HEAD_LEADING * remPx;
  return Math.min(w - 2 * pad, h - 2 * pad - headH - nameH);
}

function soloSpriteScale(
  w: number,
  h: number,
  remPx: number = 16,
): SpriteScale {
  const maxEdge = soloMaxEdge(w, h, remPx);
  if (spriteEdge(3, remPx) <= maxEdge) return 3;
  if (spriteEdge(2, remPx) <= maxEdge) return 2;
  return 1;
}

export function soloSprite(
  w: number,
  h: number,
  remPx: number = 16,
): number {
  return spriteEdge(soloSpriteScale(w, h, remPx), remPx);
}
