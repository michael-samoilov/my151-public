import { describe, expect, it } from 'vitest';
import { liveDropReasons } from './beaconDrops';

describe('liveDropReasons', () => {
  it('ignores funnel keys that are not drop counters', () => {
    expect(
      liveDropReasons({ 'intro-shown': 40, 'milestone-25': 12, 'submit-drop:cap': 3 }),
    ).toEqual([{ tool: 'dex', reason: 'cap', count: 3 }]);
  });

  // The reason this module exists. The pre-split `rate-limit` counter holds 31
  // real drops from before the cadence/cap fix, and nothing increments it any
  // more — so it can never clear, and showing it means the dashboard carries a
  // permanent warning about a problem that is already fixed.
  it('hides the retired rate-limit counter', () => {
    expect(liveDropReasons({ 'submit-drop:rate-limit': 31 })).toEqual([]);
  });

  it('drops zero counts, so an initialized-but-unused counter is not a warning', () => {
    expect(liveDropReasons({ 'submit-drop:contention': 0 })).toEqual([]);
  });
});
