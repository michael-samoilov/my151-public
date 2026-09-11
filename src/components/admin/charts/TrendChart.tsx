import { useECharts, cssVar, tooltipStyle, type EChartsOption } from './useECharts';

interface DailyPoint {
  day: number;
  dau: number;
  rolling7: number;
}

/** Trailing 7-day rolling SUM of the daily series — the "weekly traffic" line,
 *  a weekly-active proxy on ~7× the daily scale, so it rides its own axis. */
function rollingSum(vals: number[], window = 7): number[] {
  return vals.map((_, i) => {
    const from = Math.max(0, i - window + 1);
    return vals.slice(from, i + 1).reduce((a, b) => a + b, 0);
  });
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Hero traffic trend. Two honest layers on a daily interval: the daily count
 * (faint, its own left axis) and a trailing 7-day rolling sum (the accent, its
 * own right axis) that reads as the weekly trend. A translucent ±√n band around
 * the daily line shows expected count noise, so a spike reads as noise or trend.
 */
export function TrendChart({ series }: { series: DailyPoint[] }) {
  const days = series.map((p) => p.day);
  const daily = series.map((p) => p.dau);
  const weekly = rollingSum(daily);
  const labels = days.map(fmtDay);

  const ref = useECharts(
    (el): EChartsOption => {
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const red = cssVar(el, '--color-primary', '#dc2626');

      // Band straddles the daily line: base = daily − √daily (transparent),
      // span = 2·√daily stacked on top with a translucent neutral fill.
      const bandBase = daily.map((d) => d - Math.sqrt(d));
      const bandSpan = daily.map((d) => 2 * Math.sqrt(d));

      return {
        animation: false,
        grid: { left: 34, right: 40, top: 10, bottom: 22 },
        tooltip: {
          ...tooltipStyle(el),
          trigger: 'axis',
          formatter: (params: unknown) => {
            const arr = params as { dataIndex: number }[];
            const i = arr[0]?.dataIndex ?? 0;
            return `${labels[i]}<br/><b>${daily[i]}</b> daily · <b>${weekly[i]}</b> 7-day`;
          },
        },
        xAxis: {
          type: 'category',
          data: labels,
          boundaryGap: false,
          axisLine: { lineStyle: { color: grid } },
          axisTick: { show: false },
          axisLabel: {
            color: faint,
            fontSize: 9,
            interval: (idx: number) => idx === 0 || idx === labels.length - 1 || idx % 14 === 0,
          },
        },
        yAxis: [
          {
            type: 'value',
            min: 0,
            name: 'daily',
            nameTextStyle: { color: faint, fontSize: 9, align: 'left' },
            axisLabel: { color: faint, fontSize: 9 },
            splitLine: { lineStyle: { color: grid } },
          },
          {
            type: 'value',
            min: 0,
            name: '7-day',
            nameTextStyle: { color: red, fontSize: 9, align: 'right' },
            axisLabel: { color: red, fontSize: 9 },
            splitLine: { show: false },
          },
        ],
        series: [
          // Transparent base for the ±√n band (left axis, with the daily line).
          { type: 'line', yAxisIndex: 0, data: bandBase, lineStyle: { opacity: 0 }, stack: 'band', symbol: 'none', silent: true, z: 1 },
          { type: 'line', yAxisIndex: 0, data: bandSpan, lineStyle: { opacity: 0 }, areaStyle: { color: faint, opacity: 0.13 }, stack: 'band', symbol: 'none', silent: true, z: 1 },
          // Daily traffic.
          {
            name: 'daily',
            type: 'line',
            yAxisIndex: 0,
            data: daily,
            lineStyle: { color: faint, width: 1 },
            itemStyle: { color: faint },
            symbol: 'none',
            z: 2,
          },
          // Weekly traffic — the trailing 7-day rolling sum, the accent trend.
          {
            name: '7-day sum',
            type: 'line',
            yAxisIndex: 1,
            data: weekly,
            lineStyle: { color: red, width: 2.4 },
            itemStyle: { color: red },
            symbol: 'none',
            z: 3,
          },
        ],
      };
    },
    [series],
  );

  if (series.length < 2) {
    return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  }

  const lo = Math.min(...daily);
  const hi = Math.max(...daily);
  return (
    <div className="w-full">
      {/* Legend — identity is never color-alone. */}
      <div className="mb-1 flex flex-wrap items-center gap-3 text-[0.65rem]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-3" style={{ backgroundColor: 'var(--color-muted-foreground)' }} /> daily
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-3 bg-primary" /> weekly (7-day sum)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-[1px]" style={{ backgroundColor: 'var(--color-muted-foreground)', opacity: 0.2 }} /> ±√n range
        </span>
      </div>
      <div
        ref={ref}
        className="h-[180px] w-full md:h-[220px]"
        role="img"
        aria-label={`Daily active browsers over ${series.length} days, ranging ${lo} to ${hi}, with a trailing 7-day rolling sum and a plus-or-minus square-root-n band.`}
      />
    </div>
  );
}
