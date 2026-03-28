import { useRef, useEffect, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';

export interface ButterflyRow {
  label: string;
  count: number;
  deviation: number; // percentage, e.g. +100 = double, -50 = half
  color: string;
}

interface ButterflyChartProps {
  data: ButterflyRow[];
  /** Row height in px. Default 22 */
  rowHeight?: number;
}

export function ButterflyChart({ data, rowHeight = 22 }: ButterflyChartProps) {
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

  if (data.length === 0) return null;

  // Layout: fixed pixel widths for label + count, rest for deviation
  const labelWidth = 55;
  const countBarMax = 60;
  const numberWidth = 22;
  const gap = 8;
  const titleHeight = 18;
  const axisHeight = 18;
  const topOffset = titleHeight + axisHeight;
  const chartHeight = topOffset + data.length * rowHeight;

  const countSectionStart = labelWidth + gap;
  const devSectionStart = countSectionStart + countBarMax + numberWidth + gap;
  const devSectionWidth = Math.max(0, width - devSectionStart);

  // Scales
  const yScale = scaleBand<string>()
    .domain(data.map((d) => d.label))
    .range([topOffset, topOffset + data.length * rowHeight])
    .padding(0.25);

  const barHeight = yScale.bandwidth();

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const countScale = scaleLinear().domain([0, maxCount]).range([0, countBarMax]);

  const maxAbsDev = Math.max(...data.map((d) => Math.abs(d.deviation)), 50);
  const devMax = Math.ceil(maxAbsDev / 50) * 50;
  const devScale = scaleLinear()
    .domain([-devMax, devMax])
    .range([0, devSectionWidth]);

  // Deviation ticks at 50% intervals
  const devTicks: number[] = [];
  for (let t = -devMax; t <= devMax; t += 50) devTicks.push(t);

  const zeroX = devScale(0);

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <svg width={width} height={chartHeight} className="overflow-visible">
          {/* Titles */}
          <text
            x={countSectionStart}
            y={12}
            textAnchor="start"
            fontSize={10}
            fontWeight={600}
            fill="var(--color-muted-foreground)"
            letterSpacing="0.05em"
          >
            COUNT
          </text>
          {/* Deviation guide labels anchored to zero line */}
          <text
            x={devSectionStart + zeroX - 5}
            y={12}
            textAnchor="end"
            fontSize={10}
            fontWeight={600}
            fill="var(--color-muted-foreground)"
            letterSpacing="0.05em"
          >
            ← UNDERREPRESENTED
          </text>
          <text
            x={devSectionStart + zeroX + 5}
            y={12}
            textAnchor="start"
            fontSize={10}
            fontWeight={600}
            fill="var(--color-muted-foreground)"
            letterSpacing="0.05em"
          >
            OVERREPRESENTED →
          </text>

          {/* Deviation grid lines (behind bars) */}
          {devTicks.map((t) => (
            <line
              key={`grid-${t}`}
              x1={devSectionStart + devScale(t)}
              x2={devSectionStart + devScale(t)}
              y1={topOffset}
              y2={topOffset + data.length * rowHeight}
              stroke="var(--color-border)"
              strokeDasharray={t === 0 ? undefined : '3 3'}
              strokeWidth={t === 0 ? 1 : 0.5}
              opacity={t === 0 ? 0.8 : 0.5}
            />
          ))}

          {/* Rows */}
          {data.map((d) => {
            const y = yScale(d.label)!;

            // Count bar
            const countBarW = countScale(d.count);

            // Deviation bar
            const devBarX = d.deviation >= 0 ? zeroX : devScale(d.deviation);
            const devBarW = Math.abs(devScale(d.deviation) - zeroX);

            return (
              <g key={d.label}>
                {/* Label */}
                <text
                  x={labelWidth}
                  y={y + barHeight / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="currentColor"
                >
                  {d.label}
                </text>

                {/* Count bar */}
                <rect
                  x={countSectionStart}
                  y={y}
                  width={countBarW}
                  height={barHeight}
                  fill={d.color}
                  opacity={0.85}
                  rx={1}
                />
                {/* Count number */}
                <text
                  x={countSectionStart + countBarW + 3}
                  y={y + barHeight / 2}
                  textAnchor="start"
                  dominantBaseline="middle"
                  fontSize={9}
                  fill="var(--color-muted-foreground)"
                >
                  {d.count}
                </text>

                {/* Deviation bar */}
                <rect
                  x={devSectionStart + devBarX}
                  y={y}
                  width={devBarW}
                  height={barHeight}
                  fill={d.color}
                  opacity={0.85}
                  rx={1}
                />
              </g>
            );
          })}

          {/* Zero line (on top of bars for emphasis) */}
          <line
            x1={devSectionStart + zeroX}
            x2={devSectionStart + zeroX}
            y1={topOffset}
            y2={topOffset + data.length * rowHeight}
            stroke="var(--color-muted-foreground)"
            strokeWidth={1}
          />

          {/* Deviation axis ticks (above bars, below title) */}
          {devTicks.map((t) => {
            const x = devSectionStart + devScale(t);
            return (
              <g key={`tick-${t}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={topOffset - 4}
                  y2={topOffset}
                  stroke="var(--color-muted-foreground)"
                  strokeWidth={0.5}
                />
                <text
                  x={x}
                  y={topOffset - 7}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--color-muted-foreground)"
                >
                  {t > 0 ? `+${t}%` : `${t}%`}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
