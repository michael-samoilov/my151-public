import { useMemo, useState } from 'react';
import { Panel } from '@/components/admin/ui';
import { useECharts, cssVar, type EChartsOption } from './useECharts';
import { dayStart, type ActivityGrowth } from '../../../../api/_aggregate';
import { rangeStart, type DashboardRange } from '../../../../api/_range';
import {
  chartDailyValues,
  chartMonthlyValues,
  chartWeeklyValues,
  dailyWeekdayTicks,
  extendThroughToday,
  lastPointIsCurrentHour,
  lastPointIsToday,
  monthDividerIndices,
  monthLabelTicks,
  sliceActivityRange,
  sliceHourlyRange,
  sliceLastUtcDays,
  splitProvisional,
  windowCounts,
  type DailyPoint,
  type HourlyPoint,
} from './trendSeries';

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function fmtHour(ms: number): string {
  return `${String(new Date(ms).getUTCHours()).padStart(2, '0')}:00`;
}

function fmtWeekday(ms: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(ms).getUTCDay()];
}

/** Left plot inset. Holds the y-axis labels. */
const GRID_LEFT = 36;
/** X-axis label ribbon under the plot. Month partitions live only in this band. */
const GRID_BOTTOM = 22;
/** Gap from the last plotted x into the gutter. */
const LABEL_INSET = 6;
const GRID_TOP = 8;
/** Gap from the end of the longest window label to the canvas edge. */
const LABEL_TAIL = 10;
const LABEL_FACE = 'ui-sans-serif, system-ui, sans-serif';

function subSize(numSize: number): number {
  return Math.max(7, Math.round(numSize * 0.55));
}

function measureWindowLabelPx(kind: '30d' | '7d' | '24h', count: number, numSize: number): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 56;
  ctx.font = `700 ${numSize}px ${LABEL_FACE}`;
  const n = ctx.measureText(`${kind === '30d' ? '≥' : ''}${count}`).width;
  ctx.font = `400 ${subSize(numSize)}px ${LABEL_FACE}`;
  return n + 2 + ctx.measureText(kind).width;
}

function gridRightPx(counts: { hours24: number; days7: number | null; days30: number | null }, numSize: number): number {
  const w24 = measureWindowLabelPx('24h', counts.hours24, numSize);
  const w7 = counts.days7 == null ? 0 : measureWindowLabelPx('7d', counts.days7, numSize);
  const w30 = counts.days30 == null ? 0 : measureWindowLabelPx('30d', counts.days30, numSize);
  return Math.ceil(LABEL_INSET + Math.max(w24, w7, w30) + LABEL_TAIL);
}

function countLabel(
  kind: '24h' | '7d' | '30d',
  count: number,
  color: string,
  x: number,
  y: number,
  numSize: number,
  lowerBound = false,
) {
  const sub = subSize(numSize);
  return {
    type: 'text' as const,
    x,
    y,
    style: {
      text: `{n|${lowerBound ? '≥' : ''}${count}}{k|${kind}}`,
      fill: color,
      fontSize: numSize,
      fontWeight: 700,
      fontFamily: LABEL_FACE,
      textAlign: 'left' as const,
      textVerticalAlign: 'middle' as const,
      rich: {
        n: { fontSize: numSize, fontWeight: 700, fill: color, fontFamily: LABEL_FACE },
        k: {
          fontSize: sub,
          fontWeight: 400,
          fill: color,
          fontFamily: LABEL_FACE,
          padding: [0, 0, 0, 2],
          verticalAlign: 'bottom' as const,
        },
      },
    },
  };
}

function LegendSwatch({ color }: { color: string }) {
  return <span className="block h-[2px] w-3 shrink-0" style={{ backgroundColor: color }} />;
}

function TrendChart({
  series,
  historyOriginDay,
  nowMs,
  shown,
}: {
  series: DailyPoint[];
  historyOriginDay: number;
  nowMs: number;
  shown: Record<'daily' | 'weekly' | 'monthly', boolean>;
}) {
  const days = series.map((p) => p.day);
  const daily = chartDailyValues(series);
  const weekly = chartWeeklyValues(series, historyOriginDay);
  const monthly = chartMonthlyValues(series);
  const labels = days.map(fmtDay);
  const provisional = lastPointIsToday(series, nowMs);
  const dailySplit = splitProvisional(daily.map(v => shown.daily ? v : null), provisional);
  const weeklySplit = splitProvisional(weekly.map(v => shown.weekly ? v : null), provisional);
  const monthlySplit = splitProvisional(monthly.map(v => shown.monthly ? v : null), provisional);
  const monthDividers = monthDividerIndices(days);
  const monthTicks = monthLabelTicks(days);
  const counts = { ...windowCounts(series), days30: series.at(-1)?.label720h ?? series.at(-1)?.recordedLabel720h ?? null };
  const scrubLabel = (i: number) => {
    const w = weekly[i];
    const m = monthly[i];
    const monthlyLowerBound = i === series.length - 1 ? series[i].label720h == null : series[i].rolling30 == null;
    return [labels[i], ...(shown.daily ? [`<b>${daily[i]}</b> daily`] : []),
      ...(shown.weekly && w != null ? [`<b>${w}</b> weekly`] : []),
      ...(shown.monthly && m != null ? [`<b>${monthlyLowerBound ? '≥' : ''}${m}</b> monthly (recorded)`] : [])];
  };

  const ref = useECharts(
    (el): EChartsOption => {
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const red = cssVar(el, '--color-primary', '#dc2626');
      const monthlyColor = cssVar(el, '--color-foreground', '#171717');
      const gridLine = { color: grid, width: 1 };
      const axisFont = el.clientWidth < 600 ? 8 : 9;
      const numSize = el.clientWidth < 600 ? 14 : 16;
      const right = gridRightPx(counts, numSize);

      return {
        animation: false,
        grid: { left: GRID_LEFT, right, top: GRID_TOP, bottom: GRID_BOTTOM },
        xAxis: {
          type: 'category',
          data: labels,
          boundaryGap: false,
          z: 0,
          axisLine: { lineStyle: { color: grid } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
        },
        yAxis: {
          type: 'value',
          min: 0,
          z: 0,
          axisLabel: { color: faint, fontSize: 9 },
          splitLine: { show: true, lineStyle: { ...gridLine, type: 'solid' } },
        },
        series: [
          {
            type: 'custom' as const,
            name: 'gridlines',
            silent: true,
            clip: false,
            tooltip: { show: false },
            z: 0,
            zlevel: 0,
            data: [0],
            renderItem: (params: { coordSys: { x: number; y: number; width: number; height: number } }) => {
              const { x, y, width, height } = params.coordSys;
              const last = Math.max(daily.length - 1, 1);
              const ribbonTop = y + height;
              const nameY = ribbonTop + 2;
              const yearY = nameY + axisFont;
              const dividers = monthDividers.map((idx) => {
                const px = x + (idx / last) * width;
                return {
                  type: 'line' as const,
                  shape: { x1: px, y1: ribbonTop, x2: px, y2: ribbonTop + GRID_BOTTOM },
                  style: { stroke: grid, lineWidth: 1, fill: 'none' },
                };
              });
              const names = monthTicks.map((tick) => ({
                type: 'text' as const,
                x: x + (tick.idx / last) * width,
                y: nameY,
                style: {
                  text: tick.abbr,
                  fill: faint,
                  fontSize: axisFont,
                  textAlign: 'left' as const,
                  textVerticalAlign: 'top' as const,
                },
              }));
              const years = monthTicks
                .filter((tick) => tick.year != null)
                .map((tick) => ({
                  type: 'text' as const,
                  x: x + (tick.idx / last) * width,
                  y: yearY,
                  style: {
                    text: String(tick.year),
                    fill: faint,
                    fontSize: axisFont,
                    textAlign: 'left' as const,
                    textVerticalAlign: 'top' as const,
                  },
                }));
              return { type: 'group', children: [...dividers, ...names, ...years] };
            },
          },
          {
            name: 'daily',
            type: 'line',
            data: dailySplit.complete,
            lineStyle: { color: faint, width: 1 },
            itemStyle: { color: faint },
            symbol: 'none',
            z: 2,
            zlevel: 1,
          },
          {
            name: 'daily today',
            type: 'line',
            data: dailySplit.provisional,
            lineStyle: { color: faint, width: 1, type: 'dotted' },
            itemStyle: { color: faint },
            symbol: 'none',
            z: 2,
            zlevel: 1,
          },
          {
            name: 'weekly',
            type: 'line',
            data: weeklySplit.complete,
            lineStyle: { color: red, width: 2.4 },
            itemStyle: { color: red },
            symbol: 'none',
            connectNulls: false,
            z: 3,
            zlevel: 1,
          },
          {
            name: 'weekly today',
            type: 'line',
            data: weeklySplit.provisional,
            lineStyle: { color: red, width: 2.4, type: 'dotted' },
            itemStyle: { color: red },
            symbol: 'none',
            connectNulls: false,
            z: 3,
            zlevel: 1,
          },
          ...(['complete', 'provisional'] as const).map(part => ({
            name: part === 'complete' ? 'monthly' : 'monthly today',
            type: 'line' as const,
            data: monthlySplit[part],
            lineStyle: { color: monthlyColor, width: 1.8, type: part === 'complete' ? 'solid' as const : 'dotted' as const },
            itemStyle: { color: monthlyColor },
            symbol: 'none',
            connectNulls: false,
            z: 3,
            zlevel: 1,
          })),
          {
            type: 'custom' as const,
            name: 'window counts',
            silent: true,
            clip: false,
            tooltip: { show: false },
            z: 5,
            zlevel: 1,
            data: [0],
            renderItem: (
              _params: unknown,
              api: {
                coord: (v: number[]) => number[];
              },
            ) => {
              const last = daily.length - 1;
              const x = api.coord([last, 0])[0] + LABEL_INSET;
              const gutterLabels = [
                ...(shown.daily ? [{ kind: '24h' as const, count: counts.hours24, color: faint, value: daily[last], lowerBound: false }] : []),
                ...(shown.weekly && counts.days7 != null ? [{ kind: '7d' as const, count: counts.days7, color: red, value: weekly[last] ?? counts.days7, lowerBound: false }] : []),
                ...(shown.monthly && counts.days30 != null ? [{ kind: '30d' as const, count: counts.days30, color: monthlyColor, value: monthly[last] ?? counts.days30, lowerBound: series[last].label720h == null }] : []),
              ].map(label => ({ ...label, y: api.coord([last, label.value])[1] })).sort((a, b) => a.y - b.y);
              for (let i = 1; i < gutterLabels.length; i++) {
                gutterLabels[i].y = Math.max(gutterLabels[i].y, gutterLabels[i - 1].y + numSize + 4);
              }
              const overflow = Math.max(0, (gutterLabels.at(-1)?.y ?? 0) - api.coord([last, 0])[1] + numSize / 2);
              for (const label of gutterLabels) label.y -= overflow;
              const children = gutterLabels.map(label => countLabel(label.kind, label.count, label.color, x, label.y, numSize, label.lowerBound));
              return { type: 'group', children };
            },
          },
        ],
      };
    },
    [series, nowMs, historyOriginDay, shown],
    { scrub: { count: labels.length, label: scrubLabel } },
  );

  if (series.length < 2) {
    return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  }

  const lo = Math.min(...daily);
  const hi = Math.max(...daily);
  return (
    <div
      ref={ref}
      className="h-[180px] w-full overflow-visible md:h-[220px]"
      role="img"
      aria-label={`Daily active users over ${series.length} days, ranging ${lo} to ${hi}, with${shown.weekly ? ' trailing 7-day unique active users' : ''}${shown.monthly ? ' trailing 30-day recorded unique active users' : ''}. Last 24 hours ${counts.hours24}${shown.weekly && counts.days7 != null ? `, last 7 days ${counts.days7}` : ''}${shown.monthly && counts.days30 != null ? `, last 30 days ${counts.days30}` : ''}.`}
    />
  );
}

function UniqueUsersLineChart({
  values,
  axisLabels,
  showTick,
  scrubLabel,
  ariaLabel,
  seriesName,
  provisional,
  counts,
  source,
}: {
  values: number[];
  axisLabels: string[];
  showTick: (i: number, last: number) => boolean;
  scrubLabel: (i: number) => string[];
  ariaLabel: string;
  seriesName: 'hourly' | 'daily';
  provisional: boolean;
  counts: { hours24: number };
  source: DailyPoint[] | HourlyPoint[];
}) {
  const split = splitProvisional(values, provisional);
  const ref = useECharts(
    (el): EChartsOption => {
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const axisFont = el.clientWidth < 600 ? 8 : 9;
      const numSize = el.clientWidth < 600 ? 14 : 16;
      const right = Math.ceil(LABEL_INSET + measureWindowLabelPx('24h', counts.hours24, numSize) + LABEL_TAIL);
      const last = Math.max(values.length - 1, 1);
      return {
        animation: false,
        grid: { left: GRID_LEFT, right, top: GRID_TOP, bottom: GRID_BOTTOM },
        xAxis: {
          type: 'category',
          data: axisLabels,
          boundaryGap: false,
          axisLine: { lineStyle: { color: grid } },
          axisTick: { show: false },
          axisLabel: {
            color: faint,
            fontSize: axisFont,
            interval: (i: number) => showTick(i, last),
          },
        },
        yAxis: {
          type: 'value',
          min: 0,
          axisLabel: { color: faint, fontSize: 9 },
          splitLine: { show: true, lineStyle: { color: grid, width: 1, type: 'solid' } },
        },
        series: [
          {
            name: seriesName,
            type: 'line',
            data: split.complete,
            lineStyle: { color: faint, width: 1.6 },
            itemStyle: { color: faint },
            symbol: 'none',
            z: 2,
          },
          {
            name: `${seriesName} now`,
            type: 'line',
            data: split.provisional,
            lineStyle: { color: faint, width: 1.6, type: 'dotted' },
            itemStyle: { color: faint },
            symbol: 'none',
            z: 2,
          },
          {
            type: 'custom' as const,
            name: 'window counts',
            silent: true,
            clip: false,
            tooltip: { show: false },
            z: 5,
            data: [0],
            renderItem: (
              _params: unknown,
              api: { coord: (v: number[]) => number[] },
            ) => {
              const i = values.length - 1;
              const x = api.coord([i, 0])[0] + LABEL_INSET;
              return {
                type: 'group',
                children: [countLabel('24h', counts.hours24, faint, x, api.coord([i, values[i] ?? 0])[1], numSize)],
              };
            },
          },
        ],
      };
    },
    [source, seriesName, provisional, counts.hours24],
    { scrub: { count: axisLabels.length, label: scrubLabel } },
  );

  if (values.length < 2) {
    return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  }
  return (
    <div
      ref={ref}
      className="h-[180px] w-full overflow-visible md:h-[220px]"
      role="img"
      aria-label={ariaLabel}
    />
  );
}

function HourlyTrendChart({
  series,
  counts,
  nowMs,
}: {
  series: HourlyPoint[];
  counts: { hours24: number; days7: number | null };
  nowMs: number;
}) {
  const values = series.map((p) => p.unique);
  const hourLabels = series.map((p) => fmtHour(p.hour));
  const last = Math.max(values.length - 1, 1);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  return (
    <UniqueUsersLineChart
      values={values}
      axisLabels={hourLabels}
      showTick={(i) => i === 0 || i === last || i % 6 === 0}
      scrubLabel={(i) => [hourLabels[i], `<b>${values[i]}</b> hourly`]}
      ariaLabel={`Hourly active users over ${series.length} hours, ranging ${lo} to ${hi}. Last 24 hours ${counts.hours24}.`}
      seriesName="hourly"
      provisional={lastPointIsCurrentHour(series, nowMs)}
      counts={counts}
      source={series}
    />
  );
}

function DailyWeekdayChart({
  series,
  counts,
  nowMs,
}: {
  series: DailyPoint[];
  counts: { hours24: number; days7: number | null };
  nowMs: number;
}) {
  const values = series.map((p) => p.dau);
  const ticks = dailyWeekdayTicks(series);
  const tickAt = new Map(ticks.map((t) => [t.idx, t.weekday]));
  const axisLabels = series.map((_, i) => tickAt.get(i) ?? '');
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  const weekdayList = ticks.map((t) => t.weekday).join(', ');
  return (
    <UniqueUsersLineChart
      values={values}
      axisLabels={axisLabels}
      showTick={(i) => tickAt.has(i)}
      scrubLabel={(i) => [fmtWeekday(series[i].day), `<b>${values[i]}</b> daily`]}
      ariaLabel={`Daily active users over ${series.length} days, ranging ${lo} to ${hi}. Last 24 hours ${counts.hours24}. ${weekdayList}.`}
      seriesName="daily"
      provisional={lastPointIsToday(series, nowMs)}
      counts={counts}
      source={series}
    />
  );
}

export function ActiveUsersPanel({
  series,
  hourly,
  nowMs,
  range,
}: {
  series: DailyPoint[];
  hourly: HourlyPoint[];
  nowMs: number;
  range: DashboardRange;
}) {
  const [shown, setShown] = useState({ daily: true, weekly: true, monthly: true });
  const padded = useMemo(() => extendThroughToday(series, nowMs), [series, nowMs]);
  const visible = useMemo(() => sliceActivityRange(padded, rangeStart(range, nowMs)), [padded, nowMs, range]);
  const hourly24 = useMemo(() => sliceHourlyRange(hourly, nowMs), [hourly, nowMs]);
  const daily7 = useMemo(() => sliceLastUtcDays(padded, nowMs, 7), [padded, nowMs]);
  const counts = windowCounts(padded);
  const faint = 'var(--color-muted-foreground)';
  const legend =
    range === '24h' ? (
      <span className="inline-flex items-center gap-1">
        <LegendSwatch color={faint} />
        hourly
      </span>
    ) : range === '7d' ? (
      <span className="inline-flex items-center gap-1">
        <LegendSwatch color={faint} />
        daily
      </span>
    ) : (
      <>
        {(['daily', 'weekly', 'monthly'] as const).map(kind => (
          <button
            key={kind}
            type="button"
            aria-pressed={shown[kind]}
            className="inline-flex min-h-6 cursor-pointer items-center gap-1"
            style={{ opacity: shown[kind] ? 1 : 0.45 }}
            onClick={() => setShown(previous => ({ ...previous, [kind]: !previous[kind] }))}
          >
            <LegendSwatch color={kind === 'daily' ? faint : kind === 'weekly' ? 'var(--color-primary)' : 'var(--color-foreground)'} />
            {kind}
          </button>
        ))}
      </>
    );
  return (
    <Panel
      className="overflow-visible"
      title="Active users"
      legend={<span className="flex items-center gap-3 text-[0.7rem] font-semibold text-muted-foreground">{legend}</span>}
    >
      {range === '24h' ? (
        <HourlyTrendChart series={hourly24} counts={counts} nowMs={nowMs} />
      ) : range === '7d' ? (
        <DailyWeekdayChart series={daily7} counts={counts} nowMs={nowMs} />
      ) : (
        <TrendChart series={visible} historyOriginDay={padded[0]?.day ?? 0} nowMs={nowMs} shown={shown} />
      )}
      {range !== '24h' && range !== '7d' && (
        <div className="mt-2 space-y-1 text-[0.65rem] text-muted-foreground">
          <p>Monthly: recorded activity (lower bounds).</p>
          <GrowthCaption kind="Weekly" days={7} growth={padded.at(-1)?.weeklyGrowth} nowMs={nowMs} />
          <GrowthCaption kind="Monthly" days={30} growth={padded.at(-1)?.monthlyGrowth} nowMs={nowMs} />
        </div>
      )}
    </Panel>
  );
}

function GrowthCaption({ kind, days, growth, nowMs }: { kind: string; days: 7 | 30; growth?: ActivityGrowth; nowMs: number }) {
  const end = growth?.end ?? dayStart(nowMs);
  const start = growth?.start ?? end - days * 86_400_000;
  const previousStart = growth?.previousStart ?? start - days * 86_400_000;
  const date = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  const dates = `${date(start)}–${date(end)} vs ${date(previousStart)}–${date(start)} (UTC; end exclusive)`;
  if (!growth || growth.status === 'unavailable') {
    const reason = growth?.status === 'unavailable' && growth.reason === 'recording outage'
      ? 'recording outage' : 'complete retained history is not verified';
    return <p>{kind} growth unavailable: {reason}. {dates}.</p>;
  }
  const percent = growth.percent == null ? 'percentage unavailable (previous window zero)'
    : `${growth.percent > 0 ? '+' : ''}${growth.percent.toFixed(1)}%`;
  return <p>{kind} growth {percent}: {growth.current} vs {growth.previous} distinct browsers. {dates}.</p>;
}
