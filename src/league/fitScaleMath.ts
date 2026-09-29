/**
 * Pure settle step for the league fit scale.
 *
 * The hook measures the pane, then applies CSS `zoom` + width. That reflow
 * re-enters ResizeObserver. If two nearby measurements imply scales that
 * differ by more than the deadband, the loop never reaches a fixed point and
 * the UI vibrates every frame (user report: Firefox @ 912×705, empty league).
 *
 * Measured oscillation under forced avail flicker was Δscale ≈ 0.0067, which
 * cleared the old 0.003 deadband. Quantize + a 0.01 deadband absorbs that
 * class of noise without changing a real resize.
 */

export interface FitProposal {
  scale: number;
  width: number;
}

/** Below this a new scale is treated as the same as the last one. */
export const SCALE_EPS = 0.015;
/** Below this a new width (px) is treated as the same as the last one. */
export const WIDTH_EPS = 2;
/**
 * Pane `avail` / `room` flicker below this (px) is ignored. Classic scrollbars
 * steal ~15–17px of `clientWidth` when overflow toggles; the forced-avail
 * repro alternated by 6px. 20px covers both without hiding a real resize.
 */
export const MEASURE_EPS = 20;

/** Snap scale to thousandths so sub-pixel noise cannot flip the string. */
export function quantizeScale(scale: number): number {
  return Math.round(scale * 1000) / 1000;
}

/** Hold the last stable measure so ±a few px of RO noise cannot re-enter. */
export function stabilizeMeasure(next: number, prev: number, eps = MEASURE_EPS): number {
  if (prev > 0 && Math.abs(next - prev) <= eps) return prev;
  return next;
}

export interface SquashInput {
  mode: 'squash';
  natural: number;
  tailNatural: number;
  avail: number;
  room: number;
  floor: number;
  prevScale: number;
  prevWidth: number;
}

export interface GrowInput {
  mode: 'grow';
  natural: number;
  avail: number;
  room: number;
  floor: number;
  baseWidth: number;
  spriteCeil: number;
  prevScale: number;
  prevWidth: number;
}

/**
 * A block that gives up its own height at a held zoom before that zoom
 * shrinks (the league summary, `homeLayout.ts`). `shortest` is the height of
 * its tightest layout at zoom 1. A grow block lays out at `baseWidth`; a
 * squash block has none and fills the room at any zoom.
 */
export interface HoldInput {
  mode: 'hold';
  shortest: number;
  avail: number;
  room: number;
  floor: number;
  /** The zoom the block holds while its layout gives up height. */
  hold: number;
  baseWidth?: number;
  prevScale: number;
  prevWidth: number;
}

export type FitInput = SquashInput | GrowInput | HoldInput;

/**
 * Next fit, or `null` when the previous fit already matches within the
 * deadband. Returning null is what stops the ResizeObserver loop.
 */
export function proposeFit(input: FitInput): FitProposal | null {
  if (input.mode === 'hold') return proposeHold(input);
  if (input.natural <= 0) return null;

  let scale: number;
  let width: number;

  if (input.mode === 'grow') {
    const wScale = input.room / input.baseWidth;
    const hScale = input.avail / input.natural;
    scale = Math.max(input.floor, Math.min(wScale, hScale, input.spriteCeil));
    width = input.baseWidth;
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

/**
 * The held zoom: `hold` whenever the tightest layout fits under it,
 * otherwise the largest zoom at which that layout fits.
 *
 * It is neither rounded nor deadbanded. A held sprite ceiling is a zoom that
 * puts a sprite on whole device pixels, and rounding it to thousandths moves
 * it off them. The deadband exists because a squash reads its own natural
 * height, so its zoom feeds back into its next measure. This zoom reads only
 * the pane, never the block, so it has no loop to damp; and a held zoom that
 * is larger than the pane allows spills rows off the screen.
 */
function proposeHold(input: HoldInput): FitProposal | null {
  if (input.shortest <= 0) return null;
  const wide = input.baseWidth ? input.room / input.baseWidth : Infinity;
  const fits = Math.min(wide, input.avail / input.shortest);
  const scale = Math.max(input.floor, Math.min(input.hold, fits));
  // A squash block keeps the pane's full width at every zoom.
  const width = input.baseWidth ?? input.room / scale;
  if (scale === input.prevScale && width === input.prevWidth) return null;
  return { scale, width };
}
