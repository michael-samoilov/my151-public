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

export type SkipLabelPage = 'dex' | 'league';

export function skipReasonLabel(
  tool: ExportSurveySkip['tool'],
  reason: ExportSurveySkip['reason'],
  page: SkipLabelPage,
): string {
  const reasonLabel = reason.replaceAll('_', ' ');
  if (page === 'dex') return reasonLabel;
  return `${tool} · ${reasonLabel}`;
}

export function exportSurveySkipMarks(
  skips: ExportSurveySkip[] | undefined,
  clampT: (t: number) => number,
  page: SkipLabelPage,
): ChartMilestone[] {
  return (skips ?? []).map((s) => ({
    t: clampT(s.t),
    label: skipReasonLabel(s.tool, s.reason, page),
    tone: 'skip',
    title: `export_survey_skipped · ${s.tool} · ${s.reason}`,
  }));
}

export type PlacedMilestone = ChartMilestone & { bx: number; labelDy: number };

/** Label above the rail, same as export/event text. */
export const MILESTONE_LABEL_ABOVE = -4;
/** Skip label under the diamond when a green mark already owns the rail. */
export const MILESTONE_LABEL_BELOW = 12;
/** SVG milestone labels are 6.5px. ~0.55em per character covers Latin labels. */
const LABEL_CHAR_PX = 3.6;

function labelWidth(label: string): number {
  return label.length * LABEL_CHAR_PX;
}

/** Keep a skip under a nearby green mark even when the reason text is short. */
const SKIP_LABEL_NEAR_PX = 72;

function labelsWouldOverlap(a: PlacedMilestone, b: PlacedMilestone): boolean {
  const widthGap = labelWidth(a.label) + labelWidth(b.label);
  return Math.abs(a.bx - b.bx) < Math.max(SKIP_LABEL_NEAR_PX, widthGap);
}

function sameMilestone(a: ChartMilestone, b: ChartMilestone): boolean {
  return a.tone === b.tone && a.label === b.label;
}

export function placeMilestones(
  items: ChartMilestone[],
  xOf: (t: number) => number,
  mergePx = 36,
): PlacedMilestone[] {
  const marks: PlacedMilestone[] = [];
  for (const m of items) {
    let bx = xOf(m.t);
    const hit = marks.find((p) => Math.abs(bx - p.bx) < 10 && !sameMilestone(p, m));
    if (hit) bx = hit.bx + 10;
    const prev = marks[marks.length - 1];
    if (prev && Math.abs(bx - prev.bx) < mergePx && sameMilestone(prev, m)) {
      prev.label = `${prev.label} · ${m.label}`;
      if (m.title) prev.title = prev.title ? `${prev.title} · ${m.title}` : m.title;
      prev.bx = (prev.bx + bx) / 2;
    } else {
      marks.push({ ...m, bx, labelDy: MILESTONE_LABEL_ABOVE });
    }
  }
  for (const m of marks) {
    if (m.tone !== 'skip') continue;
    const hit = marks.some((p) => p !== m && p.tone !== 'skip' && labelsWouldOverlap(p, m));
    if (hit) m.labelDy = MILESTONE_LABEL_BELOW;
  }
  return marks;
}
