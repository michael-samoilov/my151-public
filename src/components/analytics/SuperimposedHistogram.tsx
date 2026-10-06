import { memo, useRef, useEffect, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { histogramMeans } from '@/lib/histogramMeans';

let meanMeasureCanvas: HTMLCanvasElement | undefined;
function measureMean(text:string){
 meanMeasureCanvas ??= document.createElement('canvas');
 const ctx=meanMeasureCanvas.getContext('2d');
 if(!ctx)return text.length*6;
 ctx.font='400 10px "Inter Variable", system-ui, sans-serif';
 return ctx.measureText(text).width;
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
  meanRail?: { yours: number; options: number; labels: { yours: string; options: string; exact: string }; legend: { yours: string; options: string } };
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
  const height = 200 * chartScale * heightScale + (meanRail ? 76 : 0);
  const margin = {
    top: 8,
    right: 12,
    bottom: 24 * chartScale + (meanRail ? 76 : 0),
    left: 40 * chartScale,
  };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;

  const xScale = scaleLinear().domain(xDomain).range([0, plotW]);
  const yScale = scaleLinear().domain([0, yDomain]).range([plotH, 0]);

  const legendWidth=meanRail?Math.min(plotW,Math.max(90,measureMean(meanRail.legend.options)+20,measureMean(meanRail.legend.yours)+20)):0;
  const means = meanRail ? histogramMeans(meanRail.yours, meanRail.options, plotW, xScale, meanRail.labels, measureMean) : [];
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
            {data.map((d) => {
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
            {data.map((d) => {
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
            {onBarClick && data.map((d) => {
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

            {meanRail && <g data-histogram-legend="true" transform={`translate(${Math.max(0,plotW-legendWidth)},6)`}>
              <rect width={legendWidth} height={32} fill="var(--color-background)" opacity={.92}/>
              {[{text:meanRail.legend.options,color:'#94a3b8'},{text:meanRail.legend.yours,color:'#ef4444'}].map((item,index)=><g key={item.text} transform={`translate(4,${index*15+5})`}><rect width={7} height={7} fill={item.color}/><text x={12} y={7} fontSize={10} fill="var(--color-muted-foreground)">{item.text}</text></g>)}
            </g>}
            {means.map(point=><g key={point.color} data-mean-marker={point.exact?'exact':point.color} transform={`translate(0,${plotH+34+point.rail*17})`}>
              {point.rail>0&&<line x1={point.x} x2={point.x} y1={-point.rail*17} y2={0} stroke={point.color} opacity={.5}/>}
              <path d={`M${point.x},-4 L${point.x+4},0 L${point.x},4 L${point.x-4},0 Z`} fill={point.color} stroke={point.exact?'#94a3b8':undefined} strokeWidth={point.exact?2:undefined}/>
              <text x={point.labelX} y={(point.labelRail ?? point.rail)*17-point.rail*17} dominantBaseline="middle" textAnchor={point.anchor} fontSize={10} fill={point.color}>{point.text}</text>
              {point.subtitle&&<text x={point.subtitleX} y={17} dominantBaseline="middle" textAnchor={point.subtitleAnchor} fontSize={10} fill={point.color}>{point.subtitle}</text>}
            </g>)}
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
                  fill="var(--color-muted-foreground)"
                >
                  {t}
                </text>
              </g>
            ))}

            {/* Y axis tick marks + labels */}
            {yTicks.map((t) => (
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
