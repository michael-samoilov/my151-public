import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EARLY_EXPORT_BUCKETS } from '@/league/export/exportPersonalization';
import {
  EXPORT_SURVEY_SKIP_EVENT,
  isFunnelEvent,
  leagueExportEventBody,
  parseExportSurveySkipReason,
  parseExportSurveyToolField,
  parseFunnelEventList,
  parseJournalEntry,
} from '../../api/_events';
import {
  EXPORT_SURVEY_SEEN_KEY,
  createExportSurveySkipReporter,
  exportSurveySkipReason,
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

  it('shows the survey at the last early bucket and skips after it', () => {
    expect(EARLY_EXPORT_BUCKETS.at(-1)).toBe(1000);
    expect(shouldOfferExportSurvey(1000)).toBe(true);
    expect(shouldOfferExportSurvey(1001)).toBe(false);
    expect(shouldOfferExportSurvey(151)).toBe(true);
  });

  it('always shows the overlay under notme, even after seen or ordinal 1000', () => {
    expect(
      shouldShowExportSurvey({ optedOut: true, preview: false, seen: true, ordinal: 1001 }),
    ).toBe(true);
    expect(
      shouldShowExportSurvey({ optedOut: true, preview: false, seen: false, ordinal: 5000 }),
    ).toBe(true);
  });

  it('on production without notme, respects the seen key and the 1000 cutoff', () => {
    expect(
      shouldShowExportSurvey({ optedOut: false, preview: false, seen: true, ordinal: 151 }),
    ).toBe(false);
    expect(
      shouldShowExportSurvey({ optedOut: false, preview: false, seen: false, ordinal: 1001 }),
    ).toBe(false);
    expect(
      shouldShowExportSurvey({ optedOut: false, preview: false, seen: false, ordinal: 151 }),
    ).toBe(true);
    expect(
      shouldShowExportSurvey({ optedOut: false, preview: false, seen: false, ordinal: 1000 }),
    ).toBe(true);
  });
});

describe('export survey skip reason', () => {
  it('maps intro dismiss to close and form dismiss to abandon', () => {
    expect(exportSurveySkipReason({ phase: 'intro', action: 'dismiss' })).toBe('close');
    expect(exportSurveySkipReason({ phase: 'form', action: 'dismiss' })).toBe('abandon');
  });
});

describe('export survey skip reporter', () => {
  it('does not send after a successful Send', () => {
    const sent: unknown[] = [];
    const reporter = createExportSurveySkipReporter({
      exportTool: 'league',
      send: (event, payload) => sent.push({ event, ...payload }),
    });
    reporter.markSent();
    reporter.skip('abandon');
    reporter.onPageHide('form');
    expect(sent).toEqual([]);
  });

  it('treats leaving the intro as close and leaving the form as abandon', () => {
    const intro: unknown[] = [];
    createExportSurveySkipReporter({
      exportTool: 'card',
      send: (event, payload) => intro.push({ event, ...payload }),
    }).onPageHide('intro');
    const form: unknown[] = [];
    createExportSurveySkipReporter({
      exportTool: 'card',
      send: (event, payload) => form.push({ event, ...payload }),
    }).onPageHide('form');
    expect(intro).toEqual([
      { event: EXPORT_SURVEY_SKIP_EVENT, exportTool: 'card', reason: 'close' },
    ]);
    expect(form).toEqual([
      { event: EXPORT_SURVEY_SKIP_EVENT, exportTool: 'card', reason: 'abandon' },
    ]);
  });
});

describe('export survey skip journal fields', () => {
  it('parses exportTool and reason, and drops unknown values', () => {
    expect(parseExportSurveyToolField('pokedex')).toBe('pokedex');
    expect(parseExportSurveyToolField('dex')).toBeUndefined();
    expect(parseExportSurveySkipReason('not_now')).toBe('not_now');
    expect(parseExportSurveySkipReason('skip')).toBeUndefined();
  });

  it('keeps exportTool and reason on a skip journal entry', () => {
    expect(
      parseJournalEntry({
        t: 1,
        cid: 'cid-skip-01',
        tool: 'league',
        ev: 'export_survey_skipped',
        page: '/custom-gym-leader',
        exportTool: 'card',
        reason: 'abandon',
      }),
    ).toEqual({
      t: 1,
      cid: 'cid-skip-01',
      tool: 'league',
      ev: 'export_survey_skipped',
      page: '/custom-gym-leader',
      exportTool: 'card',
      reason: 'abandon',
    });
  });
});

describe('league export success journal fields', () => {
  it('keeps the existing event names and adds exportTool', () => {
    expect(leagueExportEventBody('league')).toEqual({
      event: 'league-export-league',
      exportTool: 'league',
    });
    expect(leagueExportEventBody('card')).toEqual({
      event: 'league-export-card',
      exportTool: 'card',
    });
    expect(isFunnelEvent('league-export-league')).toBe(true);
    expect(isFunnelEvent('league-export-card')).toBe(true);
  });

  it('parses a mixed session event list and drops unknown names', () => {
    expect(
      parseFunnelEventList([
        'league-export-league',
        'export_survey_skipped',
        'league-export-league',
        'not-an-event',
      ]),
    ).toEqual(['league-export-league', 'export_survey_skipped']);
  });
});
