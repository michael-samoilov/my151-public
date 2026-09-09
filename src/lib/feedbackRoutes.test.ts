import { describe, expect, it } from 'vitest';
import { routeCounts } from './feedbackRoutes';

const NOW = Date.UTC(2026, 8, 9, 12, 0, 0);
const DAY = 86_400_000;

const report = (route: string | undefined, daysAgo: number) => ({
  ts: NOW - daysAgo * DAY,
  context: route === undefined ? {} : { route },
});

describe('routeCounts', () => {
  it('counts each window separately', () => {
    const rows = routeCounts([report('league', 1), report('league', 20)], NOW);
    expect(rows).toEqual([{ route: 'league', label: 'Gym leader maker', last7: 1, last30: 2 }]);
  });

  it('drops reports older than 30 days', () => {
    expect(routeCounts([report('builder', 31)], NOW)).toEqual([]);
  });

  it('orders by the 30-day count, busiest first', () => {
    const rows = routeCounts(
      [report('builder', 1), report('builder', 2), report('league', 1)],
      NOW,
    );
    expect(rows.map((r) => r.route)).toEqual(['builder', 'league']);
  });

  it('buckets a report with no route as unknown', () => {
    expect(routeCounts([report(undefined, 1)], NOW)[0]).toMatchObject({
      route: 'unknown',
      label: 'Unknown',
    });
  });

  it('keeps a route it has no label for, under its own name', () => {
    expect(routeCounts([report('some-new-page', 1)], NOW)[0]).toMatchObject({
      route: 'some-new-page',
      label: 'some-new-page',
    });
  });

  it('handles no reports', () => {
    expect(routeCounts([], NOW)).toEqual([]);
  });
});
