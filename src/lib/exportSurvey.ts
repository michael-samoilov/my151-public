/** One-shot export follow-up, shared by every export tool. */

import { PRODUCTION_DEPLOY } from './demoMode';

export type ExportSurveyTool = 'pokedex' | 'league' | 'card';

export const EXPORT_SURVEY_TOOL_LABEL: Record<ExportSurveyTool, string> = {
  pokedex: 'Pokedex',
  league: 'Pokemon League',
  card: 'Gym Leader Card',
};

export const EXPORT_SURVEY_SEEN_KEY = 'my151-export-survey-seen';

/**
 * Whether the export survey should stay hidden in this deploy.
 *
 * Production is once-only. Preview and local builds always show it, and they
 * do not write the seen key, so a preview test cannot skip the live survey
 * later in the same browser.
 */
export function surveySeenInThisEnvironment(production: boolean): boolean {
  if (!production) return false;
  try {
    return localStorage.getItem(EXPORT_SURVEY_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistExportSurveySeen(production: boolean): void {
  if (!production) return;
  try {
    localStorage.setItem(EXPORT_SURVEY_SEEN_KEY, '1');
  } catch {
    /* quota or private mode */
  }
}

export function hasSeenExportSurvey(): boolean {
  return surveySeenInThisEnvironment(PRODUCTION_DEPLOY);
}

export function markExportSurveySeen(): void {
  persistExportSurveySeen(PRODUCTION_DEPLOY);
}

export function exportSurveyFeedbackRoute(tool: ExportSurveyTool): string {
  if (tool === 'pokedex') return 'view';
  if (tool === 'card') return 'league-card';
  return 'league';
}

export function isExportSurveyTool(value: unknown): value is ExportSurveyTool {
  return value === 'pokedex' || value === 'league' || value === 'card';
}
