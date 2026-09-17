import { Panel } from '@/components/admin/ui';
import { useECharts, cssVar, topTooltip, type EChartsOption } from './useECharts';
import { tipDataIndex } from './scrubPlot';
import {
  extendThroughToday,
  lastPointIsToday,
  monthDividerIndices,
  monthLabelTicks,
  chartDailyValues,
  chartWeeklyValues,
  splitProvisional,
  windowCounts,
  type DailyPoint,
} from './trendSeries';

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Left plot inset. Holds the y-axis labels. */
const GRID_LEFT = 36;
/** X-axis label ribbon under the plot. Month partitions live only in this band. */
const GRID_BOTTOM = 22;
/** Gap from the last plotted x into the gutter. */
const LABEL_INSET = 6;
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

function TrendChart({ series, nowMs }: { series: DailyPoint[]; nowMs: number }) {
  const days = series.map((p) => p.day);
  const daily = chartDailyValues(series);
  const weekly = chartWeeklyValues(series);
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
        grid: { left: GRID_LEFT, right, top: 36, bottom: GRID_BOTTOM },
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
                children.push(
                  countLabel('7d', counts.days7, red, x, api.coord([last, weekly[last]])[1], numSize),
                );
              }
              return { type: 'group', children };
            },
          },
        ],
      };
    },
    [series, nowMs],
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

export function ActiveUsersPanel({ series, nowMs }: { series: DailyPoint[]; nowMs: number }) {
  const padded = extendThroughToday(series, nowMs);
  const faint = 'var(--color-muted-foreground)';
  return (
    <Panel
      className="overflow-visible"
      title="Active users"
      legend={
        <span className="flex items-center gap-3 text-[0.7rem] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <LegendSwatch color={faint} />
            daily
          </span>
          <span className="inline-flex items-center gap-1">
            <LegendSwatch color="var(--color-primary)" />
            weekly
          </span>
        </span>
      }
    >
      <TrendChart series={padded} nowMs={nowMs} />
    </Panel>
  );
}
