import { Panel } from '@/components/admin/ui';
import { useECharts, cssVar, topTooltip, type EChartsOption } from './useECharts';
import {
  extendThroughToday,
  headerCounts,
  lastPointIsToday,
  rollingSum7,
  splitProvisional,
  sundayMidnightIndices,
  type DailyPoint,
} from './trendSeries';

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function LegendSwatch({ color }: { color: string }) {
  return <span className="inline-block h-[2px] w-3" style={{ backgroundColor: color }} />;
}

function TrendChart({ series, nowMs }: { series: DailyPoint[]; nowMs: number }) {
  const days = series.map((p) => p.day);
  const daily = series.map((p) => p.dau);
  const weekly = rollingSum7(daily);
  const labels = days.map(fmtDay);
  const provisional = lastPointIsToday(series, nowMs);
  const dailySplit = splitProvisional(daily, provisional);
  const weeklySplit = splitProvisional(weekly, provisional);
  const weekMarks = sundayMidnightIndices(days).filter((i) => i > 0);

  const ref = useECharts(
    (el): EChartsOption => {
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const red = cssVar(el, '--color-primary', '#dc2626');
      const weekSet = new Set(weekMarks);
      const gridLine = { color: grid };

      return {
        animation: false,
        grid: { left: 36, right: 6, top: 30, bottom: 24 },
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
          splitLine: {
            show: true,
            interval: (idx: number) => weekSet.has(idx),
            lineStyle: gridLine,
          },
          axisLabel: {
            color: faint,
            fontSize: 9,
            hideOverlap: true,
            alignMinLabel: 'left',
            alignMaxLabel: 'right',
            overflow: 'none',
            interval: (idx: number) => idx === 0 || idx === labels.length - 1 || idx % 14 === 0,
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
      aria-label={`Daily active users over ${series.length} days, ranging ${lo} to ${hi}, with a trailing 7-day rolling sum.`}
    />
  );
}

export function ActiveUsersPanel({ series, nowMs }: { series: DailyPoint[]; nowMs: number }) {
  const padded = extendThroughToday(series, nowMs);
  const { daily, weekly } = headerCounts(padded);
  const faint = 'var(--color-muted-foreground)';
  return (
    <Panel
      title="Active users"
      sub={[
        <span key="daily" className="inline-flex items-center gap-1">
          <LegendSwatch color={faint} />
          daily <span className="tabular-nums text-foreground">{daily}</span>
        </span>,
        <span key="weekly" className="inline-flex items-center gap-1">
          <LegendSwatch color="var(--color-primary)" />
          weekly
          {weekly != null && <span className="tabular-nums text-foreground">{weekly}</span>}
        </span>,
      ]}
    >
      <TrendChart series={padded} nowMs={nowMs} />
    </Panel>
  );
}
