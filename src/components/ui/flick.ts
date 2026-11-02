// platform: Vaul closes a sheet on release at 0.4 px/ms, and FLICK_PX_PER_MS matches it.
const FLICK_PX_PER_MS = 0.4;
const FLICK_MIN_PX = 24;

export function isFlick(distancePx: number, elapsedMs: number): boolean {
  return distancePx > FLICK_MIN_PX && distancePx / elapsedMs > FLICK_PX_PER_MS;
}
