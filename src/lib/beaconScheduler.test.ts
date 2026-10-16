import { describe, expect, it } from 'vitest';
import {
  createBeaconDebouncer,
  PROGRESS_DEBOUNCE_MS,
  PROGRESS_MAX_WAIT_MS,
} from './beaconScheduler';
import { SUBMIT_CLIENT_DAILY_CAP } from '../../api/_limits';

function harness(opts: { delayMs: number; maxWaitMs: number }) {
  let t = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const debouncer = createBeaconDebouncer({
    ...opts,
    now: () => t,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: t + ms, fn, id });
      return id;
    },
    clearTimer: (handle) => {
      const i = timers.findIndex((x) => x.id === handle);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      t = due.at;
      timers.splice(timers.indexOf(due), 1);
      due.fn();
    }
    t = end;
  };
  return { debouncer, advance };
}

describe('createBeaconDebouncer', () => {
  it('is not starved by continuous rescheduling: fires by maxWait', () => {
    const { debouncer, advance } = harness({ delayMs: 4000, maxWaitMs: 15000 });
    const fired: string[] = [];
    for (let i = 0; i < 30 && fired.length === 0; i++) {
      debouncer.schedule(() => fired.push(`edit-${i}`));
      advance(1000);
    }
    expect(fired.length).toBe(1);
    expect(fired[0]).toBe('edit-14');
  });

  it('the maximum client send rate fits inside the server daily allowance', () => {
    const perHour = 3_600_000 / PROGRESS_MAX_WAIT_MS;
    expect(perHour * 24).toBeLessThanOrEqual(SUBMIT_CLIENT_DAILY_CAP);
    expect(perHour * 24 * 2).toBeLessThanOrEqual(SUBMIT_CLIENT_DAILY_CAP);
    expect(PROGRESS_DEBOUNCE_MS).toBeLessThan(PROGRESS_MAX_WAIT_MS);
  });
});
