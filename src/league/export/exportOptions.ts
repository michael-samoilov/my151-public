export const CARD_FILENAME = 'my151-trainer-card.png';
export const HOME_FILENAME = 'my151-league.png';

export type LeagueHomeTeamMode = 'story' | 'rematch' | 'both';

export interface LeagueHomeExportLayout {
  showLeagueName: boolean;
  showTheme: boolean;
  showTmReward: boolean;
  showBadgeName: boolean;
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

export function leagueLayoutFrameKey(layout: LeagueHomeExportLayout): string {
  return [
    layout.teamMode,
    layout.showLeagueName ? '1' : '0',
    layout.showTheme ? '1' : '0',
    layout.showTmReward ? '1' : '0',
    layout.showBadgeName ? '1' : '0',
  ].join('|');
}

const TEAM_MODES: readonly LeagueHomeTeamMode[] = ['story', 'rematch', 'both'];
const DETAIL_KEYS = ['showLeagueName', 'showTheme', 'showTmReward', 'showBadgeName'] as const;

export function leagueLayoutPermutations(base: LeagueHomeExportLayout): LeagueHomeExportLayout[] {
  const neighbors: LeagueHomeExportLayout[] = [];
  for (const teamMode of TEAM_MODES) {
    if (teamMode !== base.teamMode) neighbors.push({ ...base, teamMode });
  }
  for (const key of DETAIL_KEYS) {
    neighbors.push({ ...base, [key]: !base[key] });
  }
  const rest: LeagueHomeExportLayout[] = [];
  for (const teamMode of TEAM_MODES) {
    for (let bits = 0; bits < 16; bits++) {
      const next: LeagueHomeExportLayout = {
        teamMode,
        showLeagueName: (bits & 1) !== 0,
        showTheme: (bits & 2) !== 0,
        showTmReward: (bits & 4) !== 0,
        showBadgeName: (bits & 8) !== 0,
      };
      rest.push(next);
    }
  }
  const seen = new Set<string>();
  const ordered = [base, ...neighbors, ...rest];
  return ordered.filter((layout) => {
    const key = leagueLayoutFrameKey(layout);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseLeagueHomeExportLayout(
  search: string,
  onScreen: LeagueHomeTeamMode,
): LeagueHomeExportLayout {
  const params = new URLSearchParams(search);
  const teamParam = params.get('exportTeamMode');
  let teamMode: LeagueHomeTeamMode = onScreen;
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

export type CardTeamOrder = 'fixed' | 'first-last';
