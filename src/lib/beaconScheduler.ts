export const PROGRESS_DEBOUNCE_MS = 4000;
export const PROGRESS_MAX_WAIT_MS = 60_000;

export interface BeaconDebouncer {
  schedule(fire: () => void): void;
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
  let deadline = 0;

  const fireNow = () => {
    const fire = latest;
    latest = null;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
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
