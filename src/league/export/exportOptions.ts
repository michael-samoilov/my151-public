/**
 * League summary export layout permutations.
 *
 * The export-settings pane surfaces these; URL query flags seed the overlay for QA.
 */

export type LeagueHomeTeamMode = 'story' | 'rematch' | 'both';

export interface LeagueHomeExportLayout {
  /** League name line at the top of the picture. */
  showLeagueName: boolean;
  /** Theme row in the gym-details column. */
  showTheme: boolean;
  /** TM disc, move name, type, and category in the gym-details column. */
  showTmReward: boolean;
  /** Badge hex and name in the gym-details column. */
  showBadgeName: boolean;
  /** Which team rows appear on the export. */
  teamMode: LeagueHomeTeamMode;
}

export const DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT: LeagueHomeExportLayout = {
  showLeagueName: true,
  showTheme: true,
  showTmReward: true,
  showBadgeName: true,
  teamMode: 'story',
};

export function layoutShowsBothTeams(layout: LeagueHomeExportLayout): boolean {
  return layout.teamMode === 'both';
}

/** Theme, TM, or badge — any one of these opens the details column. */
export function layoutShowsGymDetails(layout: LeagueHomeExportLayout): boolean {
  return layout.showTheme || layout.showTmReward || layout.showBadgeName;
}

function flag(params: URLSearchParams, key: string, fallback: boolean): boolean {
  if (!params.has(key)) return fallback;
  const v = params.get(key);
  if (v === '0' || v === 'false') return false;
  if (v === '1' || v === 'true' || v === '') return true;
  return fallback;
}

/**
 * Reads `exportTeamMode`, `exportLeagueName`, per-detail flags, and legacy
 * `exportGymDetails` / `exportSideBySide`. Missing flags keep the defaults
 * (every details box on, story teams).
 */
export function parseLeagueHomeExportLayout(search: string): LeagueHomeExportLayout {
  const params = new URLSearchParams(search);
  const teamParam = params.get('exportTeamMode');
  let teamMode: LeagueHomeTeamMode = 'story';
  if (teamParam === 'rematch' || teamParam === 'both' || teamParam === 'story') {
    teamMode = teamParam;
  } else if (flag(params, 'exportSideBySide', false)) {
    teamMode = 'both';
  }

  const gymBundle = params.has('exportGymDetails')
    ? flag(params, 'exportGymDetails', true)
    : true;

  return {
    showLeagueName: flag(params, 'exportLeagueName', true),
    showTheme: flag(params, 'exportTheme', gymBundle),
    showTmReward: flag(params, 'exportTmReward', gymBundle),
    showBadgeName: flag(params, 'exportBadgeName', gymBundle),
    teamMode,
  };
}
