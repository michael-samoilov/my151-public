import { describe, expect, it } from 'vitest';
import {
  exportSurveySkipMarks,
  FUNNEL_LABEL,
  FUNNEL_OFFSET_PX,
  leagueSittingEv,
  milestoneFill,
  plotSittings,
} from './sessionMilestones';

describe('skip milestones', () => {
  it('paints skip marks red and export marks green', () => {
    expect(milestoneFill('skip')).toBe('var(--color-primary)');
    expect(milestoneFill('export')).toBe('var(--color-success)');
  });

  it('labels reason only on the dex page; tooltip keeps tool', () => {
    const [mark] = exportSurveySkipMarks(
      [{ t: 50, tool: 'pokedex', reason: 'not_now' }],
      (t) => t,
      'dex',
    );
    expect(mark.label).toBe('not now');
    expect(mark.title).toBe('export_survey_skipped · pokedex · not_now');
    expect(mark.tone).toBe('skip');
  });

  it('names league vs card on the league page', () => {
    const [league] = exportSurveySkipMarks(
      [{ t: 50, tool: 'league', reason: 'close' }],
      (t) => t,
      'league',
    );
    expect(league.label).toBe('league · close');
    expect(league.title).toBe('export_survey_skipped · league · close');
    const [card] = exportSurveySkipMarks(
      [{ t: 50, tool: 'card', reason: 'abandon' }],
      (t) => t,
      'league',
    );
    expect(card.label).toBe('card · abandon');
    expect(card.title).toBe('export_survey_skipped · card · abandon');
  });
});

describe('plotSittings', () => {
  it('paints one red diamond when a sitting exported and skipped', () => {
    const plots = plotSittings(
      [{ t: 10, ev: ['intro-shown'] }],
      [
        { t: 10, label: 'export', tone: 'export' },
        { t: 10, label: 'not now', tone: 'skip', title: 'export_survey_skipped · pokedex · not_now' },
      ],
    );
    expect(plots).toHaveLength(1);
    expect(plots[0].diamond).toEqual({
      tone: 'skip',
      title: 'export_survey_skipped · pokedex · not_now',
    });
    expect(plots[0].funnel).toBe(true);
    expect(plots[0].label).toBe('export · not now · intro');
    expect(plots[0].label).not.toMatch(/pokedex/);
  });

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

  it('keeps skip text on a skip-only sitting with no diamond', () => {
    const plots = plotSittings(
      [{ t: 10 }, { t: 80 }],
      [{ t: 10, label: 'card · abandon', tone: 'skip', title: 'export_survey_skipped · card · abandon' }],
    );
    expect(plots[0].diamond).toBeUndefined();
    expect(plots[0].label).toBe('card · abandon');
    expect(plots[1].label).toBe('');
  });

  it('concatenates league vs card export and skip on one sitting', () => {
    const plots = plotSittings(
      [{ t: 10 }, { t: 80 }],
      [
        { t: 70, label: 'card', tone: 'export' },
        { t: 80, label: 'league', tone: 'export' },
        { t: 80, label: 'league · close', tone: 'skip', title: 'export_survey_skipped · league · close' },
      ],
    );
    expect(plots[1].diamond?.tone).toBe('skip');
    expect(plots[1].label).toBe('card · league · league · close');
    expect(FUNNEL_OFFSET_PX).toBe(8);
  });

  it('does not prefix pokedex in the concatenated dex label', () => {
    const skips = exportSurveySkipMarks(
      [{ t: 10, tool: 'pokedex', reason: 'not_now' }],
      (t) => t,
      'dex',
    );
    const plots = plotSittings([{ t: 10, ev: ['view-visit'] }], [
      { t: 10, label: 'export', tone: 'export' },
      ...skips,
    ]);
    expect(plots[0].label).toBe('export · not now · view');
  });

  it('ignores muted no-export marks', () => {
    const plots = plotSittings(
      [{ t: 10, ev: ['intro-shown'] }],
      [{ t: 10, label: 'no exports', tone: 'muted' }],
    );
    expect(plots[0].diamond).toBeUndefined();
    expect(plots[0].label).toBe('intro');
  });

  it('assigns a mark to the nearest sitting', () => {
    const plots = plotSittings(
      [{ t: 0 }, { t: 100 }],
      [{ t: 60, label: 'export', tone: 'export' }],
    );
    expect(plots[0].diamond).toBeUndefined();
    expect(plots[1].diamond?.tone).toBe('export');
  });

  it('overlays league nudge shown/cta/dismiss on the sitting that carried them', () => {
    const plots = plotSittings(
      [
        { t: 10, ev: ['league-nudge-card-shown', 'league-nudge-card-cta'] },
        { t: 80, ev: ['league-nudge-league-shown', 'league-nudge-league-dismiss'] },
      ],
      [],
    );
    expect(plots[0].funnel).toBe(true);
    expect(plots[0].label).toBe('card nudge · card go');
    expect(plots[1].funnel).toBe(true);
    expect(plots[1].label).toBe('8 gyms · 8 gyms skip');
  });

  it('allowlists all six league-nudge events so the timeline paints each', () => {
    const events = [
      'league-nudge-card-shown',
      'league-nudge-card-cta',
      'league-nudge-card-dismiss',
      'league-nudge-league-shown',
      'league-nudge-league-cta',
      'league-nudge-league-dismiss',
    ] as const;
    for (const ev of events) expect(FUNNEL_LABEL[ev], ev).toMatch(/\S/);
    const plots = plotSittings([{ t: 1, ev: [...events] }], []);
    expect(plots[0].funnel).toBe(true);
    expect(plots[0].label).toBe('card nudge · card go · card skip · 8 gyms · 8 gyms go · 8 gyms skip');
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

  it('keeps a successful export green when that sitting did not skip', () => {
    const ev = leagueSittingEv(['league-export-league', 'league-nudge-league-shown']);
    const plots = plotSittings([{ t: 10, ev }], [{ t: 10, label: 'league', tone: 'export' }]);
    expect(plots[0].diamond).toEqual({ tone: 'export' });
    expect(plots[0].funnel).toBe(true);
    expect(plots[0].label).toBe('league · 8 gyms');
  });

  it('leaves a skip-only sitting without a red diamond', () => {
    const ev = leagueSittingEv(['export_survey_skipped']);
    const plots = plotSittings([{ t: 10, ev }], [
      { t: 10, label: 'not now', tone: 'skip', title: 'export_survey_skipped · pokedex · not_now' },
    ]);
    expect(plots[0].diamond).toBeUndefined();
    expect(plots[0].funnel).toBe(false);
    expect(plots[0].label).toBe('not now');
  });
});
