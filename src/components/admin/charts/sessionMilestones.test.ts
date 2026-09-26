import { describe, expect, it } from 'vitest';
import { leagueSittingEv, plotSittings } from './sessionMilestones';

describe('plotSittings', () => {
  it('paints one green diamond when a sitting exported and did not skip', () => {
    const plots = plotSittings(
      [{ t: 10 }, { t: 80 }],
      [{ t: 80, label: 'export', tone: 'export' }],
    );
    expect(plots[0].diamond).toBeUndefined();
    expect(plots[0].label).toBe('');
    expect(plots[1].diamond).toEqual({ tone: 'export' });
    expect(plots[1].label).toBe('export');
  });

  it('paints each stored league nudge and keeps export green and skip red', () => {
    const ev = leagueSittingEv([
      'league-nudge-card-shown',
      'league-nudge-card-cta',
      'league-nudge-card-dismiss',
      'league-nudge-league-shown',
      'league-nudge-league-cta',
      'league-nudge-league-dismiss',
      'league-export-league',
      'league-export-card',
      'export_survey_skipped',
    ]);
    const plots = plotSittings([{ t: 10, ev }], [
      { t: 10, label: 'card', tone: 'export' },
      { t: 10, label: 'league', tone: 'export' },
      { t: 10, label: 'league · close', tone: 'skip', title: 'export_survey_skipped · league · close' },
    ]);
    expect(plots[0].funnel).toBe(true);
    expect(plots[0].diamond).toEqual({
      tone: 'skip',
      title: 'export_survey_skipped · league · close',
    });
    expect(plots[0].label).toBe(
      'card · league · league · close · card nudge · card go · card skip · 8 gyms · 8 gyms go · 8 gyms skip',
    );
    expect(plots[0].label).not.toMatch(/pokedex/);
  });
});
