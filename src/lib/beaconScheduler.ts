/**
 * Trailing debounce with a hard latency cap and an explicit flush.
 *
 * The progress beacon used a plain trailing debounce: each edit reset a 4s
 * timer, and the beacon fired 4s after the *last* edit. Two failure modes fell
 * out of that, both mobile-biased and both silent:
 *
 *   1. Starvation. A user editing continuously — never a 4s quiet gap — sent
 *      nothing for the whole burst. The only beacon was the one scheduled after
 *      their final edit.
 *   2. Loss at departure. That final pending timer died with the page. Closing
 *      the tab or swiping the app away within 4s of the last edit — the normal
 *      way a phone session ends — lost it. For a short first visit, that was
 *      every beacon: the user never existed in analytics.
 *
 * `maxWaitMs` fixes starvation: however often schedule() is called, the fire
 * happens no later than maxWait after the first pending call. `flush()` fixes
 * departure: lifecycle listeners (visibilitychange/pagehide) deliver the
 * pending beacon immediately while the page can still send it.
 *
 * Timer and clock are injectable so tests drive time; defaults are the real
 * ones.
 */

export interface BeaconDebouncer {
  /** Note new work. The latest `fire` wins; earlier pending ones are dropped. */
  schedule(fire: () => void): void;
  /** Deliver the pending fire now, if any. Safe to call when idle. */
  flush(): void;
  pending(): boolean;
}

interface DebouncerOptions {
  delayMs: number;
  maxWaitMs: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createBeaconDebouncer(opts: DebouncerOptions): BeaconDebouncer {
  const now = opts.now ?? (() => Date.now());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    opts.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let latest: (() => void) | null = null;
  let timer: unknown = null;
  /** Send-by time for the current pending window (set on its first schedule). */
  let deadline = 0;

  const fireNow = () => {
    const fire = latest;
    latest = null;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    // State is reset before firing, so a fire that throws cannot wedge the
    // debouncer with a stale `latest` that flush() would then re-send.
    if (fire) fire();
  };

  return {
    schedule(fire) {
      if (latest === null) deadline = now() + opts.maxWaitMs;
      latest = fire;
      const wait = Math.max(0, Math.min(opts.delayMs, deadline - now()));
      if (timer !== null) clearTimer(timer);
      timer = setTimer(fireNow, wait);
    },
    flush() {
      if (latest !== null) fireNow();
    },
    pending() {
      return latest !== null;
    },
  };
}
