import { useECharts, cssVar, tooltipStyle, type EChartsOption } from './useECharts';

interface Curve {
  survival: { t: number; s: number }[];
  n: number;
}

/**
 * Build-depth survival as an un-smoothed step curve: how many browsers are
 * still building at each dex size (or evolution-line count). `s` is the
 * surviving fraction and `n` the base, so the plotted value is a real browser
 * count (n at size 1 down to the completers at the far right). Endpoints are
 * labeled; the geometry carries the rest. Neutral ink — no false accents.
 */
export function BuildDepthChart({
  curve,
  xLabel,
  ariaLabel,
}: {
  curve: Curve;
  xLabel: string;
  ariaLabel: string;
}) {
  // Plot the surviving share as a percentage of the base, so the y-axis reads
  // in %. The raw count stays available (share × n) for the tooltip.
  const pts = curve.survival
    .filter((p) => p.t >= 1)
    .map((p) => [p.t, Math.round(p.s * 1000) / 10] as [number, number]);
  const startCount = pts.length ? Math.round((pts[0][1] / 100) * curve.n) : 0;
  const endCount = pts.length ? Math.round((pts[pts.length - 1][1] / 100) * curve.n) : 0;
  const xMax = pts.length ? pts[pts.length - 1][0] : 1;

  const ref = useECharts(
    (el): EChartsOption => {
      const ink = cssVar(el, '--color-foreground', '#0a0a0a');
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const band = cssVar(el, '--color-sink', '#8b8b93');

      return {
        animation: false,
        grid: { left: 34, right: 14, top: 12, bottom: 22 },
        tooltip: {
          ...tooltipStyle(el),
          trigger: 'axis',
          formatter: (params: unknown) => {
            const arr = params as { data: [number, number] }[];
            const d = arr[0]?.data;
            if (!d) return '';
            const count = Math.round((d[1] / 100) * curve.n);
            return `≥ ${d[0]} ${xLabel}<br/><b>${d[1]}%</b> still building (${count} of ${curve.n})`;
          },
        },
        xAxis: {
          type: 'value',
          min: 1,
          max: xMax,
          axisLine: { lineStyle: { color: grid } },
          axisTick: { show: false },
          // No vertical gridlines — the step curve carries the x reading.
          splitLine: { show: false },
          axisLabel: { color: faint, fontSize: 9 },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: 100,
          // No horizontal gridlines; the axis labels alone place the level.
          splitLine: { show: false },
          axisLabel: { color: faint, fontSize: 9, formatter: '{value}%' },
        },
        series: [
          {
            type: 'line',
            data: pts,
            step: 'end',
            smooth: false,
            symbol: 'none',
            lineStyle: { color: ink, width: 2 },
            itemStyle: { color: ink },
            areaStyle: { color: band, opacity: 0.1 },
            label: {
              show: true,
              position: 'top',
              color: ink,
              fontSize: 9,
              fontWeight: 700,
              formatter: (o: { dataIndex: number; data: [number, number] }) =>
                o.dataIndex === pts.length - 1 ? `${o.data[1]}%` : '',
            },
          },
        ],
      };
    },
    [curve, xLabel],
  );

  if (pts.length < 2) return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  return (
    <div
      ref={ref}
      className="h-[200px] w-full md:h-[240px]"
      role="img"
      aria-label={`${ariaLabel}: ${startCount} browsers at 1 ${xLabel} down to ${endCount} at ${xMax}.`}
    />
  );
}
