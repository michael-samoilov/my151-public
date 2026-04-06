import { useRef, useEffect, useState } from 'react';
import { scaleLinear } from 'd3-scale';

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
}

export function SuperimposedHistogram({
  data,
  binSize,
  xDomain,
  xTicks,
  minorXTicks: _minorXTicks,
  yDomain,
  yTicks,
  onBarClick,
  activeBin,
}: SuperimposedHistogramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const height = 200;
  const margin = { top: 8, right: 12, bottom: 24, left: 40 };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;

  const xScale = scaleLinear().domain(xDomain).range([0, plotW]);
  const yScale = scaleLinear().domain([0, yDomain]).range([plotH, 0]);

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
                  className={d.yoursPct > 0 ? 'cursor-pointer hover:fill-[#ef4444] hover:opacity-[0.08]' : ''}
                  onClick={() => { if (d.yoursPct > 0) onBarClick(d.x); }}
                />
              );
            })}

            {/* X axis labels (no tick marks) */}
            {xTicks.map((t) => (
              <text
                key={`xtick-${t}`}
                x={xScale(t)}
                y={plotH + 15}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-muted-foreground)"
              >
                {t}
              </text>
            ))}

            {/* Y axis labels (no tick marks) */}
            {yTicks.map((t) => (
              <text
                key={`ytick-${t}`}
                x={-7}
                y={yScale(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--color-muted-foreground)"
              >
                {t}%
              </text>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
