import type { ExportSurveySkip } from '../../../../api/_events';

export type MilestoneTone = 'export' | 'muted' | 'skip';

export interface ChartMilestone {
  t: number;
  label: string;
  tone?: MilestoneTone;
  title?: string;
}

export function milestoneFill(tone?: MilestoneTone): string {
  if (tone === 'muted') return 'var(--color-muted-foreground)';
  if (tone === 'skip') return 'var(--color-primary)';
  return 'var(--color-success)';
}

export function exportSurveySkipMarks(
  skips: ExportSurveySkip[] | undefined,
  clampT: (t: number) => number,
): ChartMilestone[] {
  return (skips ?? []).map((s) => ({
    t: clampT(s.t),
    label: `${s.tool} · ${s.reason.replaceAll('_', ' ')}`,
    tone: 'skip',
    title: `export_survey_skipped · ${s.tool} · ${s.reason}`,
  }));
}

export type PlacedMilestone = ChartMilestone & { bx: number; labelDy: number };

/** Label above the rail, same as export/event text. */
export const MILESTONE_LABEL_ABOVE = -4;
/** Skip label under the diamond when a green mark already owns the rail. */
export const MILESTONE_LABEL_BELOW = 12;
const LABEL_COLLIDE_PX = 36;

export function placeMilestones(
  items: ChartMilestone[],
  xOf: (t: number) => number,
  mergePx = 36,
): PlacedMilestone[] {
  const marks: PlacedMilestone[] = [];
  for (const m of items) {
    let bx = xOf(m.t);
    const hit = marks.find((p) => Math.abs(bx - p.bx) < 10 && p.tone !== m.tone);
    if (hit) bx = hit.bx + 10;
    const prev = marks[marks.length - 1];
    if (prev && Math.abs(bx - prev.bx) < mergePx && prev.tone === m.tone) {
      prev.label = `${prev.label} · ${m.label}`;
      if (m.title) prev.title = prev.title ? `${prev.title} · ${m.title}` : m.title;
      prev.bx = (prev.bx + bx) / 2;
    } else {
      marks.push({ ...m, bx, labelDy: MILESTONE_LABEL_ABOVE });
    }
  }
  for (const m of marks) {
    if (m.tone !== 'skip') continue;
    const hit = marks.some((p) => p !== m && p.tone !== 'skip' && Math.abs(p.bx - m.bx) < LABEL_COLLIDE_PX);
    if (hit) m.labelDy = MILESTONE_LABEL_BELOW;
  }
  return marks;
}
