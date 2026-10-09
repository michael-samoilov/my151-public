import type { ExportSurveySkip } from '../../../../api/_events';

export type MilestoneTone = 'export' | 'muted' | 'skip' | 'feedback';

export interface ChartMilestone {
  t: number;
  label: string;
  tone?: MilestoneTone;
  title?: string;
}

export function milestoneFill(tone?: MilestoneTone): string {
  if (tone === 'muted') return 'var(--color-muted-foreground)';
  if (tone === 'skip') return 'var(--color-primary)';
  if (tone === 'feedback') return 'var(--color-off)';
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

/** api/_shared.ts SESSION_GAP_MS: activity this close to a session belongs to it. */
const SESSION_SLACK_MS = 30 * 60_000;

export interface SessionSpan {
  start: number;
  end: number;
}

/**
 * One mark per feedback report this browser sent during one of this tool's
 * sessions, at the time it was sent. A report sent while the browser was in
 * another tool, or in none, gets no mark on this chart; the nearest session
 * of this tool can be days away.
 */
export function feedbackMarks(
  reports: readonly { ts: number; category: string }[],
  sessions: readonly SessionSpan[],
  clampT: (t: number) => number,
): ChartMilestone[] {
  const during = (t: number) => sessions.some((s) => t >= s.start - SESSION_SLACK_MS && t <= s.end + SESSION_SLACK_MS);
  return reports.filter((r) => during(r.ts)).map((r) => ({
    t: clampT(r.ts),
    label: 'feedback',
    tone: 'feedback',
    title: `feedback · ${r.category}`,
  }));
}

export const FUNNEL_LABEL: Record<string, string> = {
  'intro-shown': 'intro',
  'intro-cta': 'start',
  'milestone-25': '25',
  'milestone-100': '100',
  'milestone-151': '151',
  'view-visit': 'view',
  'league-nudge-card-shown': 'card nudge',
  'league-nudge-card-cta': 'card go',
  'league-nudge-card-dismiss': 'card skip',
  'league-nudge-league-shown': '8 gyms',
  'league-nudge-league-cta': '8 gyms go',
  'league-nudge-league-dismiss': '8 gyms skip',
  'favorites-first-pick': 'first pick',
  'favorites-quarter': '65',
  'favorites-half': '129',
  'favorites-complete': '257',
  'favorites-nudge-complete-shown': 'export nudge',
  'favorites-export-shown': 'export opened',
};

/** Picker export events. A visit lists each export kind once, so its diamond
 *  carries one label per kind. */
const FAVORITE_EXPORT_LABEL: Record<string, string> = {
  'favorites-export-full': 'full grid',
  'favorites-export-stats': 'detailed stats',
  'favorites-export-simplified': 'simplified',
};

export function favoriteExportMarks(sittings: readonly { t: number; ev?: readonly string[] }[]): ChartMilestone[] {
  return sittings.flatMap((s) =>
    (s.ev ?? []).flatMap((ev) =>
      FAVORITE_EXPORT_LABEL[ev] ? [{ t: s.t, label: FAVORITE_EXPORT_LABEL[ev], tone: 'export' as const }] : [],
    ),
  );
}

/** Event names stored on one league sitting, for the timeline funnel marks. */
export function leagueSittingEv(events: readonly string[] | undefined): string[] | undefined {
  return events?.length ? [...events] : undefined;
}

/** Horizontal gap when a sitting has both a diamond and a funnel circle. */
export const FUNNEL_OFFSET_PX = 8;

export interface SittingPlot {
  diamond?: { tone: 'export' | 'skip'; title?: string };
  /** Feedback reports sent nearest this sitting, as one mark. */
  feedback?: { title: string };
  funnel: boolean;
  label: string;
}

function nearestSitting(t: number, sittings: readonly { t: number }[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sittings.length; i++) {
    const d = Math.abs(sittings[i].t - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function pushUnique(list: string[], value: string): void {
  if (value && !list.includes(value)) list.push(value);
}

export function plotSittings(
  sittings: readonly { t: number; ev?: readonly string[] }[],
  milestones: readonly ChartMilestone[],
): SittingPlot[] {
  const n = sittings.length;
  const exportLabels: string[][] = Array.from({ length: n }, () => []);
  const skipLabels: string[][] = Array.from({ length: n }, () => []);
  const skipTitles: string[][] = Array.from({ length: n }, () => []);
  const hasExport = Array<boolean>(n).fill(false);
  const hasSkip = Array<boolean>(n).fill(false);
  const feedbackTitles: string[][] = Array.from({ length: n }, () => []);

  for (const m of milestones) {
    if (n === 0 || m.tone === 'muted') continue;
    const i = nearestSitting(m.t, sittings);
    if (m.tone === 'feedback') {
      feedbackTitles[i].push(m.title ?? m.label);
    } else if (m.tone === 'skip') {
      hasSkip[i] = true;
      pushUnique(skipLabels[i], m.label);
      if (m.title) pushUnique(skipTitles[i], m.title);
    } else {
      hasExport[i] = true;
      pushUnique(exportLabels[i], m.label);
    }
  }

  return sittings.map((s, i) => {
    const funnelLabels: string[] = [];
    for (const ev of s.ev ?? []) pushUnique(funnelLabels, FUNNEL_LABEL[ev] ?? '');
    const sent = feedbackTitles[i];
    const fbLabel = sent.length > 1 ? `${sent.length} feedback` : sent.length ? 'feedback' : '';
    const label = [...exportLabels[i], ...skipLabels[i], fbLabel, ...funnelLabels].filter(Boolean).join(' · ');
    const funnel = (s.ev ?? []).some((ev) => FUNNEL_LABEL[ev]);
    const feedback = sent.length ? { feedback: { title: sent.join('\n') } } : {};
    if (hasExport[i] && hasSkip[i]) {
      return {
        funnel,
        label,
        diamond: { tone: 'skip', title: skipTitles[i].join(' · ') || undefined },
        ...feedback,
      };
    }
    if (hasExport[i]) return { funnel, label, diamond: { tone: 'export' }, ...feedback };
    return { funnel, label, ...feedback };
  });
}
