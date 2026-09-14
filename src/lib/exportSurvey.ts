/** One-shot export follow-up, shared by every export tool. */

export type ExportSurveyTool = 'pokedex' | 'league' | 'card';

export const EXPORT_SURVEY_TOOL_LABEL: Record<ExportSurveyTool, string> = {
  pokedex: 'Pokedex',
  league: 'Pokemon League',
  card: 'Gym Leader Card',
};

export const EXPORT_SURVEY_SEEN_KEY = 'my151-export-survey-seen';

export function hasSeenExportSurvey(): boolean {
  try {
    return localStorage.getItem(EXPORT_SURVEY_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markExportSurveySeen(): void {
  try {
    localStorage.setItem(EXPORT_SURVEY_SEEN_KEY, '1');
  } catch {
    /* quota or private mode */
  }
}

export function exportSurveyFeedbackRoute(tool: ExportSurveyTool): string {
  if (tool === 'pokedex') return 'view';
  if (tool === 'card') return 'league-card';
  return 'league';
}

export function isExportSurveyTool(value: unknown): value is ExportSurveyTool {
  return value === 'pokedex' || value === 'league' || value === 'card';
}
