import {
  dayStart,
  lastPointLabelCounts,
  mergeByCid,
  type DailyActivityPoint,
  type SessionRecord,
} from '../api/_aggregate';

type DexRow = SessionRecord & { archived?: boolean };
type LeagueRow = {
  cid: string;
  firstTs: number;
  lastTs: number;
  sessions: number;
  sessionMs: number[];
  sessionLog?: { ts: number }[];
  archived?: boolean;
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
  device?: string;
  os?: string;
  browser?: string;
};

function leagueToSession(r: LeagueRow): SessionRecord {
  return {
    cid: r.cid,
    firstTs: r.firstTs,
    lastTs: r.lastTs,
    sessions: r.sessions,
    sessionMs: r.sessionMs,
    sessionLog: r.sessionLog?.map((s) => ({ ts: s.ts })),
    country: r.country,
    region: r.region,
    tz: r.tz,
    lang: r.lang,
    locale: r.locale,
    device: r.device,
    os: r.os,
    browser: r.browser,
  };
}

function patchActivitySeries(series: DailyActivityPoint[], now: number, labels: { label24h: number | null; label168h: number | null }) {
  const today = dayStart(now);
  const out = series.map((row) =>
    row.day === today
      ? { ...row, label24h: labels.label24h, label168h: labels.label168h }
      : row,
  );
  return out;
}

/** Recompute rolling last-point labels the way PR preview's API does (full store). */
export function enrichSubmissionsLastPointLabels<T extends Record<string, unknown>>(json: T, now = Date.now()): T {
  const dex = ((json.records as DexRow[] | undefined) ?? []).filter((r) => !r.archived);
  const league = ((json.leagueUsers as LeagueRow[] | undefined) ?? []).filter((r) => !r.archived).map(leagueToSession);
  const merged = mergeByCid([dex, league]);
  const labels = lastPointLabelCounts(merged, now);

  const out = { ...json, lastPointLabels: labels } as T & { lastPointLabels: typeof labels };

  const patchTool = (activity: DailyActivityPoint[] | undefined) =>
    activity?.length ? patchActivitySeries(activity, now, labels) : activity;

  if (out.byTool && typeof out.byTool === 'object') {
    const byTool = { ...(out.byTool as Record<string, { activity?: DailyActivityPoint[] }>) };
    for (const key of Object.keys(byTool)) {
      const slice = byTool[key];
      if (!slice?.activity) continue;
      byTool[key] = { ...slice, activity: patchTool(slice.activity)! };
    }
    (out as Record<string, unknown>).byTool = byTool;
  }

  if (Array.isArray(out.activity)) {
    (out as Record<string, unknown>).activity = patchTool(out.activity as DailyActivityPoint[]);
  }

  return out;
}
