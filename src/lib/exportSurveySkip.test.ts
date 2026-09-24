import { describe, expect, it } from 'vitest';
import {
  appendExportSurveySkip,
  exportSurveySkippedBody,
  isExportSurveySkipReason,
  isExportSurveyTool,
  parseExportSurveySkipFields,
  parseExportSurveySkipList,
  parseExportSurveySkipMap,
  stampExportSurveySkips,
} from '../../api/_events';

describe('export_survey_skipped payload', () => {
  it('accepts survey tool on exportTool or tool', () => {
    const body = exportSurveySkippedBody('cid-12345678', 'card', 'not_now', '/custom-gym-leader');
    expect(body).toEqual({
      cid: 'cid-12345678',
      event: 'export_survey_skipped',
      tool: 'card',
      exportTool: 'card',
      reason: 'not_now',
      page: '/custom-gym-leader',
    });
    expect(parseExportSurveySkipFields(body)).toEqual({
      tool: 'card',
      reason: 'not_now',
    });
    expect(parseExportSurveySkipFields({ exportTool: 'pokedex', reason: 'close' })).toEqual({
      tool: 'pokedex',
      reason: 'close',
    });
  });

  it('rejects a beacon tool or an unknown reason', () => {
    expect(parseExportSurveySkipFields({ tool: 'dex', reason: 'not_now' })).toBeNull();
    expect(parseExportSurveySkipFields({ exportTool: 'pokedex', reason: 'skip' })).toBeNull();
    expect(isExportSurveyTool('card')).toBe(true);
    expect(isExportSurveySkipReason('abandon')).toBe(true);
  });
});

describe('export survey skip store', () => {
  it('parses a hash and stamps the bare cid', () => {
    const skips = parseExportSurveySkipMap({
      'aaaa-0001': JSON.stringify([{ t: 10, tool: 'pokedex', reason: 'close' }]),
      junk: '{',
    });
    const row = stampExportSurveySkips({ cid: 'aaaa-0001::JP', name: 'x' }, skips);
    expect(row.exportSurveySkips).toEqual([{ t: 10, tool: 'pokedex', reason: 'close' }]);
  });

  it('caps the list and drops malformed rows', () => {
    const start = parseExportSurveySkipList([{ t: 1, tool: 'league' }, { t: 2, tool: 'league', reason: 'close' }]);
    expect(start).toHaveLength(1);
    const next = appendExportSurveySkip(start, { t: 3, tool: 'pokedex', reason: 'abandon' }, 1);
    expect(next).toEqual([{ t: 3, tool: 'pokedex', reason: 'abandon' }]);
  });
});
