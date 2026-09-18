import { describe, expect, it } from 'vitest';
import { exportSurveySkipMarks, milestoneFill, placeMilestones } from './sessionMilestones';

describe('skip milestones', () => {
  it('paints skip marks red and export marks green', () => {
    expect(milestoneFill('skip')).toBe('var(--color-primary)');
    expect(milestoneFill('export')).toBe('var(--color-success)');
  });

  it('labels tool and reason for the mark and tooltip', () => {
    const [mark] = exportSurveySkipMarks(
      [{ t: 50, tool: 'pokedex', reason: 'not_now' }],
      (t) => t,
    );
    expect(mark.label).toBe('pokedex · not now');
    expect(mark.title).toBe('export_survey_skipped · pokedex · not_now');
    expect(mark.tone).toBe('skip');
  });

  it('does not merge a skip onto a green export', () => {
    const marks = placeMilestones(
      [
        { t: 10, label: 'league', tone: 'export' },
        { t: 10, label: 'league · close', tone: 'skip', title: 'export_survey_skipped · league · close' },
      ],
      (t) => t,
    );
    expect(marks).toHaveLength(2);
    expect(marks[0].tone).toBe('export');
    expect(marks[1].tone).toBe('skip');
    expect(marks[1].bx).toBeGreaterThan(marks[0].bx);
  });
});
