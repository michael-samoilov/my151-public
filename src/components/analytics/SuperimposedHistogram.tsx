import { memo, useRef, useEffect, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { histogramMeans, histogramMeanLayout } from '@/lib/histogramMeans';

let meanMeasureCanvas: HTMLCanvasElement | undefined;
function measureMean(text: string, bold = false, middle = false) {
 meanMeasureCanvas ??= document.createElement('canvas');
 const ctx = meanMeasureCanvas.getContext('2d')!;
 ctx.font = `${bold ? 700 : 400} 10px "Inter Variable", system-ui, sans-serif`;
 ctx.textAlign = 'left'; ctx.textBaseline = middle ? 'middle' : 'alphabetic';
 const m = ctx.measureText(text);
 return { width: m.width, left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
}
interface HistogramBin {
  x: number;
  nationalPct: number;
  yoursPct: number;
}

interface SuperimposedHistogramProps {
  data: HistogramBin[];
  binSize: number;
  xDomain: [number, number];
  xTicks: number[];
  minorXTicks?: number[];
  yDomain: number;
  yTicks: number[];
  onBarClick?: (binCenter: number) => void;
  activeBin?: number | null;
  /** Multiplier on the plot height (default 1) to tune vertical space vs. peers. */
  heightScale?: number;
  /** Overrides the font-size class on the axis tick labels (default text-xs). */
  textClass?: string;
  meanRail?: { yours: number; options: number; labels: { yours: string; options: string; exact: string } };
}

function SuperimposedHistogramImpl({
  data,
  binSize,
  xDomain,
  xTicks,
  minorXTicks: _minorXTicks,
  yDomain,
  yTicks,
  onBarClick,
  activeBin,
  heightScale = 1,
  textClass,
  meanRail,
}: SuperimposedHistogramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // Ignore sub-0.5px jitter so observer echoes don't re-render the
      // whole chart during an interaction (same guard as MilestoneBar).
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Chart geometry scales with container width so histograms grow on
  // desktop dashboards instead of staying pinned at the mobile ~200px
  // height. chartScale matches the formula in ButterflyChart — 1 at
  // mobile, 2 at desktop — so both analytics charts scale consistently.
  const chartScale = width > 0 ? Math.max(1, Math.min(width / 360, 2)) : 1;
  const baseHeight = 200 * chartScale * heightScale;
  const margin = {
    top: 8,
    right: 12,
    bottom: 24 * chartScale,
    left: 40 * chartScale,
  };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = baseHeight - margin.top - margin.bottom;

  const xScale = scaleLinear().domain(xDomain).range([0, plotW]);
  const visibleData = meanRail ? data.filter(bin => bin.x >= xDomain[0] && bin.x < xDomain[1]) : data;
  const yScale = scaleLinear().domain([0, yDomain]).range([plotH, 0]);
  const means = meanRail ? histogramMeans(meanRail.yours, meanRail.options, plotW, xScale, meanRail.labels, measureMean,
    { left: -margin.left + 4, right: plotW + margin.right - 4 }) : [];
  const meanLayout = histogramMeanLayout(means, xTicks, xScale, measureMean);
  const height = meanRail ? margin.top + plotH + meanLayout.bottom : baseHeight;
  const yTickStep = meanRail ? Math.max(1, Math.ceil(14 / Math.max(1, plotH / Math.max(1, yTicks.length - 1)))) : 1;
  const visibleYTicks=yTicks.filter((_,index)=>index%yTickStep===0 || index===yTicks.length-1);
  const barFullWidth = xScale(binSize) - xScale(0);
  const barNarrowWidth = barFullWidth * 0.5;

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <svg width={width} height={height}>
          <g transform={`translate(${margin.left},${margin.top})`}>
            {/* Baseline (x-axis) */}
            <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke="var(--color-muted-foreground)" strokeWidth={1} />

            {/* National bars (full width, behind) */}
            {visibleData.map((d) => {
              const barX = xScale(d.x - binSize / 2);
              const barH = plotH - yScale(d.nationalPct);
              if (barH <= 0) return null;
              return (
                <rect
                  key={`nat-${d.x}`}
                  x={barX}
                  y={yScale(d.nationalPct)}
                  width={barFullWidth}
                  height={barH}
                  fill="#94a3b8"
                  opacity={0.45}
                  rx={1}
                />
              );
            })}

            {/* Yours bars (narrower, in front) */}
            {visibleData.map((d) => {
              const barX = xScale(d.x - binSize / 2) + (barFullWidth - barNarrowWidth) / 2;
              const barH = plotH - yScale(d.yoursPct);
              if (barH <= 0) return null;
              return (
                <rect
                  key={`yours-${d.x}`}
                  x={barX}
                  y={yScale(d.yoursPct)}
                  width={barNarrowWidth}
                  height={barH}
                  fill="#ef4444"
                  opacity={0.85}
                  rx={1}
                />
              );
            })}

            {/* Clickable hit targets per bin (full height, full bin width) */}
            {onBarClick && visibleData.map((d) => {
              const barX = xScale(d.x - binSize / 2);
              const isActive = activeBin === d.x;
              return (
                <rect
                  key={`hit-${d.x}`}
                  x={barX}
                  y={0}
                  width={barFullWidth}
                  height={plotH}
                  fill={isActive ? '#ef4444' : 'transparent'}
                  opacity={isActive ? 0.12 : 0}
                  role={d.yoursPct>0?'button':undefined} tabIndex={d.yoursPct>0?0:undefined} aria-label={`${d.x-binSize/2}–${d.x+binSize/2}`} onKeyDown={event=>{if(d.yoursPct>0&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onBarClick(d.x);}}}
                  className={d.yoursPct > 0 ? 'cursor-pointer hover:fill-[#ef4444] hover:opacity-[0.08]' : ''}
                  onClick={() => { if (d.yoursPct > 0) onBarClick(d.x); }}
                />
              );
            })}

            {/* X axis tick marks + labels */}
            {xTicks.map((t) => (
              <g key={`xtick-${t}`}>
                <line
                  x1={xScale(t)} x2={xScale(t)}
                  y1={plotH} y2={plotH + 4}
                  stroke="var(--color-muted-foreground)"
                  strokeWidth={1}
                />
                <text
                  x={xScale(t)}
                  y={plotH + 15}
                  textAnchor="middle"
                  className={textClass ?? 'text-xs'}
                  style={meanRail ? { fontSize: 10 } : undefined}
                  fill="var(--color-muted-foreground)"
                >
                  {t}
                </text>
              </g>
            ))}

            {meanLayout.points.map(point => <g key={point.color}>
              <g data-mean-stem={point.color}>{point.segments.map(([start, end], index) => <line key={index} x1={point.x} x2={point.x} y1={plotH + start} y2={plotH + end} stroke={point.color} strokeWidth={1}/>)}</g>
              <g data-mean-marker={point.exact ? 'exact' : point.color} transform={`translate(0,${plotH + meanLayout.rail})`}>
                <path d={`M${point.x},-4 L${point.x+4},0 L${point.x},4 L${point.x-4},0 Z`} fill={point.color} stroke={point.exact ? '#94a3b8' : undefined} strokeWidth={point.exact ? 2 : undefined}/>
                <text x={point.labelX} y={point.labelRail * 17} dominantBaseline="middle" textAnchor={point.anchor} fontSize={10} fill={point.color}>
                  {point.runs.map((run, index) => <tspan key={index} data-mean-number={run.bold ? 'true' : undefined} fontWeight={run.bold ? 700 : 400}>{run.text}</tspan>)}
                </text>
              </g>
            </g>)}
            {/* Y axis tick marks + labels */}
            {visibleYTicks.map((t) => (
              <g key={`ytick-${t}`}>
                <line
                  x1={-4} x2={0}
                  y1={yScale(t)} y2={yScale(t)}
                  stroke="var(--color-muted-foreground)"
                  strokeWidth={1}
                />
                <text
                  x={-7}
                  y={yScale(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className={textClass ?? 'text-xs'}
                  style={meanRail ? { fontSize: 10 } : undefined}
                  fill="var(--color-muted-foreground)"
                >
                  {t}%
                </text>
              </g>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}

/** Memoized for the same reason as ButterflyChart — see that file. */
export const SuperimposedHistogram = memo(SuperimposedHistogramImpl);
