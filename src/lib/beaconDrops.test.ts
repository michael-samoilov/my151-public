import { describe, expect, it } from 'vitest';
import { DROP_REASON_INFO, DROP_PREFIXES, liveDropReasons } from './beaconDrops';

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

  it('still shows live reasons alongside the retired one', () => {
    expect(
      liveDropReasons({ 'submit-drop:rate-limit': 31, 'submit-drop:rate-limit-ip': 4 }),
    ).toEqual([{ tool: 'dex', reason: 'rate-limit-ip', count: 4 }]);
  });

  it('drops zero counts, so an initialized-but-unused counter is not a warning', () => {
    expect(liveDropReasons({ 'submit-drop:contention': 0 })).toEqual([]);
  });

  it('orders by count, largest first', () => {
    expect(
      liveDropReasons({
        'submit-drop:contention': 2,
        'submit-drop:rate-limit-ip': 12,
        'submit-drop:cap': 5,
      }),
    ).toEqual([
      { tool: 'dex', reason: 'rate-limit-ip', count: 12 },
      { tool: 'dex', reason: 'cap', count: 5 },
      { tool: 'dex', reason: 'contention', count: 2 },
    ]);
  });

  it('handles missing data', () => {
    expect(liveDropReasons(undefined)).toEqual([]);
    expect(liveDropReasons({})).toEqual([]);
  });

  // The gym leader maker records the same four reasons under its own prefix.
  // Before this, its drops were invisible: the notice read only `submit-drop:`,
  // so a league store losing every beacon looked exactly like a healthy one.
  it('reads both tools drop counters', () => {
    expect(
      liveDropReasons({ 'submit-drop:cap': 2, 'league-drop:contention': 7 }),
    ).toEqual([
      { tool: 'league', reason: 'contention', count: 7 },
      { tool: 'dex', reason: 'cap', count: 2 },
    ]);
  });

  it('narrows to one tool when asked', () => {
    const events = { 'submit-drop:cap': 2, 'league-drop:contention': 7 };
    expect(liveDropReasons(events, 'dex')).toEqual([{ tool: 'dex', reason: 'cap', count: 2 }]);
    expect(liveDropReasons(events, 'league')).toEqual([
      { tool: 'league', reason: 'contention', count: 7 },
    ]);
  });

  it('applies the retired-reason rule to both tools', () => {
    expect(liveDropReasons({ 'league-drop:rate-limit': 3 })).toEqual([]);
  });

  // A reason with no entry here renders as a bare code with no explanation,
  // which is the state this whole panel exists to remove. Every reason
  // api/submit.ts can write must have copy.
  it('explains every reason the server can record', () => {
    const serverReasons = ['rate-limit-ip', 'rate-limit-client', 'cap', 'contention'];
    for (const reason of serverReasons) {
      expect(DROP_REASON_INFO[reason], `no copy for '${reason}'`).toBeDefined();
      expect(DROP_REASON_INFO[reason].reading.length).toBeGreaterThan(0);
    }
    // Both endpoints write the same reasons, so one set of copy covers both.
    expect(Object.keys(DROP_PREFIXES)).toEqual(['dex', 'league']);
  });
});
