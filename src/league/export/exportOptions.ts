/**
 * League summary export layout permutations.
 *
 * The export-settings pane will surface these later; until then, URL query
 * flags turn each permutation on for preview and QA.
 */

export interface LeagueHomeExportLayout {
  /** Theme, TM, and badge beside each trainer row. */
  gymDetails: boolean;
  /** Story and rematch teams side by side on gym-leader rows. */
  sideBySide: boolean;
}

export const DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT: LeagueHomeExportLayout = {
  gymDetails: false,
  sideBySide: false,
};

/** Reads `exportGymDetails` and `exportSideBySide` from the page URL. */
export function parseLeagueHomeExportLayout(search: string): LeagueHomeExportLayout {
  const params = new URLSearchParams(search);
  const on = (key: string) => {
    const v = params.get(key);
    return v === '1' || v === 'true' || (v === '' && params.has(key));
  };
  return {
    gymDetails: on('exportGymDetails'),
    sideBySide: on('exportSideBySide'),
  };
}
