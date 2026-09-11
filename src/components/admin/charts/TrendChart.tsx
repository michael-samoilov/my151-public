import { useECharts, cssVar, topTooltip, type EChartsOption } from './useECharts';

interface DailyPoint {
  day: number;
  dau: number;
  rolling7: number;
}

/** Trailing 7-day rolling SUM of the daily series — the weekly-traffic line.
 *  Null until a full 7-day window exists, so the first partial days aren't drawn
 *  as if they were a whole week. */
function rollingSum7(vals: number[]): (number | null)[] {
  return vals.map((_, i) => {
    if (i < 6) return null; // window not yet 7 days wide
    return vals.slice(i - 6, i + 1).reduce((a, b) => a + b, 0);
  });
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Traffic trend on a daily interval: the daily count and its trailing 7-day
 * rolling sum (the weekly line), both on one axis. The tooltip rides the top
 * strip so scrubbing never covers the plotted lines, and the container blocks
 * page scroll so a scrub gesture doesn't drag the page.
 */
export function TrendChart({ series }: { series: DailyPoint[] }) {
  const days = series.map((p) => p.day);
  const daily = series.map((p) => p.dau);
  const weekly = rollingSum7(daily);
  const labels = days.map(fmtDay);

  const ref = useECharts(
    (el): EChartsOption => {
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const red = cssVar(el, '--color-primary', '#dc2626');

      return {
        animation: false,
        grid: { left: 34, right: 12, top: 30, bottom: 22 },
        tooltip: {
          ...topTooltip(el),
          trigger: 'axis',
          formatter: (params: unknown) => {
            const arr = params as { dataIndex: number }[];
            const i = arr[0]?.dataIndex ?? 0;
            const w = weekly[i];
            return `${labels[i]} · <b>${daily[i]}</b> daily${w != null ? ` · <b>${w}</b> 7-day` : ''}`;
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
        yAxis: {
          type: 'value',
          min: 0,
          axisLabel: { color: faint, fontSize: 9 },
          splitLine: { lineStyle: { color: grid } },
        },
        series: [
          {
            name: 'daily',
            type: 'line',
            data: daily,
            lineStyle: { color: faint, width: 1 },
            itemStyle: { color: faint },
            symbol: 'none',
            z: 2,
          },
          {
            name: '7-day sum',
            type: 'line',
            data: weekly,
            lineStyle: { color: red, width: 2.4 },
            itemStyle: { color: red },
            symbol: 'none',
            connectNulls: false,
            z: 3,
          },
        ],
      };
    },
    [series],
    { scrub: true },
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
      </div>
      <div
        ref={ref}
        className="h-[180px] w-full touch-none md:h-[220px]"
        role="img"
        aria-label={`Daily active browsers over ${series.length} days, ranging ${lo} to ${hi}, with a trailing 7-day rolling sum.`}
      />
    </div>
  );
}
