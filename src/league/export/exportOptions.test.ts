import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT,
  layoutShowsGymDetails,
  parseLeagueHomeExportLayout,
} from './exportOptions';

describe('league home export options', () => {
  it('defaults every details box on', () => {
    expect(DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT).toEqual({
      showLeagueName: true,
      showTheme: true,
      showTmReward: true,
      showBadgeName: true,
      teamMode: 'story',
    });
    expect(parseLeagueHomeExportLayout('')).toEqual(DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT);
    expect(layoutShowsGymDetails(DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT)).toBe(true);
  });

  it('turns the gym-detail bundle off from the legacy query flag', () => {
    const layout = parseLeagueHomeExportLayout('?exportGymDetails=0&exportTeamMode=both');
    expect(layout.showTheme).toBe(false);
    expect(layout.showTmReward).toBe(false);
    expect(layout.showBadgeName).toBe(false);
    expect(layout.showLeagueName).toBe(true);
    expect(layout.teamMode).toBe('both');
    expect(layoutShowsGymDetails(layout)).toBe(false);
  });

  it('lets a single details box override the bundle', () => {
    const layout = parseLeagueHomeExportLayout('?exportGymDetails=0&exportTheme=1&exportLeagueName=0');
    expect(layout.showTheme).toBe(true);
    expect(layout.showTmReward).toBe(false);
    expect(layout.showBadgeName).toBe(false);
    expect(layout.showLeagueName).toBe(false);
  });
});
