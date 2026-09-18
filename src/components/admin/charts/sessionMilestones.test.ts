import { describe, expect, it } from 'vitest';
import { exportSurveySkipMarks, milestoneFill, placeMilestones, MILESTONE_LABEL_ABOVE, MILESTONE_LABEL_BELOW } from './sessionMilestones';

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

  it('drops a colliding skip label under the diamond', () => {
    const marks = placeMilestones(
      [
        { t: 10, label: 'export', tone: 'export' },
        { t: 10, label: 'pokedex · not now', tone: 'skip', title: 'export_survey_skipped · pokedex · not_now' },
      ],
      (t) => t,
    );
    expect(marks[0].labelDy).toBe(MILESTONE_LABEL_ABOVE);
    expect(marks[1].labelDy).toBe(MILESTONE_LABEL_BELOW);
    expect(marks[1].label).toBe('pokedex · not now');
    expect(marks[1].title).toBe('export_survey_skipped · pokedex · not_now');
  });

  it('keeps a lone skip label on the rail', () => {
    const marks = placeMilestones([{ t: 40, label: 'pokedex · close', tone: 'skip' }], (t) => t);
    expect(marks[0].labelDy).toBe(MILESTONE_LABEL_ABOVE);
  });

  it('drops a skip label that would paint over a nearby green mark', () => {
    const marks = placeMilestones(
      [
        { t: 300, label: 'league', tone: 'export' },
        { t: 340, label: 'league · close', tone: 'skip', title: 'export_survey_skipped · league · close' },
      ],
      (t) => t,
    );
    expect(marks[1].labelDy).toBe(MILESTONE_LABEL_BELOW);
    expect(marks[1].label).toBe('league · close');
  });

  it('keeps a skip label on the rail when the green mark is far', () => {
    const marks = placeMilestones(
      [
        { t: 20, label: 'card', tone: 'export' },
        { t: 340, label: 'league · close', tone: 'skip' },
      ],
      (t) => t,
    );
    expect(marks[1].labelDy).toBe(MILESTONE_LABEL_ABOVE);
  });
});
