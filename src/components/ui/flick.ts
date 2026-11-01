// A flick closes a sheet short of its drag threshold. 0.4 px/ms is Vaul's
// release speed; the minimum keeps a tap's jitter from counting.
const FLICK_PX_PER_MS = 0.4;
const FLICK_MIN_PX = 24;

export function isFlick(distancePx: number, elapsedMs: number): boolean {
  return distancePx > FLICK_MIN_PX && distancePx / elapsedMs > FLICK_PX_PER_MS;
}
