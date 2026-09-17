import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EARLY_EXPORT_BUCKETS } from '@/league/export/exportPersonalization';
import {
  EXPORT_SURVEY_SEEN_KEY,
  exportSurveyFeedbackRoute,
  hasSeenExportSurvey,
  isExportSurveyTool,
  markExportSurveySeen,
  persistExportSurveySeen,
  shouldOfferExportSurvey,
  shouldShowExportSurvey,
  surveySeenInThisEnvironment,
} from './exportSurvey';

function installStorageStub(): void {
  const data = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
  vi.stubGlobal('localStorage', stub);
}

describe('export survey gate', () => {
  beforeEach(() => installStorageStub());
  afterEach(() => {
    localStorage.removeItem(EXPORT_SURVEY_SEEN_KEY);
  });

  it('on production, the seen key hides the survey', () => {
    expect(surveySeenInThisEnvironment(true)).toBe(false);
    persistExportSurveySeen(true);
    expect(surveySeenInThisEnvironment(true)).toBe(true);
    expect(localStorage.getItem(EXPORT_SURVEY_SEEN_KEY)).toBe('1');
  });

  it('off production, the seen key never hides the survey and is not written', () => {
    persistExportSurveySeen(false);
    expect(localStorage.getItem(EXPORT_SURVEY_SEEN_KEY)).toBeNull();
    localStorage.setItem(EXPORT_SURVEY_SEEN_KEY, '1');
    expect(surveySeenInThisEnvironment(false)).toBe(false);
  });

  it('public helpers follow PRODUCTION_DEPLOY, which is off in unit tests', () => {
    markExportSurveySeen();
    expect(hasSeenExportSurvey()).toBe(false);
    expect(localStorage.getItem(EXPORT_SURVEY_SEEN_KEY)).toBeNull();
  });

  it('maps each tool to the admin route it already uses', () => {
    expect(exportSurveyFeedbackRoute('pokedex')).toBe('view');
    expect(exportSurveyFeedbackRoute('league')).toBe('league');
    expect(exportSurveyFeedbackRoute('card')).toBe('league-card');
  });

  it('accepts only the three export tools', () => {
    expect(isExportSurveyTool('league')).toBe(true);
    expect(isExportSurveyTool('dex')).toBe(false);
  });

  it('shows the survey at the last early bucket and skips after it', () => {
    expect(EARLY_EXPORT_BUCKETS.at(-1)).toBe(1000);
    expect(shouldOfferExportSurvey(1000)).toBe(true);
    expect(shouldOfferExportSurvey(1001)).toBe(false);
    expect(shouldOfferExportSurvey(151)).toBe(true);
  });

  it('always shows the overlay under notme, even after seen or ordinal 1000', () => {
    expect(
      shouldShowExportSurvey({ optedOut: true, seen: true, ordinal: 1001 }),
    ).toBe(true);
    expect(
      shouldShowExportSurvey({ optedOut: true, seen: false, ordinal: 5000 }),
    ).toBe(true);
    expect(
      shouldShowExportSurvey({ optedOut: false, seen: true, ordinal: 151 }),
    ).toBe(false);
    expect(
      shouldShowExportSurvey({ optedOut: false, seen: false, ordinal: 1001 }),
    ).toBe(false);
    expect(
      shouldShowExportSurvey({ optedOut: false, seen: false, ordinal: 151 }),
    ).toBe(true);
  });
});
