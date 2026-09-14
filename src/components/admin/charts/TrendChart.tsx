import { Panel } from '@/components/admin/ui';
import { useECharts, cssVar, topTooltip, type EChartsOption } from './useECharts';
import {
  countLabelLayout,
  extendThroughToday,
  lastPointIsToday,
  monthDividerIndices,
  monthLabelTicks,
  splitProvisional,
  weekLineIndices,
  windowCounts,
  type CountLabelSide,
  type DailyPoint,
} from './trendSeries';

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Left-aligned one-line labels sit this many px left of today's x, so they stay in the plot. */
const COUNT_LABEL_PX = 54;
/** X-axis label ribbon under the plot. Month partitions live only in this band. */
const GRID_BOTTOM = 22;

function countLabel(
  kind: '24h' | '7d',
  count: number,
  color: string,
  x: number,
  y: number,
  side: CountLabelSide,
) {
  const face = 'ui-sans-serif, system-ui, sans-serif';
  return {
    type: 'text' as const,
    x,
    y,
    style: {
      text: `{k|${kind}: }{n|${count}}`,
      fill: color,
      fontSize: 10,
      fontWeight: 400,
      fontFamily: face,
      textAlign: 'left' as const,
      textVerticalAlign: side === 'above' ? 'bottom' : 'top',
      rich: {
        k: { fontSize: 10, fontWeight: 400, fill: color, fontFamily: face },
        n: { fontSize: 10, fontWeight: 700, fill: color, fontFamily: face },
      },
    },
  };
}

function LegendSwatch({ color }: { color: string }) {
  return <span className="block h-[2px] w-3 shrink-0" style={{ backgroundColor: color }} />;
}

function TrendChart({ series, nowMs }: { series: DailyPoint[]; nowMs: number }) {
  const days = series.map((p) => p.day);
  const daily = series.map((p) => p.dau);
  const weekly = series.map((p) => p.rolling7);
  const labels = days.map(fmtDay);
  const provisional = lastPointIsToday(series, nowMs);
  const dailySplit = splitProvisional(daily, provisional);
  const weeklySplit = splitProvisional(weekly, provisional);
  const weekMarks = weekLineIndices(days, nowMs);
  const monthDividers = monthDividerIndices(days);
  const monthTicks = monthLabelTicks(days);
  const monthAt = new Map(monthTicks.map((t) => [t.idx, t.label]));
  const counts = windowCounts(series);
  const finiteWeekly = weekly.filter((v): v is number => v != null);
  const dataMax = Math.max(1, ...daily, ...finiteWeekly);
  const layout = countLabelLayout(daily, weekly, dataMax);

  const ref = useECharts(
    (el): EChartsOption => {
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const red = cssVar(el, '--color-primary', '#dc2626');
      const gridLine = { color: grid, width: 1 };

      return {
        animation: false,
        grid: { left: 36, right: 14, top: 36, bottom: GRID_BOTTOM },
        tooltip: {
          ...topTooltip(el),
          trigger: 'axis',
          axisPointer: { type: 'none' },
          formatter: (params: unknown) => {
            const arr = params as { dataIndex: number }[];
            const i = arr[0]?.dataIndex ?? 0;
            const w = weekly[i];
            return `${labels[i]} · <b>${daily[i]}</b> daily${w != null ? ` · <b>${w}</b> weekly` : ''}`;
          },
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
          axisLabel: {
            color: faint,
            fontSize: 9,
            hideOverlap: false,
            align: 'left',
            alignMinLabel: 'left',
            overflow: 'none',
            interval: (idx: number) => monthAt.has(idx),
            formatter: (_value: string, idx: number) => monthAt.get(idx) ?? '',
          },
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
              const xAt = (idx: number) => x + (idx / last) * width;
              const weeks = weekMarks.map((idx) => {
                const px = xAt(idx);
                return {
                  type: 'line' as const,
                  shape: { x1: px, y1: y, x2: px, y2: y + height },
                  style: { stroke: grid, lineWidth: 1, fill: 'none' },
                };
              });
              const ribbonTop = y + height;
              const months = monthDividers.map((idx) => {
                const px = xAt(idx);
                return {
                  type: 'line' as const,
                  shape: { x1: px, y1: ribbonTop, x2: px, y2: ribbonTop + GRID_BOTTOM },
                  style: { stroke: faint, lineWidth: 1, fill: 'none' },
                };
              });
              return { type: 'group', children: [...weeks, ...months] };
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
          ...(layout
            ? [
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
                    const x = api.coord([last, 0])[0] - COUNT_LABEL_PX;
                    const y24 = api.coord([last, layout.dailyY])[1];
                    const y7 = api.coord([last, layout.weeklyY])[1];
                    const children = [
                      countLabel('24h', counts.hours24, faint, x, y24, layout.side),
                    ];
                    if (counts.days7 != null) {
                      children.push(countLabel('7d', counts.days7, red, x, y7, layout.side));
                    }
                    return { type: 'group', children };
                  },
                },
              ]
            : []),
        ],
      };
    },
    [series, nowMs],
    { scrub: true, overlayPointer: true },
  );

  if (series.length < 2) {
    return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  }

  const lo = Math.min(...daily);
  const hi = Math.max(...daily);
  return (
    <div
      ref={ref}
      className="h-[180px] w-full touch-none md:h-[220px]"
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
