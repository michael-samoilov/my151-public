import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';

export interface FitProposal {
  scale: number;
  width: number;
}

export const SCALE_EPS = 0.015;
export const WIDTH_EPS = 2;
const MEASURE_EPS = 20;

function quantizeScale(scale: number): number {
  return Math.round(scale * 1000) / 1000;
}

export function stabilizeMeasure(next: number, prev: number, eps = MEASURE_EPS): number {
  if (prev > 0 && Math.abs(next - prev) <= eps) return prev;
  return next;
}

interface SquashInput {
  mode: 'squash';
  natural: number;
  tailNatural: number;
  avail: number;
  room: number;
  floor: number;
  prevScale: number;
  prevWidth: number;
}

interface GrowInput {
  mode: 'grow';
  natural: number;
  avail: number;
  room: number;
  floor: number;
  baseWidth: number;
  spriteCeil: number;
  /** The sprite's CSS px at zoom 1. */
  spritePx: number;
  dpr: number;
  prevScale: number;
  prevWidth: number;
}

interface HoldInput {
  mode: 'hold';
  shortest: number;
  avail: number;
  room: number;
  floor: number;
  hold: number;
  baseWidth?: number;
  prevScale: number;
  prevWidth: number;
}

type FitInput = SquashInput | GrowInput | HoldInput;

export function proposeFit(input: FitInput): FitProposal | null {
  if (input.mode === 'hold') return proposeHold(input);
  if (input.natural <= 0) return null;

  let scale: number;
  let width: number;

  if (input.mode === 'grow') {
    const wScale = input.room / input.baseWidth;
    const hScale = input.avail / input.natural;
    const fluid = Math.max(input.floor, Math.min(wScale, hScale, input.spriteCeil));
    width = input.baseWidth;
    const whole = wholePixelScale(fluid, input);
    if (whole !== null) {
      if (whole === input.prevScale && Math.abs(width - input.prevWidth) <= WIDTH_EPS) return null;
      return { scale: whole, width };
    }
    scale = fluid;
  } else {
    const body = Math.max(1, input.natural - input.tailNatural);
    const squash = Math.min(1, Math.max(input.floor, input.avail / body));
    width = input.room / squash;
    scale = Math.min(1, Math.max(input.floor, input.avail / input.natural));
  }

  scale = quantizeScale(scale);

  if (
    Math.abs(scale - input.prevScale) <= SCALE_EPS &&
    Math.abs(width - input.prevWidth) <= WIDTH_EPS
  ) {
    return null;
  }
  return { scale, width };
}

/** How much taller than its pane a block may grow to reach the next whole pixel. The pane scrolls. */
const WHOLE_PIXEL_OVERFLOW = 1.1;

/**
 * A zoom that draws each sprite pixel as a whole number of device pixels: the
 * next multiple up when the block stays inside the pane's width and at most
 * `WHOLE_PIXEL_OVERFLOW` taller than its height, else the largest multiple at
 * or under `fluid`. Null when even 1x needs more room than that: the fluid fit
 * is then the fallback.
 */
function wholePixelScale(fluid: number, input: GrowInput): number | null {
  const devicePerSpritePx = (input.spritePx * input.dpr) / SPRITE_NATIVE;
  const up = Math.ceil(fluid * devicePerSpritePx - 1e-6) / devicePerSpritePx;
  const roomUp = Math.min(input.room / input.baseWidth, (input.avail / input.natural) * WHOLE_PIXEL_OVERFLOW, input.spriteCeil);
  if (up > 0 && up <= roomUp + 1e-6 && up >= input.floor) return up;
  const multiple = Math.floor(fluid * devicePerSpritePx + 1e-6);
  if (multiple < 1) return null;
  const scale = multiple / devicePerSpritePx;
  return scale >= input.floor ? scale : null;
}

function proposeHold(input: HoldInput): FitProposal | null {
  if (input.shortest <= 0) return null;
  const wide = input.baseWidth ? input.room / input.baseWidth : Infinity;
  const fits = Math.min(wide, input.avail / input.shortest);
  const scale = Math.max(input.floor, Math.min(input.hold, fits));
  const width = input.baseWidth ?? input.room / scale;
  if (scale === input.prevScale && width === input.prevWidth) return null;
  return { scale, width };
}
