import { useMemo, useState } from 'react';
import { Panel, Seg } from '@/components/admin/ui';
import { useECharts, cssVar, topTooltip, type EChartsOption } from './useECharts';
import { tipDataIndex } from './scrubPlot';
import {
  CHART_RANGE_PRESETS,
  chartDailyValues,
  chartRangeWindowMs,
  chartWeeklyValues,
  extendThroughToday,
  hourlyByWeekday,
  isHourlyRange,
  lastPointIsCurrentHour,
  lastPointIsToday,
  monthDividerIndices,
  monthLabelTicks,
  sliceActivityRange,
  sliceHourlyRange,
  splitProvisional,
  windowCounts,
  type ChartRangeKey,
  type DailyPoint,
  type HourlyPoint,
  type WeekdayHourlyFacet,
} from './trendSeries';

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function fmtHour(ms: number): string {
  return `${String(new Date(ms).getUTCHours()).padStart(2, '0')}:00`;
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

function measureWindowLabelPx(kind: '7d' | '24h', count: number, numSize: number): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 56;
  ctx.font = `700 ${numSize}px ${LABEL_FACE}`;
  const n = ctx.measureText(String(count)).width;
  ctx.font = `400 ${subSize(numSize)}px ${LABEL_FACE}`;
  return n + 2 + ctx.measureText(kind).width;
}

function gridRightPx(counts: { hours24: number; days7: number | null }, numSize: number): number {
  const w24 = measureWindowLabelPx('24h', counts.hours24, numSize);
  const w7 = counts.days7 == null ? 0 : measureWindowLabelPx('7d', counts.days7, numSize);
  return Math.ceil(LABEL_INSET + Math.max(w24, w7) + LABEL_TAIL);
}

function countLabel(
  kind: '24h' | '7d',
  count: number,
  color: string,
  x: number,
  y: number,
  numSize: number,
) {
  const sub = subSize(numSize);
  return {
    type: 'text' as const,
    x,
    y,
    style: {
      text: `{n|${count}}{k|${kind}}`,
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
}: {
  series: DailyPoint[];
  historyOriginDay: number;
  nowMs: number;
}) {
  const days = series.map((p) => p.day);
  const daily = chartDailyValues(series);
  const weekly = chartWeeklyValues(series, historyOriginDay);
  const labels = days.map(fmtDay);
  const provisional = lastPointIsToday(series, nowMs);
  const dailySplit = splitProvisional(daily, provisional);
  const weeklySplit = splitProvisional(weekly, provisional);
  const monthDividers = monthDividerIndices(days);
  const monthTicks = monthLabelTicks(days);
  const counts = windowCounts(series);
  const scrubLabel = (i: number) => {
    const w = weekly[i];
    return `${labels[i]} · <b>${daily[i]}</b> daily${w != null ? ` · <b>${w}</b> weekly` : ''}`;
  };

  const ref = useECharts(
    (el): EChartsOption => {
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const red = cssVar(el, '--color-primary', '#dc2626');
      const gridLine = { color: grid, width: 1 };
      const axisFont = el.clientWidth < 600 ? 8 : 9;
      const numSize = el.clientWidth < 600 ? 14 : 16;
      const right = gridRightPx(counts, numSize);

      return {
        animation: false,
        grid: { left: GRID_LEFT, right, top: GRID_TOP, bottom: GRID_BOTTOM },
        tooltip: {
          ...topTooltip(el),
          trigger: 'axis',
          axisPointer: { type: 'none' },
          formatter: (params: unknown) => scrubLabel(tipDataIndex(params)),
        },
        xAxis: {
          type: 'category',
          data: labels,
          boundaryGap: false,
          axisPointer: { show: false },
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
              const children = [
                countLabel('24h', counts.hours24, faint, x, api.coord([last, daily[last]])[1], numSize),
              ];
              if (counts.days7 != null) {
                const weeklyY = weekly[last] ?? counts.days7;
                children.push(
                  countLabel('7d', counts.days7, red, x, api.coord([last, weeklyY])[1], numSize),
                );
              }
              return { type: 'group', children };
            },
          },
        ],
      };
    },
    [series, nowMs, historyOriginDay],
    { scrub: true, overlayPointer: true, overlayLabel: scrubLabel },
  );

  if (series.length < 2) {
    return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  }

  const lo = Math.min(...daily);
  const hi = Math.max(...daily);
  return (
    <div
      ref={ref}
      className="h-[180px] w-full touch-none overflow-visible md:h-[220px]"
      role="img"
      aria-label={`Daily active users over ${series.length} days, ranging ${lo} to ${hi}, with trailing 7-day unique active users. Last 24 hours ${counts.hours24}${counts.days7 != null ? `, last 7 days ${counts.days7}` : ''}.`}
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
  const labels = series.map((p) => fmtHour(p.hour));
  const provisional = lastPointIsCurrentHour(series, nowMs);
  const split = splitProvisional(values, provisional);
  const scrubLabel = (i: number) => `${labels[i]} · <b>${values[i]}</b> hourly`;

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
        tooltip: {
          ...topTooltip(el),
          trigger: 'axis',
          axisPointer: { type: 'none' },
          formatter: (params: unknown) => scrubLabel(tipDataIndex(params)),
        },
        xAxis: {
          type: 'category',
          data: labels,
          boundaryGap: false,
          axisPointer: { show: false },
          axisLine: { lineStyle: { color: grid } },
          axisTick: { show: false },
          axisLabel: {
            color: faint,
            fontSize: axisFont,
            interval: (i: number) => i === 0 || i === last || i % 6 === 0,
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
            name: 'hourly',
            type: 'line',
            data: split.complete,
            lineStyle: { color: faint, width: 1.6 },
            itemStyle: { color: faint },
            symbol: 'none',
            z: 2,
          },
          {
            name: 'hourly now',
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
    [series, nowMs, counts.hours24],
    { scrub: true, overlayPointer: true, overlayLabel: scrubLabel },
  );

  if (series.length < 2) {
    return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return (
    <div
      ref={ref}
      className="h-[180px] w-full touch-none overflow-visible md:h-[220px]"
      role="img"
      aria-label={`Hourly active users over ${series.length} hours, ranging ${lo} to ${hi}. Last 24 hours ${counts.hours24}.`}
    />
  );
}

function HourlySparkline({ hours, yMax }: { hours: WeekdayHourlyFacet['hours']; yMax: number }) {
  const values = hours.map((p) => p.unique);
  const ref = useECharts((el): EChartsOption => {
    const faint = cssVar(el, '--color-muted-foreground', '#737373');
    const grid = cssVar(el, '--color-muted', '#f5f5f5');
    return {
      animation: false,
      grid: { left: 0, right: 0, top: 4, bottom: 4 },
      xAxis: { type: 'category', data: values.map((_, i) => i), show: false, boundaryGap: false },
      yAxis: { type: 'value', min: 0, max: yMax, show: false, splitLine: { show: false } },
      series: [
        {
          type: 'line',
          data: values,
          lineStyle: { color: faint, width: 1.4 },
          itemStyle: { color: faint },
          areaStyle: { color: grid, opacity: 0.65 },
          symbol: 'none',
          connectNulls: false,
        },
      ],
    };
  }, [hours, yMax]);
  return <div ref={ref} className="h-8 w-full md:h-10" />;
}

function WeekdayHourlyChart({ facets }: { facets: WeekdayHourlyFacet[] }) {
  const values = facets.flatMap((f) => f.hours.map((p) => p.unique)).filter((v): v is number => v != null);
  const yMax = Math.max(1, ...values);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  const names = facets.map((f) => f.weekday).join(', ');
  if (facets.every((f) => f.hours.length < 2)) {
    return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  }
  return (
    <div
      role="img"
      aria-label={`Hourly active users by weekday over ${facets.length} days, ranging ${lo} to ${hi}. ${names}.`}
      className="flex flex-col gap-1"
    >
      {facets.map((f) => (
        <div key={f.day} className="flex min-w-0 items-center gap-2">
          <span className="w-8 shrink-0 text-[0.65rem] font-semibold text-muted-foreground">{f.weekday}</span>
          <div className="min-w-0 flex-1">
            <HourlySparkline hours={f.hours} yMax={yMax} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActiveUsersPanel({
  series,
  hourly,
  nowMs,
}: {
  series: DailyPoint[];
  hourly: HourlyPoint[];
  nowMs: number;
}) {
  const [range, setRange] = useState<ChartRangeKey>('all');
  const padded = useMemo(() => extendThroughToday(series, nowMs), [series, nowMs]);
  const visible = useMemo(
    () => sliceActivityRange(padded, nowMs, chartRangeWindowMs(range)),
    [padded, nowMs, range],
  );
  const hourly24 = useMemo(
    () => sliceHourlyRange(hourly, nowMs, chartRangeWindowMs('24h')!),
    [hourly, nowMs],
  );
  const weekdayFacets = useMemo(() => hourlyByWeekday(hourly, nowMs), [hourly, nowMs]);
  const counts = windowCounts(padded);
  const hourlyView = isHourlyRange(range);
  const faint = 'var(--color-muted-foreground)';
  return (
    <Panel
      className="overflow-visible"
      title="Active users"
      legend={
        <span className="flex items-center gap-3 text-[0.7rem] font-semibold text-muted-foreground">
          {hourlyView ? (
            <span className="inline-flex items-center gap-1">
              <LegendSwatch color={faint} />
              hourly
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1">
                <LegendSwatch color={faint} />
                daily
              </span>
              <span className="inline-flex items-center gap-1">
                <LegendSwatch color="var(--color-primary)" />
                weekly
              </span>
            </>
          )}
        </span>
      }
    >
      <div className="-mt-1 mb-1.5">
        <Seg
          ariaLabel="Chart range"
          options={CHART_RANGE_PRESETS.map((p) => ({ key: p.key, label: p.label }))}
          value={range}
          onChange={setRange}
        />
      </div>
      {range === '24h' ? (
        <HourlyTrendChart series={hourly24} counts={counts} nowMs={nowMs} />
      ) : range === '7d' ? (
        <WeekdayHourlyChart facets={weekdayFacets} />
      ) : (
        <TrendChart series={visible} historyOriginDay={padded[0]?.day ?? 0} nowMs={nowMs} />
      )}
    </Panel>
  );
}
