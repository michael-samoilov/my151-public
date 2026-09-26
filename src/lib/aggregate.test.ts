import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  aggregate,
  buildDepthCurve,
  dailyActive,
  hourlyActive,
  depthByDevice,
  heatmaps,
  mergeByCid,
  referrerFlow,
  retention,
  sessionCurves,
  tallies,
  tallyCohort,
  dexUsageFunnel,
  leagueUsageFunnel,
  funnelEventCount,
  UNKNOWN_REFERRER_HOST,
  type Referrable,
  type SessionRecord,
} from '../../api/_aggregate';

// Two hand-built records, one per tool shape, so every assertion below is a
// number a reader can recompute by hand.
const T0 = Date.UTC(2026, 8, 1, 12, 0, 0); // Tue 2026-09-01 12:00 UTC

/** A dex-shaped record: two sessions, two days apart. */
const dex = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  cid: 'aaaa-0001',
  firstTs: T0,
  lastTs: T0 + 2 * DAY_MS,
  sessions: 2,
  sessionMs: [60_000, 300_000],
  sessionLog: [{ ts: T0 }, { ts: T0 + 2 * DAY_MS }],
  country: 'US',
  tz: 'UTC',
  lang: 'en-US',
  locale: 'en',
  device: 'Desktop',
  os: 'macOS',
  browser: 'Chrome',
  ...over,
});

/** A league-shaped record: one session, the day after the dex record started. */
const league = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  cid: 'bbbb-0002',
  firstTs: T0 + DAY_MS,
  lastTs: T0 + DAY_MS,
  sessions: 1,
  sessionMs: [120_000],
  sessionLog: [{ ts: T0 + DAY_MS }],
  country: 'JP',
  tz: 'UTC',
  lang: 'ja',
  locale: 'ja',
  device: 'Mobile',
  os: 'iOS',
  browser: 'Safari',
  ...over,
});

describe('dailyActive', () => {
  it('fills the gap between two active days', () => {
    const series = dailyActive([dex()]);
    expect(series.map((p) => p.dau)).toEqual([1, 0, 1]);
  });

  it('counts a returning browser once in calendar rolling7', () => {
    const series = dailyActive([dex()], T0 + 6 * DAY_MS);
    expect(series[6].rolling7).toBe(1);
  });

  it('sets label24h and label168h only on today when now is given', () => {
    const hour = DAY_MS / 24;
    const first = T0;
    const second = T0 + 20 * hour;
    const rec = dex({
      sessionLog: [{ ts: first }, { ts: second }],
      firstTs: first,
      lastTs: second,
    });
    const now = T0 + 25 * hour;
    const series = dailyActive([rec], now);
    expect(series[0].label24h).toBeUndefined();
    const last = series[series.length - 1];
    expect(last.dau).toBe(1);
    expect(last.label24h).toBe(1);
    expect(last.label168h).toBeNull();
  });

  it('falls back to first and last activity when a record has no session log', () => {
    const series = dailyActive([dex({ sessionLog: undefined })]);
    expect(series).toHaveLength(3);
    expect(series[0].dau).toBe(1);
    expect(series[2].dau).toBe(1);
  });

  it('returns nothing for no records', () => {
    expect(dailyActive([])).toEqual([]);
  });

  it('extends through the given now day when that day has no activity', () => {
    const series = dailyActive([dex()], T0 + 5 * DAY_MS);
    expect(series.map((p) => p.dau)).toEqual([1, 0, 1, 0, 0, 0]);
    expect(series[series.length - 1].day).toBe(Date.UTC(2026, 8, 6));
  });
});

describe('hourlyActive', () => {
  const hour = DAY_MS / 24;

  it('returns nothing for no records', () => {
    expect(hourlyActive([], T0)).toEqual([]);
  });

  it('counts unique browsers in each UTC hour and fills zeros through now', () => {
    const rec = dex({
      sessionLog: [{ ts: T0 }, { ts: T0 + 3 * hour }],
      firstTs: T0,
      lastTs: T0 + 3 * hour,
    });
    const now = T0 + 5 * hour;
    const series = hourlyActive([rec], now);
    expect(series[0].hour).toBe(Date.UTC(2026, 7, 26, 0, 0, 0));
    expect(series[series.length - 1].hour).toBe(Date.UTC(2026, 8, 1, 17, 0, 0));
    const byHour = new Map(series.map((p) => [p.hour, p.unique]));
    expect(byHour.get(T0)).toBe(1);
    expect(byHour.get(T0 + hour)).toBe(0);
    expect(byHour.get(T0 + 3 * hour)).toBe(1);
    expect(byHour.get(T0 + 5 * hour)).toBe(0);
  });

  it('counts two browsers in the same hour once each', () => {
    const series = hourlyActive([dex(), league({ firstTs: T0, lastTs: T0, sessionLog: [{ ts: T0 }] })], T0);
    expect(series.find((p) => p.hour === T0)?.unique).toBe(2);
  });

  it('covers the last seven UTC days through the current hour', () => {
    const now = T0 + 6 * DAY_MS + 18 * hour;
    const series = hourlyActive([dex()], now);
    expect(series[0].hour).toBe(Date.UTC(2026, 8, 2, 0, 0, 0));
    expect(series[series.length - 1].hour).toBe(Date.UTC(2026, 8, 8, 6, 0, 0));
    expect(series).toHaveLength(6 * 24 + 7);
  });
});

describe('retention', () => {
  it('counts a record spanning two days as returning', () => {
    expect(retention([dex(), league()], T0 + 2 * DAY_MS)).toEqual({
      returning: 1,
      activeLast7: 2,
      newUsers: 1,
    });
  });

  it('drops a record out of activeLast7 after seven days', () => {
    expect(retention([league()], T0 + 9 * DAY_MS).activeLast7).toBe(0);
  });
});

describe('sessionCurves', () => {
  it('separates the first session from the longest', () => {
    const curves = sessionCurves([dex()]);
    // First is 60s, longest is 300s: half of each is the same single sample.
    expect(curves.first.stats.p50).toBe(60);
    expect(curves.longest.stats.p50).toBe(300);
    expect(curves.all.n).toBe(2);
  });

  it('treats a legacy record as one session spanning first to last', () => {
    const curves = sessionCurves([dex({ sessionMs: undefined })]);
    expect(curves.longest.stats.p50).toBe((2 * DAY_MS) / 1000);
  });
});

describe('tallies', () => {
  it('counts browsers per value and skips absent ones', () => {
    expect(tallies([dex(), league(), dex({ cid: 'cccc-0003', country: undefined })], 'country')).toEqual({
      US: 1,
      JP: 1,
    });
  });
});

describe('heatmaps', () => {
  const total = (m: number[][]) => m.flat().reduce((a, b) => a + b, 0);

  it('reads Eastern Time with daylight saving: the same UTC hour is noon in July and 11 AM in January', () => {
    const july = dex({ cid: 'jul', tz: 'Asia/Tokyo', lastTs: Date.UTC(2026, 6, 15, 16) }); // Wed
    const january = dex({ cid: 'jan', tz: 'Asia/Tokyo', lastTs: Date.UTC(2026, 0, 14, 16) }); // Wed
    const { eastern } = heatmaps([july, january]);
    expect(eastern[3][12]).toBe(1);
    expect(eastern[3][11]).toBe(1);
  });

  it('leaves a browser without a timezone out of local time and keeps it in Eastern Time', () => {
    const london = dex({ cid: 'ldn', tz: 'Europe/London', lastTs: Date.UTC(2026, 8, 3, 12) }); // Thu 13:00 BST
    // What submit stores for a browser with no timezone: UTC wall-clock fields.
    const noTz = { ...dex({ cid: 'none', tz: undefined, lastTs: Date.UTC(2026, 8, 3, 12) }), localDow: 4, localHour: 12 };
    const { local, eastern } = heatmaps([london, noTz]);
    expect(total(local)).toBe(1);
    expect(local[4][13]).toBe(1);
    expect(total(eastern)).toBe(2);
    expect(eastern[4][8]).toBe(2);
  });
});

describe('buildDepthCurve', () => {
  it('reports the share reaching each count', () => {
    const curve = buildDepthCurve([1, 3, 11, 11]);
    expect(curve.survival[0].s).toBe(1); // everyone reached 0
    expect(curve.survival[3].s).toBe(0.75); // three of four reached 3
    expect(curve.survival[11].s).toBe(0.5); // two of four reached 11
  });
});

describe('mergeByCid', () => {
  const shared = 'dddd-0004';

  it('makes one record out of the same browser in both tools', () => {
    const merged = mergeByCid([
      [dex({ cid: shared })],
      [league({ cid: shared })],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sessions).toBe(3);
    expect(merged[0].firstTs).toBe(T0);
    expect(merged[0].lastTs).toBe(T0 + 2 * DAY_MS);
  });

  // The reason merging is not a concat: the league session sits BETWEEN the
  // two dex sessions, so "first session" is only right in time order.
  it('interleaves the two tools sessions by time', () => {
    const merged = mergeByCid([[dex({ cid: shared })], [league({ cid: shared })]]);
    expect(merged[0].sessionMs).toEqual([60_000, 120_000, 300_000]);
    expect(sessionCurves(merged).first.stats.p50).toBe(60);
  });

  it('counts a merged browser once per active day', () => {
    const merged = mergeByCid([[dex({ cid: shared })], [league({ cid: shared })]]);
    expect(dailyActive(merged).map((p) => p.dau)).toEqual([1, 1, 1]);
  });

  // A dex record split into cid::COUNTRY is still one browser to the league
  // store, which never split it.
  it('folds a country-split dex record back onto the bare cid', () => {
    const merged = mergeByCid([
      [dex({ cid: `${shared}::US` })],
      [league({ cid: shared })],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].cid).toBe(shared);
  });

  it('leaves browsers that used only one tool alone', () => {
    expect(mergeByCid([[dex()], [league()]])).toHaveLength(2);
  });
});

describe('aggregate', () => {
  it('reports every slice from one pass', () => {
    const agg = aggregate([dex(), league()], T0 + 2 * DAY_MS);
    expect(agg.users).toBe(2);
    expect(agg.devices).toEqual({ Desktop: 1, Mobile: 1 });
    expect(agg.os).toEqual({ macOS: 1, iOS: 1 });
    expect(agg.joints).toEqual([
      { device: 'Desktop', os: 'macOS', browser: 'Chrome', n: 1 },
      { device: 'Mobile', os: 'iOS', browser: 'Safari', n: 1 },
    ]);
    expect(agg.activity).toHaveLength(3);
    expect(agg.hourly.length).toBeGreaterThan(1);
    expect(agg.hourly[0]).toEqual(expect.objectContaining({ hour: expect.any(Number), unique: expect.any(Number) }));
    expect(Object.keys(agg.heatmaps)).toEqual(['local', 'eastern']);
  });

  it('tallies country, browser language, served locale, and pin together', () => {
    const pinned = dex({
      cid: 'fr-pin',
      country: 'fr',
      lang: 'fr',
      locale: 'en',
      switched: 'en',
      firstTs: T0,
      lastTs: T0,
      sessionLog: [{ ts: T0 }],
    });
    const match = dex({
      cid: 'us-pin',
      country: 'US',
      lang: 'en-US',
      locale: 'en',
      switched: 'en',
      firstTs: T0,
      lastTs: T0,
      sessionLog: [{ ts: T0 }],
    });
    const stale = dex({
      cid: 'old-gb',
      country: 'GB',
      lang: 'en-GB',
      locale: 'en',
      firstTs: T0 - 30 * DAY_MS,
      lastTs: T0 - 20 * DAY_MS,
      sessionLog: [{ ts: T0 - 20 * DAY_MS }],
    });
    const agg = aggregate([pinned, match, stale], T0);
    expect(agg.countries7d).toBe(2);
    expect(agg.whoBuckets).toEqual([
      { country: 'FR', lang: 'fr', locale: 'en', switched: 'en', device: 'Desktop', os: 'macOS', browser: 'Chrome', n: 1, n7d: 1 },
      { country: 'GB', lang: 'en-GB', locale: 'en', switched: '', device: 'Desktop', os: 'macOS', browser: 'Chrome', n: 1, n7d: 0 },
      { country: 'US', lang: 'en-US', locale: 'en', switched: 'en', device: 'Desktop', os: 'macOS', browser: 'Chrome', n: 1, n7d: 1 },
    ]);
  });
});

describe('tallyCohort', () => {
  it('counts users and tallies device/country/browser for the slice given', () => {
    const cohort = tallyCohort([dex(), dex({ cid: 'cccc-0003', country: 'FR', device: 'Mobile' })]);
    expect(cohort.users).toBe(2);
    expect(cohort.devices).toEqual({ Desktop: 1, Mobile: 1 });
    expect(cohort.countries).toEqual({ US: 1, FR: 1 });
    expect(cohort.browsers).toEqual({ Chrome: 2 });
    expect(cohort.os).toEqual({ macOS: 2 });
    expect(cohort.joints).toEqual([
      { device: 'Desktop', os: 'macOS', browser: 'Chrome', n: 1 },
      { device: 'Mobile', os: 'macOS', browser: 'Chrome', n: 1 },
    ]);
  });

  it('reports zero users for an empty slice', () => {
    expect(tallyCohort([]).users).toBe(0);
  });
});

describe('depthByDevice', () => {
  it('splits the depth curve by device, and keeps every value in "all"', () => {
    const curves = depthByDevice([
      { device: 'Desktop', value: 5 },
      { device: 'Mobile', value: 2 },
      { device: 'Mobile', value: 8 },
      { device: 'Tablet', value: 1 }, // neither split, but still in "all"
    ]);
    expect(curves.all.n).toBe(4);
    expect(curves.desktop.n).toBe(1);
    expect(curves.mobile.n).toBe(2);
    expect(curves.mobile.stats.p50).toBe(8); // quantile rounds up: index floor(0.5*2)=1
  });
});

describe('referrerFlow', () => {
  const withReferrer = (cid: string, firstReferrer: string): Referrable => ({ cid, firstReferrer });

  it('groups by host and counts distinct browsers per store', () => {
    const dexRecords = [withReferrer('aaaa', 'reddit.com'), withReferrer('bbbb', 'reddit.com')];
    const leagueRecords = [withReferrer('bbbb', 'reddit.com'), withReferrer('cccc', 't.co')];
    const rows = referrerFlow(dexRecords, leagueRecords);
    expect(rows).toEqual([
      { host: 'reddit.com', total: 2, dex: 2, league: 1 }, // aaaa, bbbb: total is distinct browsers, not dex+league
      { host: 't.co', total: 1, dex: 0, league: 1 },
    ]);
  });

  it('folds a country-split dex cid onto the bare cid before counting', () => {
    const rows = referrerFlow([withReferrer('aaaa::FR', 'reddit.com')], []);
    expect(rows).toEqual([{ host: 'reddit.com', total: 1, dex: 1, league: 0 }]);
  });

  it('counts records with no referrer as referrer not known', () => {
    const rows = referrerFlow([{ cid: 'aaaa' }], [{ cid: 'bbbb' }]);
    expect(rows).toEqual([
      { host: UNKNOWN_REFERRER_HOST, total: 2, dex: 1, league: 1 },
    ]);
  });

  it('keeps the unknown bucket even when it is not in the top 8 named hosts', () => {
    const dexRecords = Array.from({ length: 9 }, (_, i) =>
      withReferrer(`cid-${i}`, `host-${i}.com`),
    );
    dexRecords.push({ cid: 'no-ref' });
    const rows = referrerFlow(dexRecords, []);
    expect(rows).toHaveLength(9);
    expect(rows[rows.length - 1]).toEqual({
      host: UNKNOWN_REFERRER_HOST,
      total: 1,
      dex: 1,
      league: 0,
    });
  });

  it('sorts by total reach descending and caps at the top 8 hosts', () => {
    const dexRecords = Array.from({ length: 9 }, (_, i) =>
      withReferrer(`cid-${i}`, `host-${i}.com`),
    );
    // Give host-0 a second browser so it is unambiguously the top host.
    dexRecords.push(withReferrer('cid-extra', 'host-0.com'));
    const rows = referrerFlow(dexRecords, []);
    expect(rows).toHaveLength(8);
    expect(rows[0].host).toBe('host-0.com');
    expect(rows[0].total).toBe(2);
  });
});

describe('funnelEventCount', () => {
  it('reads hyphen and underscore keys', () => {
    expect(funnelEventCount({ 'intro-shown': 10 }, 'intro-shown')).toBe(10);
    expect(funnelEventCount({ intro_shown: 7 }, 'intro-shown')).toBe(7);
    expect(funnelEventCount({}, 'intro-shown')).toBe(0);
  });
});

describe('dexUsageFunnel', () => {
  const row = (cid: string, peakMon: number, completed = false, exported = false) => ({
    cid,
    peakMon,
    completed,
    exported,
  });

  it('splits incomplete builds into size tiers and keeps completed out of buckets', () => {
    const f = dexUsageFunnel(
      [
        row('a', 12),
        row('b', 40),
        row('c', 70),
        row('d', 100),
        row('e', 130),
        row('f', 151, true, true),
        row('g', 151, true, false),
      ],
      10,
    );
    expect(f.opened).toBe(10);
    expect(f.built).toBe(7);
    expect(f.bounced).toBe(3);
    expect(f.buckets.map((p) => p.count)).toEqual([1, 1, 1, 1, 1]);
    expect(f.completed).toBe(2);
    expect(f.exported).toBe(1);
    expect(f.keptPrivate).toBe(1);
    expect(f.buckets.reduce((s, p) => s + p.count, 0) + f.completed).toBe(f.built);
  });

  it('puts a peak of 0 in the first incomplete tier and folds a country-split cid', () => {
    const f = dexUsageFunnel([row('aaaa::FR', 0), row('aaaa', 20)], 0);
    expect(f.built).toBe(1);
    expect(f.buckets[0].count).toBe(1);
    expect(f.buckets[0].label).toBe('1–30');
  });

  it('counts an incomplete exporter on their size bucket, not on Completed', () => {
    const f = dexUsageFunnel(
      [
        row('a', 25, false, true),
        row('b', 151, true, true),
      ],
      2,
    );
    expect(f.exported).toBe(1);
    expect(f.buckets).toEqual([{ label: '1–30', count: 1, exported: 1 }]);
  });
});

describe('leagueUsageFunnel', () => {
  const row = (
    fullGyms: number,
    over: { maxCards?: number; maxSeats?: number; exportsCard?: number; exportsLeague?: number } = {},
  ) => ({
    maxCards: over.maxCards ?? Math.max(fullGyms, 1),
    maxSeats: over.maxSeats ?? Math.max(fullGyms, 1),
    fullGyms,
    exportsCard: over.exportsCard ?? 0,
    exportsLeague: over.exportsLeague ?? 0,
  });

  it('splits placed users into unfinished cards and in-line gym buckets', () => {
    const f = leagueUsageFunnel(
      [
        row(0, { maxCards: 1, maxSeats: 1 }),
        row(2),
        row(6, { exportsCard: 1 }),
        row(11),
        row(13),
        row(14, { exportsLeague: 1, exportsCard: 1 }),
        row(14, { exportsCard: 1 }),
      ],
      12,
    );
    expect(f.opened).toBe(12);
    expect(f.placed).toBe(7);
    expect(f.bounced).toBe(5);
    expect(f.cardNotFinished).toBe(1);
    expect(f.oneGymFull).toBe(6);
    expect(f.gymBuckets.map((p) => ({ label: p.label, count: p.count }))).toEqual([
      { label: '1–4 gyms', count: 1 },
      { label: '5–8 gyms', count: 1 },
      { label: '9–12 gyms', count: 2 },
      { label: 'Full league', count: 2 },
    ]);
    expect(f.fullLeague).toBe(2);
    expect(f.exportedLeague).toBe(1);
    expect(f.exportedCard).toBe(2);
    expect(f.keptPrivate).toBe(0);
    expect(f.gymBuckets.reduce((s, p) => s + p.count, 0)).toBe(f.oneGymFull);
  });

  it('counts full-league non-exporters as kept private', () => {
    const f = leagueUsageFunnel(
      [row(14, { exportsLeague: 1 }), row(14), row(3, { exportsCard: 1 })],
      3,
    );
    expect(f.fullLeague).toBe(2);
    expect(f.keptPrivate).toBe(1);
    expect(f.gymBuckets.find((b) => b.label === 'Full league')).toEqual({
      label: 'Full league',
      count: 2,
      exportedLeague: 1,
      exportedCard: 0,
    });
  });

  it('counts exports from an unfinished gym bucket', () => {
    const f = leagueUsageFunnel([row(3, { exportsCard: 1 }), row(3, { exportsLeague: 1 })], 2);
    expect(f.gymBuckets).toEqual([
      { label: '1–4 gyms', count: 2, exportedLeague: 1, exportedCard: 1 },
    ]);
    expect(f.exportedLeague).toBe(1);
    expect(f.exportedCard).toBe(1);
  });

  it('floors opened at placed when the open event undercounts', () => {
    const f = leagueUsageFunnel([row(0, { maxSeats: 2, maxCards: 1 }), row(14, { exportsLeague: 1 })], 0);
    expect(f.opened).toBe(2);
    expect(f.placed).toBe(2);
    expect(f.bounced).toBe(0);
    expect(f.cardNotFinished).toBe(1);
  });

  it('does not count a zero-seat record as placed', () => {
    const f = leagueUsageFunnel(
      [row(0, { maxCards: 0, maxSeats: 0 }), row(2)],
      5,
    );
    expect(f.placed).toBe(1);
    expect(f.opened).toBe(5);
    expect(f.bounced).toBe(4);
  });
});
