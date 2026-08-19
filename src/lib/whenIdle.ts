/** Runs work when the main thread goes idle, with a timeout so it still runs
 *  on browsers without `requestIdleCallback` (Safari) or under constant load. */
type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

export function whenIdle(cb: () => void, timeoutMs = 3000): void {
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(cb, { timeout: timeoutMs });
  } else {
    setTimeout(cb, Math.min(1500, timeoutMs));
  }
}
