import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXPORT_SURVEY_SEEN_KEY,
  exportSurveyFeedbackRoute,
  hasSeenExportSurvey,
  isExportSurveyTool,
  markExportSurveySeen,
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

  it('starts unseen and stays seen after the intro is shown', () => {
    expect(hasSeenExportSurvey()).toBe(false);
    markExportSurveySeen();
    expect(hasSeenExportSurvey()).toBe(true);
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
});
