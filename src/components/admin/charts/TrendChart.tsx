import { useECharts, cssVar, type EChartsOption } from './useECharts';

interface DailyPoint {
  day: number;
  dau: number;
  rolling7: number;
}

interface WeekPoint {
  week: number;
  active: number;
}

/** Roll the daily series into weekly active-browser counts. The trailing-7-day
 *  rolling count sampled at each week's end is a weekly-active proxy from the
 *  data the endpoint already returns — no distinct-per-week field is needed. */
function toWeekly(series: DailyPoint[]): WeekPoint[] {
  const weeks: WeekPoint[] = [];
  for (let i = 6; i < series.length; i += 7) {
    weeks.push({ week: series[i].day, active: series[i].rolling7 });
  }
  // Always include the final (possibly partial) week so the latest point shows.
  const last = series[series.length - 1];
  if (last && (weeks.length === 0 || weeks[weeks.length - 1].week !== last.day)) {
    weeks.push({ week: last.day, active: last.rolling7 });
  }
  return weeks;
}

/** 4-week trailing average — the denoised trend line. */
function trailingAvg(vals: number[], window = 4): (number | null)[] {
  return vals.map((_, i) => {
    if (i < window - 1) return null; // no full window yet
    const slice = vals.slice(i - window + 1, i + 1);
    return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10;
  });
}

const fmtWeek = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * Hero "Active browsers" weekly trend. Three honest layers, matching the
 * reviewed design: the raw weekly count (gray), a 4-week average (red — the one
 * data-movement accent), and a ±√n band that straddles the average, so the
 * envelope shows expected count noise rather than floating above the line.
 */
export function TrendChart({ series }: { series: DailyPoint[] }) {
  const weekly = toWeekly(series);
  const actives = weekly.map((w) => w.active);
  const avg = trailingAvg(actives);
  const labels = weekly.map((w) => fmtWeek(w.week));

  const ref = useECharts(
    (el): EChartsOption => {
      const ink = cssVar(el, '--color-foreground', '#0a0a0a');
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const red = cssVar(el, '--color-primary', '#dc2626');
      const surface = cssVar(el, '--color-card', '#ffffff');

      // Band straddles the average: base = avg − √n (transparent), band = 2·√n
      // stacked on top with a translucent neutral fill. Null where no average.
      const bandBase = avg.map((a, i) => (a == null ? null : a - Math.sqrt(actives[i])));
      const bandSpan = avg.map((a, i) => (a == null ? null : 2 * Math.sqrt(actives[i])));

      return {
        animation: false,
        grid: { left: 30, right: 12, top: 10, bottom: 22 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: ink,
          borderWidth: 0,
          textStyle: { color: surface, fontSize: 11 },
          formatter: (params: unknown) => {
            const arr = params as { dataIndex: number }[];
            const i = arr[0]?.dataIndex ?? 0;
            const a = avg[i];
            return `${labels[i]}<br/><b>${actives[i]}</b> active${a != null ? ` · ${a} avg` : ''}`;
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
            interval: (idx: number) => idx === 0 || idx === labels.length - 1 || idx % 3 === 0,
          },
        },
        yAxis: {
          type: 'value',
          min: 0,
          axisLabel: { color: faint, fontSize: 9 },
          splitLine: { lineStyle: { color: grid } },
        },
        series: [
          // Transparent base for the band.
          {
            type: 'line',
            data: bandBase,
            lineStyle: { opacity: 0 },
            stack: 'band',
            symbol: 'none',
            silent: true,
            z: 1,
          },
          // The band itself — neutral, so red stays the only saturated mark.
          {
            type: 'line',
            data: bandSpan,
            lineStyle: { opacity: 0 },
            areaStyle: { color: faint, opacity: 0.13 },
            stack: 'band',
            symbol: 'none',
            silent: true,
            z: 1,
          },
          // Raw weekly count.
          {
            name: 'actual',
            type: 'line',
            data: actives,
            lineStyle: { color: faint, width: 1.2 },
            itemStyle: { color: faint },
            symbol: 'circle',
            symbolSize: 3,
            z: 2,
          },
          // 4-week average — the data-movement accent.
          {
            name: '4-wk avg',
            type: 'line',
            data: avg,
            lineStyle: { color: red, width: 2.4 },
            itemStyle: { color: red },
            symbol: 'none',
            smooth: false,
            connectNulls: false,
            z: 3,
          },
        ],
      };
    },
    [series],
  );

  if (weekly.length < 2) {
    return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  }

  const lo = Math.min(...actives);
  const hi = Math.max(...actives);
  return (
    <div className="w-full">
      {/* Legend — identity is never color-alone. */}
      <div className="mb-1 flex items-center gap-3 text-[0.65rem]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-3" style={{ backgroundColor: 'var(--color-muted-foreground)' }} /> actual
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-3 bg-primary" /> 4-wk avg
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-3 rounded-[1px]"
            style={{ backgroundColor: 'var(--color-muted-foreground)', opacity: 0.2 }}
          />{' '}
          ±√n range
        </span>
      </div>
      <div
        ref={ref}
        className="h-[180px] w-full md:h-[220px]"
        role="img"
        aria-label={`Weekly active browsers over ${weekly.length} weeks, ranging ${lo} to ${hi}, with a 4-week average and a plus-or-minus square-root-n band.`}
      />
    </div>
  );
}
