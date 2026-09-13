/**
 * League summary export layout permutations.
 *
 * The export-settings pane surfaces these; URL query flags seed the overlay for QA.
 */

export type LeagueHomeTeamMode = 'story' | 'rematch' | 'both';

export interface LeagueHomeExportLayout {
  /** Theme, TM, and badge beside each trainer row. */
  gymDetails: boolean;
  /** Which team rows appear on the export. */
  teamMode: LeagueHomeTeamMode;
}

export const DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT: LeagueHomeExportLayout = {
  gymDetails: false,
  teamMode: 'story',
};

export function layoutShowsBothTeams(layout: LeagueHomeExportLayout): boolean {
  return layout.teamMode === 'both';
}

/** Reads `exportGymDetails`, `exportTeamMode`, and legacy `exportSideBySide`. */
export function parseLeagueHomeExportLayout(search: string): LeagueHomeExportLayout {
  const params = new URLSearchParams(search);
  const on = (key: string) => {
    const v = params.get(key);
    return v === '1' || v === 'true' || (v === '' && params.has(key));
  };
  const teamParam = params.get('exportTeamMode');
  let teamMode: LeagueHomeTeamMode = 'story';
  if (teamParam === 'rematch' || teamParam === 'both' || teamParam === 'story') {
    teamMode = teamParam;
  } else if (on('exportSideBySide')) {
    teamMode = 'both';
  }
  return {
    gymDetails: on('exportGymDetails'),
    teamMode,
  };
}
