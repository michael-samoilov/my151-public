import { describe, expect, it } from 'vitest';
import {
  createBeaconDebouncer,
  PROGRESS_DEBOUNCE_MS,
  PROGRESS_MAX_WAIT_MS,
} from './beaconScheduler';
import { SUBMIT_CLIENT_DAILY_CAP } from '../../api/_limits';

/** Deterministic clock + timer registry, so the tests drive time explicitly. */
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
  it('fires once, delayMs after a single schedule', () => {
    const { debouncer, advance } = harness({ delayMs: 4000, maxWaitMs: 15000 });
    const fired: number[] = [];
    debouncer.schedule(() => fired.push(1));
    advance(3999);
    expect(fired).toEqual([]);
    advance(1);
    expect(fired).toEqual([1]);
    advance(60000);
    expect(fired).toEqual([1]);
  });

  it('is not starved by continuous rescheduling: fires by maxWait', () => {
    const { debouncer, advance } = harness({ delayMs: 4000, maxWaitMs: 15000 });
    const fired: string[] = [];
    // An edit every second — never a 4s quiet gap. The old debounce sent
    // nothing for the whole burst.
    for (let i = 0; i < 30 && fired.length === 0; i++) {
      debouncer.schedule(() => fired.push(`edit-${i}`));
      advance(1000);
    }
    expect(fired.length).toBe(1);
    // Fired at the deadline (15s), carrying the latest payload at that moment.
    expect(fired[0]).toBe('edit-14');
  });

  it('flush delivers the pending fire immediately, and only once', () => {
    const { debouncer, advance } = harness({ delayMs: 4000, maxWaitMs: 15000 });
    const fired: number[] = [];
    debouncer.schedule(() => fired.push(1));
    advance(1000);
    debouncer.flush();
    expect(fired).toEqual([1]);
    // The timer that was pending must not fire it a second time.
    advance(60000);
    expect(fired).toEqual([1]);
  });

  it('flush when idle is a no-op', () => {
    const { debouncer } = harness({ delayMs: 4000, maxWaitMs: 15000 });
    expect(() => debouncer.flush()).not.toThrow();
    expect(debouncer.pending()).toBe(false);
  });

  it('keeps only the latest payload', () => {
    const { debouncer, advance } = harness({ delayMs: 4000, maxWaitMs: 15000 });
    const fired: string[] = [];
    debouncer.schedule(() => fired.push('a'));
    advance(1000);
    debouncer.schedule(() => fired.push('b'));
    advance(4000);
    expect(fired).toEqual(['b']);
  });

  it('starts a fresh maxWait window after each fire', () => {
    const { debouncer, advance } = harness({ delayMs: 4000, maxWaitMs: 15000 });
    const fired: number[] = [];
    debouncer.schedule(() => fired.push(1));
    advance(4000);
    expect(fired).toEqual([1]);
    debouncer.schedule(() => fired.push(2));
    advance(3999);
    expect(fired).toEqual([1]);
    advance(1);
    expect(fired).toEqual([1, 2]);
  });

  // The client's send cadence and the server's per-client allowance are tuned
  // in different files, and the first time they drifted apart it was a
  // production data-loss bug: a 15s max wait against a 120/day cap dropped
  // beacons from every user who built for more than ~30 minutes, and the
  // admin dashboard showed their sessions truncated or missing. This test is
  // the coupling: change either number and the arithmetic is re-checked here.
  it('the maximum client send rate fits inside the server daily allowance', () => {
    const perHour = 3_600_000 / PROGRESS_MAX_WAIT_MS;
    // One tab editing nonstop for 24 hours — the policy's absolute ceiling.
    expect(perHour * 24).toBeLessThanOrEqual(SUBMIT_CLIENT_DAILY_CAP);
    // Two tabs sharing one cid all day still fit: same person, double cadence.
    expect(perHour * 24 * 2).toBeLessThanOrEqual(SUBMIT_CLIENT_DAILY_CAP);
    // The debounce stays shorter than the cap window it collapses into.
    expect(PROGRESS_DEBOUNCE_MS).toBeLessThan(PROGRESS_MAX_WAIT_MS);
  });

  it('a fire that throws does not wedge the debouncer', () => {
    const { debouncer, advance } = harness({ delayMs: 4000, maxWaitMs: 15000 });
    const fired: string[] = [];
    debouncer.schedule(() => {
      throw new Error('network stack exploded');
    });
    expect(() => advance(4000)).toThrow();
    expect(debouncer.pending()).toBe(false);
    debouncer.schedule(() => fired.push('next'));
    advance(4000);
    expect(fired).toEqual(['next']);
  });
});
