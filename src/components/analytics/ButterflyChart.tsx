import { useRef, useEffect, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';

export interface ButterflyRow {
  label: string;
  count: number;
  deviation: number; // percentage, e.g. +100 = double, -50 = half
  color: string;
  /** Optional icon path (e.g. "/types/fire.svg") or inline SVG render function */
  icon?: string | ((x: number, y: number, size: number) => React.ReactNode);
}

interface ButterflyChartProps {
  data: ButterflyRow[];
  /** Row height in px. Default 22 */
  rowHeight?: number;
  /** Optional reference deviations keyed by label (shown as outline markers) */
  referenceDeviations?: Record<string, number>;
  /** Hide the deviation section — count bars use full width */
  hideDeviation?: boolean;
  /** Override the deviation axis right bound (snapped to 50% intervals, capped at 200) */
  fixedDevRight?: number;
  /** Override the auto-computed max count for the count scale */
  fixedMaxCount?: number;
}

export function ButterflyChart({ data, rowHeight = 22, referenceDeviations, hideDeviation, fixedMaxCount, fixedDevRight }: ButterflyChartProps) {
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

  // Layout: fixed pixel widths for label + icon + count, rest for deviation
  const hasIcons = data.some(d => d.icon);
  const labelWidth = 42;
  const iconSize = hasIcons ? 14 : 0;
  const iconGap = hasIcons ? 3 : 0;
  const numberWidth = 22;
  const gap = 6;
  const titleHeight = 18;
  const axisHeight = 18;
  const topOffset = titleHeight + axisHeight;
  const chartHeight = topOffset + data.length * rowHeight;

  const iconStart = labelWidth + iconGap;
  const countSectionStart = iconStart + iconSize + gap;
  const countBarMax = hideDeviation
    ? Math.max(0, width - countSectionStart - numberWidth - gap)
    : 51;
  const devSectionStart = countSectionStart + countBarMax + numberWidth + gap;
  const barLabelPad = 24; // space for "0.0x" labels at bar ends
  const devSectionWidth = Math.max(0, width - devSectionStart);

  // Scales
  const yScale = scaleBand<string>()
    .domain(data.map((d) => d.label))
    .range([topOffset, topOffset + data.length * rowHeight])
    .padding(0.25);

  const barHeight = yScale.bandwidth();

  const maxCount = fixedMaxCount ?? Math.max(...data.map((d) => d.count), 1);
  const countScale = scaleLinear().domain([0, maxCount]).range([0, countBarMax]);

  // Under-representation bottoms out at -100 (0x); over-representation is capped at 200 (3x)
  const DEV_OVER_CAP = 200;
  const maxOverDev = Math.max(...data.map((d) => d.deviation), 50);
  const devRight = fixedDevRight ?? Math.min(Math.ceil(maxOverDev / 50) * 50, DEV_OVER_CAP);
  const devLeft = -100; // 0x — can't go lower
  const devScale = scaleLinear()
    .domain([devLeft, devRight])
    .range([barLabelPad, devSectionWidth - barLabelPad]);

  // Deviation ticks at 50% intervals
  const devTicks: number[] = [];
  for (let t = devLeft; t <= devRight; t += 50) devTicks.push(t);

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
          {!hideDeviation && (<>
          {/* Deviation guide labels anchored to zero line */}
          <text
            x={devSectionStart + zeroX - 5}
            y={6}
            textAnchor="end"
            fontSize={9}
            fontWeight={600}
            fill="var(--color-muted-foreground)"
            letterSpacing="0.05em"
          >
            <tspan x={devSectionStart + zeroX - 5} dy="0">UNDER-</tspan>
            <tspan x={devSectionStart + zeroX - 5} dy="10">← INDEXED</tspan>
          </text>
          <text
            x={devSectionStart + zeroX + 5}
            y={6}
            textAnchor="start"
            fontSize={9}
            fontWeight={600}
            fill="var(--color-muted-foreground)"
            letterSpacing="0.05em"
          >
            <tspan x={devSectionStart + zeroX + 5} dy="0">OVER-</tspan>
            <tspan x={devSectionStart + zeroX + 5} dy="10">INDEXED →</tspan>
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
              strokeWidth={t === 0 ? 1.5 : 0.75}
              opacity={t === 0 ? 1 : 0.5}
            />
          ))}
          </>)}

          {/* Rows */}
          {data.map((d) => {
            const y = yScale(d.label)!;

            // Count bar
            const countBarW = countScale(d.count);

            // Deviation bar — clamp to visible scale
            const clampedDev = Math.max(devLeft, Math.min(devRight, d.deviation));
            const isClipped = d.deviation > devRight || d.deviation < devLeft;
            const clippedBarX = clampedDev >= 0 ? zeroX : devScale(clampedDev);
            const clippedBarW = Math.abs(devScale(clampedDev) - zeroX);

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

                {/* Row icon */}
                {d.icon && (
                  typeof d.icon === 'string' ? (
                    <image
                      href={d.icon}
                      x={iconStart}
                      y={y + barHeight / 2 - iconSize / 2}
                      width={iconSize}
                      height={iconSize}
                    />
                  ) : d.icon(iconStart, y + barHeight / 2 - iconSize / 2, iconSize)
                )}

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

                {!hideDeviation && (<>
                {/* Reference deviation marker (behind user's bar) */}
                {referenceDeviations && d.label in referenceDeviations && (() => {
                  const refDev = referenceDeviations[d.label];
                  const refClamped = Math.max(devLeft, Math.min(devRight, refDev));
                  const refX = refClamped >= 0
                    ? devSectionStart + zeroX
                    : devSectionStart + devScale(refClamped);
                  const refW = Math.abs(devScale(refClamped) - zeroX);
                  if (refW <= 0) return null;
                  return (
                    <rect
                      x={refX} y={y} width={refW} height={barHeight}
                      fill="none" stroke="var(--color-muted-foreground)" strokeWidth={1}
                      strokeDasharray="3 2" opacity={0.5} rx={1}
                    />
                  );
                })()}

                {/* Deviation bar — jagged edge when clipped */}
                {(() => {
                  const bx = devSectionStart + clippedBarX;
                  const bw = clippedBarW;
                  if (bw <= 0) return null;
                  if (!isClipped) {
                    return (
                      <rect x={bx} y={y} width={bw} height={barHeight}
                        fill={d.color} opacity={0.85} rx={1} />
                    );
                  }
                  // Build path with jagged torn edge on the clipped side
                  const teeth = 4;
                  const toothH = barHeight / teeth;
                  const depth = 3;
                  const top = y;
                  const bot = y + barHeight;
                  let p: string;
                  if (d.deviation >= 0) {
                    // Jagged right edge
                    p = `M${bx},${top} L${bx + bw},${top}`;
                    for (let i = 0; i < teeth; i++) {
                      p += ` L${bx + bw - depth},${top + toothH * i + toothH / 2}`;
                      p += ` L${bx + bw},${top + toothH * (i + 1)}`;
                    }
                    p += ` L${bx},${bot} Z`;
                  } else {
                    // Jagged left edge
                    p = `M${bx + bw},${top} L${bx},${top}`;
                    for (let i = 0; i < teeth; i++) {
                      p += ` L${bx + depth},${top + toothH * i + toothH / 2}`;
                      p += ` L${bx},${top + toothH * (i + 1)}`;
                    }
                    p += ` L${bx + bw},${bot} Z`;
                  }
                  return <path d={p} fill={d.color} opacity={0.85} />;
                })()}

                {/* Value label at bar end */}
                {(() => {
                  const val = ((d.deviation / 100) + 1).toFixed(1) + 'x';
                  const barEnd = devSectionStart + devScale(Math.max(devLeft, Math.min(devRight, d.deviation)));
                  if (d.deviation >= 0) {
                    return (
                      <text
                        x={barEnd + 3} y={y + barHeight / 2}
                        textAnchor="start" dominantBaseline="middle"
                        fontSize={9} fill="var(--color-muted-foreground)"
                      >{val}</text>
                    );
                  }
                  return (
                    <text
                      x={barEnd - 3} y={y + barHeight / 2}
                      textAnchor="end" dominantBaseline="middle"
                      fontSize={9} fill="var(--color-muted-foreground)"
                    >{val}</text>
                  );
                })()}
                </>)}
              </g>
            );
          })}

          {!hideDeviation && (<>
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
                  {t / 100 + 1}x
                </text>
              </g>
            );
          })}
          </>)}
        </svg>
      )}
    </div>
  );
}
