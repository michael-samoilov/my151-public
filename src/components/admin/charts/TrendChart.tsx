import { Panel } from '@/components/admin/ui';
import { useECharts, cssVar, topTooltip, type EChartsOption } from './useECharts';
import {
  countLabelLayout,
  extendThroughToday,
  lastPointIsToday,
  monthLabelTicks,
  rollingSum7,
  splitProvisional,
  weekLineIndices,
  windowCounts,
  type DailyPoint,
} from './trendSeries';

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function LegendSwatch({ color }: { color: string }) {
  return <span className="block h-[2px] w-3 shrink-0" style={{ backgroundColor: color }} />;
}

function TrendChart({ series, nowMs }: { series: DailyPoint[]; nowMs: number }) {
  const days = series.map((p) => p.day);
  const daily = series.map((p) => p.dau);
  const weekly = rollingSum7(daily);
  const labels = days.map(fmtDay);
  const provisional = lastPointIsToday(series, nowMs);
  const dailySplit = splitProvisional(daily, provisional);
  const weeklySplit = splitProvisional(weekly, provisional);
  const weekMarks = weekLineIndices(days, nowMs);
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
        grid: { left: 36, right: 14, top: 36, bottom: 22 },
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
          axisLine: { lineStyle: { color: grid } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            color: faint,
            fontSize: 9,
            hideOverlap: true,
            alignMinLabel: 'left',
            alignMaxLabel: 'right',
            overflow: 'none',
            interval: (idx: number) => monthAt.has(idx),
            formatter: (_value: string, idx: number) => monthAt.get(idx) ?? '',
          },
        },
        yAxis: {
          type: 'value',
          min: 0,
          axisLabel: { color: faint, fontSize: 9 },
          splitLine: { lineStyle: gridLine },
        },
        series: [
          {
            name: 'daily',
            type: 'line',
            data: dailySplit.complete,
            lineStyle: { color: faint, width: 1 },
            itemStyle: { color: faint },
            symbol: 'none',
            z: 2,
            markLine: {
              silent: true,
              symbol: 'none',
              animation: false,
              label: { show: false },
              lineStyle: gridLine,
              data: weekMarks.map((x) => ({ xAxis: x })),
              z: 1,
            },
          },
          {
            name: 'daily today',
            type: 'line',
            data: dailySplit.provisional,
            lineStyle: { color: faint, width: 1, type: 'dotted' },
            itemStyle: { color: faint },
            symbol: 'none',
            z: 2,
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
                  data: [0],
                  renderItem: (
                    _params: unknown,
                    api: {
                      coord: (v: number[]) => number[];
                    },
                  ) => {
                    const last = daily.length - 1;
                    const midX = (api.coord([last - 1, 0])[0] + api.coord([last, 0])[0]) / 2;
                    const y24 = api.coord([last, layout.dailyY])[1];
                    const y7 = api.coord([last, layout.weeklyY])[1];
                    const children: Record<string, unknown>[] = [
                      {
                        type: 'text',
                        x: midX,
                        y: y24,
                        style: {
                          text: `${counts.hours24}\n24h`,
                          fill: faint,
                          font: '600 10px ui-sans-serif, system-ui, sans-serif',
                          textAlign: 'center',
                          textVerticalAlign: layout.side === 'above' ? 'bottom' : 'top',
                          lineHeight: 12,
                        },
                      },
                    ];
                    if (counts.days7 != null) {
                      children.push({
                        type: 'text',
                        x: midX,
                        y: y7,
                        style: {
                          text: `${counts.days7}\n7d`,
                          fill: red,
                          font: '600 10px ui-sans-serif, system-ui, sans-serif',
                          textAlign: 'center',
                          textVerticalAlign: layout.side === 'above' ? 'bottom' : 'top',
                          lineHeight: 12,
                        },
                      });
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
      aria-label={`Daily active users over ${series.length} days, ranging ${lo} to ${hi}, with a trailing 7-day rolling sum. Last 24 hours ${counts.hours24}${counts.days7 != null ? `, last 7 days ${counts.days7}` : ''}.`}
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
