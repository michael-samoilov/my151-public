import { useCallback, useMemo, useState } from 'react';
import { Panel } from '@/components/admin/ui';
import { useECharts, cssVar, type EChartsOption } from './useECharts';
import { impliedActivityGrowth, type ImpliedActivityGrowth } from '../../../../api/_aggregate';
import { rangeStart, type DashboardRange } from '../../../../api/_range';
import {
  chartDailyValues,
  chartHourlyValues,
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

const GRID_LEFT = 36;
const GRID_BOTTOM = 22;
const LABEL_INSET = 6;
const GRID_TOP = 8;
const LABEL_TAIL = 10;
const LABEL_FACE = 'ui-sans-serif, system-ui, sans-serif';

function subSize(numSize: number): number {
  return Math.max(7, Math.round(numSize * 0.55));
}

/**
 * A count drawn at a line's end. It always equals the line's newest point. The unit names what
 * that point counts: a day name for a calendar day, or a duration for a window that ends now.
 */
interface EndLabel {
  unit: string;
  count: number;
  lowerBound?: boolean;
}

function measureWindowLabelPx({ unit, count, lowerBound }: EndLabel, numSize: number): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 56;
  ctx.font = `700 ${numSize}px ${LABEL_FACE}`;
  const n = ctx.measureText(`${lowerBound ? '≥' : ''}${count}`).width;
  ctx.font = `400 ${subSize(numSize)}px ${LABEL_FACE}`;
  return n + 2 + ctx.measureText(unit).width;
}

function gridRightPx(labels: EndLabel[], numSize: number, growthLabels: string[] = []): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx) ctx.font = `400 ${growthFontSize(numSize)}px ${LABEL_FACE}`;
  const growthWidth = Math.max(0, ...growthLabels.map(label => ctx?.measureText(label).width ?? 0));
  return Math.ceil(LABEL_INSET + Math.max(...labels.map(label => measureWindowLabelPx(label, numSize)), growthWidth) + LABEL_TAIL);
}

const growthFontSize = (numSize: number) => numSize < 16 ? 9 : 10;

function countLabel(
  name: 'daily' | 'weekly' | 'monthly' | 'hourly',
  { unit, count, lowerBound }: EndLabel,
  color: string,
  x: number,
  y: number,
  numSize: number,
  growth?: string,
) {
  const sub = subSize(numSize);
  const countText = {
    name,
    type: 'text' as const,
    x,
    y,
    style: {
      text: `{n|${lowerBound ? '≥' : ''}${count}}{k|${unit}}`,
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
  return growth ? { name, type: 'group' as const, children: [countText, {
    type: 'text' as const, x, y: y + numSize / 2 + 4,
    style: { text: growth, fill: color, fontSize: growthFontSize(numSize), fontFamily: LABEL_FACE,
      textAlign: 'left' as const, textVerticalAlign: 'top' as const },
  }] } : countText;
}

function LegendSwatch({ color }: { color: string }) {
  return <span className="block h-[2px] w-3 shrink-0" style={{ backgroundColor: color }} />;
}

function TrendChart({
  series,
  historyOriginDay,
  nowMs,
  shown,
  growth,
}: {
  series: DailyPoint[];
  historyOriginDay: number;
  nowMs: number;
  shown: Record<'daily' | 'weekly' | 'monthly', boolean>;
  growth: ImpliedActivityGrowth;
}) {
  const { daily, labels, counts, dailySpoken, weeklyGrowth, monthlyGrowth, scrubLabel, build } = useMemo(() => {
    const weeklyGrowth = growth.weeklyPercent === null ? undefined : `${growthPercent(growth.weeklyPercent)} WoW`;
    const monthlyGrowth = growth.monthlyPercent === null ? undefined : `${growthPercent(growth.monthlyPercent)} MoM`;
    const days = series.map((p) => p.day);
    // On these ranges the daily line ends on the last 24 hours; only the 7d range ends on the calendar day.
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
    const newest = series.at(-1);
    const counts = { ...windowCounts(series), days30: newest?.label720h ?? newest?.recordedLabel720h ?? null };
    const rolling = newest?.label24h != null;
    const dailyEnd: EndLabel = { unit: rolling ? '24h' : newest ? fmtWeekday(newest.day) : '', count: daily.at(-1) ?? 0 };
    const dailySpoken = rolling
      ? `Last 24 hours ${dailyEnd.count}`
      : `${dailyEnd.unit}${provisional ? ' so far' : ''} ${dailyEnd.count}`;
    const weeklyEnd: EndLabel | null = counts.days7 == null ? null : { unit: '7d', count: counts.days7 };
    const monthlyEnd: EndLabel | null = counts.days30 == null ? null : { unit: '30d', count: counts.days30, lowerBound: newest?.label720h == null };
    const scrubLabel = (i: number) => {
      const w = weekly[i];
      const m = monthly[i];
      const monthlyLowerBound = i === series.length - 1 ? series[i].label720h == null : series[i].rolling30 == null;
      return [labels[i], ...(shown.daily ? [`<b>${daily[i]}</b> daily`] : []),
        ...(shown.weekly && w != null ? [`<b>${w}</b> weekly`] : []),
        ...(shown.monthly && m != null ? [`<b>${monthlyLowerBound ? '≥' : ''}${m}</b> monthly (recorded)`] : [])];
    };

    const build = (el: HTMLDivElement): EChartsOption => {
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const red = cssVar(el, '--color-primary', '#dc2626');
      const monthlyColor = cssVar(el, '--color-foreground', '#171717');
      const gridLine = { color: grid, width: 1 };
      const axisFont = el.clientWidth < 600 ? 8 : 9;
      const numSize = el.clientWidth < 600 ? 14 : 16;
      const right = gridRightPx([dailyEnd, weeklyEnd, monthlyEnd].filter((label): label is EndLabel => label != null), numSize, [shown.weekly ? weeklyGrowth : undefined, shown.monthly ? monthlyGrowth : undefined].filter((text): text is string => text !== undefined));

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
                ...(shown.daily ? [{ name: 'daily' as const, end: dailyEnd, color: faint, value: daily[last], growth: undefined }] : []),
                ...(shown.weekly && weeklyEnd ? [{ name: 'weekly' as const, end: weeklyEnd, color: red, value: weekly[last] ?? weeklyEnd.count, growth: weeklyGrowth }] : []),
                ...(shown.monthly && monthlyEnd ? [{ name: 'monthly' as const, end: monthlyEnd, color: monthlyColor, value: monthly[last] ?? monthlyEnd.count, growth: monthlyGrowth }] : []),
              ].map(label => ({ ...label, y: api.coord([last, label.value])[1] })).sort((a, b) => a.y - b.y);
              for (let i = 1; i < gutterLabels.length; i++) {
                gutterLabels[i].y = Math.max(gutterLabels[i].y, gutterLabels[i - 1].y + numSize + 4 + (gutterLabels[i - 1].growth ? growthFontSize(numSize) + 4 : 0));
              }
              const bottom = gutterLabels.at(-1);
              const overflow = Math.max(0, (bottom?.y ?? 0) - api.coord([last, 0])[1] + numSize / 2 + (bottom?.growth ? growthFontSize(numSize) + 4 : 0));
              for (const label of gutterLabels) label.y -= overflow;
              const children = gutterLabels.map(label => countLabel(label.name, label.end, label.color, x, label.y, numSize, label.growth));
              // Labels reorder as lines toggle; match windows by name to preserve their transforms.
              return { type: 'group', $mergeChildren: 'byName', children };
            },
          },
        ],
      };
    };
    return { daily, labels, counts, dailySpoken, weeklyGrowth, monthlyGrowth, scrubLabel, build };
  }, [series, nowMs, historyOriginDay, shown, growth]);
  const ref = useECharts(build, { scrub: { count: labels.length, label: scrubLabel } });

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
      aria-label={`Daily active users over ${series.length} days, ranging ${lo} to ${hi}${shown.weekly && counts.days7 != null && weeklyGrowth ? `, 7d label implied growth ${weeklyGrowth}` : ''}${shown.monthly && counts.days30 != null && monthlyGrowth ? `, 30d label implied growth ${monthlyGrowth}` : ''}, with${shown.weekly ? ' trailing 7-day unique active users' : ''}${shown.monthly ? ' trailing 30-day recorded unique active users' : ''}. ${dailySpoken}${shown.weekly && counts.days7 != null ? `, last 7 days ${counts.days7}` : ''}${shown.monthly && counts.days30 != null ? `, last 30 days ${counts.days30}` : ''}.`}
    />
  );
}

interface UniqueUsersModel {
  values: number[];
  axisLabels: string[];
  showTick: (index: number, last: number) => boolean;
  scrubLabel: (index: number) => string[];
}

function UniqueUsersLineChart({
  model,
  ariaLabel,
  seriesName,
  provisional,
  end,
}: {
  model: UniqueUsersModel;
  ariaLabel: string;
  seriesName: 'hourly' | 'daily';
  provisional: boolean;
  end: EndLabel;
}) {
  const build = useCallback(
    (el: HTMLDivElement): EChartsOption => {
      const { values, axisLabels, showTick } = model;
      const split = splitProvisional(values, provisional);
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const axisFont = el.clientWidth < 600 ? 8 : 9;
      const numSize = el.clientWidth < 600 ? 14 : 16;
      const right = Math.ceil(LABEL_INSET + measureWindowLabelPx(end, numSize) + LABEL_TAIL);
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
                children: [countLabel(seriesName, end, faint, x, api.coord([i, values[i] ?? 0])[1], numSize)],
              };
            },
          },
        ],
      };
    },
    [model, seriesName, provisional, end],
  );
  const ref = useECharts(build, { scrub: { count: model.axisLabels.length, label: model.scrubLabel } });

  if (model.values.length < 2) {
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
  nowMs,
}: {
  series: HourlyPoint[];
  nowMs: number;
}) {
  const { model, end, endName } = useMemo(() => {
    const values = chartHourlyValues(series);
    const hourLabels = series.map((p) => fmtHour(p.hour));
    const last = Math.max(values.length - 1, 1);
    const pastHour = series.at(-1)?.pastHour != null;
    const endName = pastHour ? 'Past hour' : hourLabels.at(-1) ?? '';
    const model: UniqueUsersModel = {
      values,
      axisLabels: hourLabels,
      showTick: (i) => i === 0 || i === last || i % 6 === 0,
      scrubLabel: (i) => [i === values.length - 1 ? endName : hourLabels[i], `<b>${values[i]}</b> hourly`],
    };
    const end: EndLabel = { unit: pastHour ? '1h' : hourLabels.at(-1) ?? '', count: values.at(-1) ?? 0 };
    return { model, end, endName };
  }, [series]);
  const lo = model.values.length ? Math.min(...model.values) : 0;
  const hi = model.values.length ? Math.max(...model.values) : 0;
  return (
    <UniqueUsersLineChart
      model={model}
      ariaLabel={`Hourly active users over ${series.length} hours, ranging ${lo} to ${hi}. ${endName} ${end.count}.`}
      seriesName="hourly"
      provisional={lastPointIsCurrentHour(series, nowMs)}
      end={end}
    />
  );
}

function DailyWeekdayChart({
  series,
  nowMs,
}: {
  series: DailyPoint[];
  nowMs: number;
}) {
  const { model, weekdayList, end } = useMemo(() => {
    const values = series.map((p) => p.dau);
    const ticks = dailyWeekdayTicks(series);
    const tickAt = new Map(ticks.map((t) => [t.idx, t.weekday]));
    const axisLabels = series.map((_, i) => tickAt.get(i) ?? '');
    const model: UniqueUsersModel = {
      values,
      axisLabels,
      showTick: (i) => tickAt.has(i),
      scrubLabel: (i) => [fmtWeekday(series[i].day), `<b>${values[i]}</b> daily`],
    };
    const newest = series.at(-1);
    const end: EndLabel = { unit: newest ? fmtWeekday(newest.day) : '', count: values.at(-1) ?? 0 };
    return { model, end, weekdayList: ticks.map((t) => t.weekday).join(', ') };
  }, [series]);
  const lo = model.values.length ? Math.min(...model.values) : 0;
  const hi = model.values.length ? Math.max(...model.values) : 0;
  const provisional = lastPointIsToday(series, nowMs);
  return (
    <UniqueUsersLineChart
      model={model}
      ariaLabel={`Daily active users over ${series.length} days, ranging ${lo} to ${hi}. ${end.unit}${provisional ? ' so far' : ''} ${end.count}. ${weekdayList}.`}
      seriesName="daily"
      provisional={provisional}
      end={end}
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
  const [shown, setShown] = useState({ daily: true, weekly: true, monthly: false });
  const padded = useMemo(() => extendThroughToday(series, nowMs), [series, nowMs]);
  const visible = useMemo(() => sliceActivityRange(padded, rangeStart(range, nowMs)), [padded, nowMs, range]);
  const hourly24 = useMemo(() => sliceHourlyRange(hourly, nowMs), [hourly, nowMs]);
  const daily7 = useMemo(() => sliceLastUtcDays(padded, nowMs, 7), [padded, nowMs]);
  const growth = useMemo(() => impliedActivityGrowth(series, rangeStart(range, nowMs), nowMs), [series, nowMs, range]);
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
        <HourlyTrendChart series={hourly24} nowMs={nowMs} />
      ) : range === '7d' ? (
        <DailyWeekdayChart series={daily7} nowMs={nowMs} />
      ) : (
        <TrendChart series={visible} historyOriginDay={padded[0]?.day ?? 0} nowMs={nowMs} shown={shown} growth={growth} />
      )}
      <div className="mt-2 space-y-1 text-[0.65rem] text-muted-foreground">
        <p className={`tabular-nums ${range !== '24h' && range !== '7d' ? 'sr-only' : ''}`} aria-label="Implied growth over selected range">
          Implied WoW {growthPercent(growth.weeklyPercent)} · MoM {growthPercent(growth.monthlyPercent)}
        </p>
        <p>{growth.days} complete recorded days</p>
      </div>
    </Panel>
  );
}

function growthPercent(value: number | null): string {
  if (value === null) return '—';
  const rounded = Math.round(value * 10) / 10 || 0;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString(undefined, {maximumFractionDigits: 1})}%`;
}
