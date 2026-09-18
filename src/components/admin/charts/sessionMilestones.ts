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

export function placeMilestones(
  items: ChartMilestone[],
  xOf: (t: number) => number,
  mergePx = 36,
): (ChartMilestone & { bx: number })[] {
  const marks: (ChartMilestone & { bx: number })[] = [];
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
      marks.push({ ...m, bx });
    }
  }
  return marks;
}
