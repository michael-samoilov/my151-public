/** One-shot export follow-up, shared by every export tool. */

import {
  EXPORT_SURVEY_SKIP_EVENT,
  type ExportSurveySkipReason,
  type ExportSurveyToolField,
} from '../../api/_events';
import { EARLY_EXPORT_BUCKETS } from '@/league/export/exportPersonalization';
import { PRODUCTION_DEPLOY } from './demoMode';

export type ExportSurveyTool = ExportSurveyToolField;
export type { ExportSurveySkipReason };

export const EXPORT_SURVEY_TOOL_LABEL: Record<ExportSurveyTool, string> = {
  pokedex: 'Pokedex',
  league: 'Pokemon League',
  card: 'Gym Leader Card',
};

export const EXPORT_SURVEY_SEEN_KEY = 'my151-export-survey-seen';

const LAST_EARLY_EXPORT_BUCKET = EARLY_EXPORT_BUCKETS[EARLY_EXPORT_BUCKETS.length - 1];

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

/**
 * Whether this export's global ordinal is still in the early-user window.
 *
 * The window is `EARLY_EXPORT_BUCKETS`, the same cut as "among the first N
 * users". The last bucket still gets the survey. A later ordinal does not,
 * even when a first-Pokémon uniqueness line would have existed. Preview uses
 * ordinal 151, so it stays inside the window.
 */
export function shouldOfferExportSurvey(ordinal: number | null | undefined): boolean {
  if (typeof ordinal !== 'number' || !Number.isFinite(ordinal)) return true;
  return ordinal <= LAST_EARLY_EXPORT_BUCKET;
}

export function shouldShowExportSurvey(opts: {
  optedOut: boolean;
  preview: boolean;
  seen: boolean;
  ordinal: number | null | undefined;
}): boolean {
  if (opts.optedOut || opts.preview) return true;
  if (opts.seen) return false;
  return shouldOfferExportSurvey(opts.ordinal);
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

export type ExportSurveySkipAction = 'not_now' | 'dismiss';

export function exportSurveySkipReason(opts: {
  phase: 'intro' | 'form';
  action: ExportSurveySkipAction;
}): ExportSurveySkipReason {
  if (opts.action === 'not_now') return 'not_now';
  return opts.phase === 'form' ? 'abandon' : 'close';
}

export function createExportSurveySkipReporter(opts: {
  exportTool: ExportSurveyTool;
  send: (
    event: typeof EXPORT_SURVEY_SKIP_EVENT,
    payload: { exportTool: ExportSurveyTool; reason: ExportSurveySkipReason },
  ) => void;
}) {
  let closed = false;
  const fire = (reason: ExportSurveySkipReason) => {
    if (closed) return;
    closed = true;
    opts.send(EXPORT_SURVEY_SKIP_EVENT, {
      exportTool: opts.exportTool,
      reason,
    });
  };
  return {
    skip: fire,
    markSent: () => {
      closed = true;
    },
    onPageHide: (phase: 'intro' | 'form') => {
      fire(phase === 'form' ? 'abandon' : 'close');
    },
  };
}
