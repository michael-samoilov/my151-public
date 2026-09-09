import { describe, expect, it } from 'vitest';
import { HAS_DEX, HAS_LEAGUE, type JournalEntry } from '../../api/_events';
import { hubViews, journalHealth } from './hubJournal';

const D1 = Date.UTC(2026, 8, 8, 10, 0, 0); // 2026-09-08
const D2 = Date.UTC(2026, 8, 9, 10, 0, 0); // 2026-09-09

const ev = (cid: string, event: JournalEntry['ev'], t: number): JournalEntry => ({
  t,
  cid,
  tool: 'hub',
  ev: event,
});

describe('hubViews', () => {
  it('counts browsers, not events', () => {
    const views = hubViews([
      ev('a', 'hub-shown', D1),
      ev('a', 'hub-cta-dex', D1),
      ev('a', 'hub-cta-dex', D1 + 1000),
      ev('b', 'hub-shown', D1),
    ]);
    expect(views.days[0].shown).toBe(2);
    expect(views.days[0].dexClicks).toBe(1);
  });

  it('splits the window into UTC days', () => {
    const views = hubViews([ev('a', 'hub-shown', D1), ev('b', 'hub-shown', D2)]);
    expect(views.days.map((d) => d.day)).toEqual(['2026-09-08', '2026-09-09']);
    expect(views.days.map((d) => d.shown)).toEqual([1, 1]);
  });

  // The trap this guards: totals as a sum of days double-count anyone who came
  // back, so a click share can read above 100%.
  it('counts a returning browser once in the totals', () => {
    const views = hubViews([ev('a', 'hub-shown', D1), ev('a', 'hub-shown', D2)]);
    expect(views.days.map((d) => d.shown)).toEqual([1, 1]);
    expect(views.totals.shown).toBe(1);
  });

  it('reports what became of the browsers that saw the hub', () => {
    const views = hubViews(
      [
        ev('dexonly', 'hub-shown', D1),
        ev('leagueonly', 'hub-shown', D1),
        ev('bothtools', 'hub-shown', D1),
        ev('bounced', 'hub-shown', D1),
      ],
      {
        dexonly: HAS_DEX,
        leagueonly: HAS_LEAGUE,
        bothtools: HAS_DEX | HAS_LEAGUE,
      },
    );
    expect(views.totals).toMatchObject({
      shown: 4,
      becameDex: 1,
      becameLeague: 1,
      becameBoth: 1,
      becameNeither: 1,
    });
  });

  it('counts the builder callout alongside the hub', () => {
    const views = hubViews([
      ev('a', 'league-promo-shown', D1),
      ev('a', 'league-promo-cta', D1),
      ev('b', 'league-promo-shown', D1),
      ev('b', 'league-promo-dismiss', D1),
    ]);
    expect(views.totals).toMatchObject({ promoShown: 2, promoCta: 1, promoDismiss: 1 });
  });

  it('ignores events that belong to another view', () => {
    const views = hubViews([ev('a', 'milestone-25', D1), ev('a', 'league-open', D1)]);
    expect(views.days).toEqual([]);
    expect(views.totals.shown).toBe(0);
  });

  it('handles an empty journal', () => {
    expect(hubViews([]).days).toEqual([]);
    expect(hubViews([]).totals.shown).toBe(0);
  });
});

describe('journalHealth', () => {
  const day = (d: string, count: number, capped = false) => ({ day: d, count, capped });

  it('keeps the last seven days, oldest first', () => {
    const days = Array.from({ length: 10 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, i));
    const health = journalHealth(days);
    expect(health.recent).toHaveLength(7);
    expect(health.recent[0].day).toBe('2026-09-04');
    expect(health.recent[6].day).toBe('2026-09-10');
  });

  it('reports the most recent capped day', () => {
    const health = journalHealth([
      day('2026-09-01', 50_000, true),
      day('2026-09-02', 12),
      day('2026-09-03', 50_000, true),
    ]);
    expect(health.lastCappedDay).toBe('2026-09-03');
  });

  it('reports no capped day when the cap was never hit', () => {
    expect(journalHealth([day('2026-09-01', 12)]).lastCappedDay).toBeNull();
  });
});
