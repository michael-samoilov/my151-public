import { useMemo } from 'react';
import {percentileAxis, quartileGuideSeries} from './quartileGuides';
import { useECharts, cssVar, type EChartsOption } from './useECharts';

interface Curve {
  survival: { t: number; s: number }[];
  n: number;
}

export function BuildDepthChart({
  curve,
  xLabel,
  ariaLabel,
}: {
  curve: Curve;
  xLabel: string;
  ariaLabel: string;
}) {
  const { pts, startCount, endCount, xMin, xMax, quartiles, scrubLabel, build } = useMemo(() => {
    const xMin = curve.n > 0 && (curve.survival.find(p => p.t === 1)?.s ?? 1) < 1 ? 0 : 1;
    const pts = curve.survival
      .filter((p) => p.t >= xMin)
      .map((p) => [p.t, Math.round(p.s * 1000) / 10] as [number, number]);
    const startCount = pts.length ? Math.round((pts[0][1] / 100) * curve.n) : 0;
    const endCount = pts.length ? Math.round((pts[pts.length - 1][1] / 100) * curve.n) : 0;
    const xMax = pts.length ? pts[pts.length - 1][0] : 1;
    const quartiles = [0.25,0.5,0.75].map(percentile => {
      const rank = Math.min(curve.n-1,Math.floor(percentile*curve.n));
      const beyond = curve.survival.find(point => Math.round(curve.n*(1-point.s)) > rank);
      return {percentile,value: beyond ? beyond.t-1 : xMax};
    });
    const scrubLabel = (i: number) => {
      const [size, share] = pts[i];
      const count = Math.round((share / 100) * curve.n);
      return [`≥ ${size} ${xLabel}`, `<b>${share}%</b> still building (${count} of ${curve.n})`];
    };

    const build = (el: HTMLDivElement): EChartsOption => {
      const ink = cssVar(el, '--color-foreground', '#0a0a0a');
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const grid = cssVar(el, '--color-muted', '#f5f5f5');
      const band = cssVar(el, '--color-sink', '#8b8b93');

      return {
        animation: false,
        grid: { left: 34, right: 14, top: 28, bottom: 22 },
        xAxis: {
          type: 'value',
          min: xMin,
          max: xMax,
          axisLine: { lineStyle: { color: grid } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: faint, fontSize: 9 },
        },
        yAxis: percentileAxis(faint),
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
          quartileGuideSeries(quartiles,xMin,xMax,faint,value => `${value} ${xLabel}`,cssVar(el, '--color-card', '#fff')),
        ],
      };
    };
    return { pts, startCount, endCount, xMin, xMax, quartiles, scrubLabel, build };
  }, [curve, xLabel]);
  const ref = useECharts(build, { scrub: { count: pts.length, label: scrubLabel } });

  if (pts.length < 2) return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  return (
    <div
      ref={ref}
      className="h-[200px] w-full md:h-[240px]"
      role="img"
      aria-label={`${ariaLabel}: ${startCount} browsers at ${xMin} ${xLabel} down to ${endCount} at ${xMax}. Quartiles ${quartiles.map(({percentile,value}) => `${percentile*100}p ${value} ${xLabel}`).join(', ')}.`}
    />
  );
}
