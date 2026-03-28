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
  /** Fraction of width for the count (left) section. Default 0.25 */
  countWidth?: number;
  /** Row height in px. Default 22 */
  rowHeight?: number;
}

export function ButterflyChart({ data, countWidth = 0.25, rowHeight = 22 }: ButterflyChartProps) {
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

  // Layout constants
  const labelWidth = 60;
  const gap = 6;
  const marginBottom = 22; // space for x-axis ticks on deviation side
  const chartHeight = data.length * rowHeight + marginBottom;

  // Scales
  const yScale = scaleBand<string>()
    .domain(data.map((d) => d.label))
    .range([0, data.length * rowHeight])
    .padding(0.25);

  const barHeight = yScale.bandwidth();

  // Count section: from labelWidth to countSectionEnd
  const countSectionStart = labelWidth + gap;
  const countSectionEnd = width * countWidth;
  const countBarMaxWidth = Math.max(0, countSectionEnd - countSectionStart - 20); // leave room for number
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const countScale = scaleLinear().domain([0, maxCount]).range([0, countBarMaxWidth]);

  // Deviation section: from devSectionStart to width
  const devSectionStart = countSectionEnd + gap;
  const devSectionWidth = Math.max(0, width - devSectionStart);

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
          {/* Deviation grid lines (behind bars) */}
          {devTicks.map((t) => (
            <line
              key={`grid-${t}`}
              x1={devSectionStart + devScale(t)}
              x2={devSectionStart + devScale(t)}
              y1={0}
              y2={data.length * rowHeight}
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
            y1={0}
            y2={data.length * rowHeight}
            stroke="var(--color-muted-foreground)"
            strokeWidth={1}
          />

          {/* Deviation axis ticks */}
          {devTicks.map((t) => {
            const x = devSectionStart + devScale(t);
            return (
              <g key={`tick-${t}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={data.length * rowHeight}
                  y2={data.length * rowHeight + 4}
                  stroke="var(--color-muted-foreground)"
                  strokeWidth={0.5}
                />
                <text
                  x={x}
                  y={data.length * rowHeight + 14}
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
