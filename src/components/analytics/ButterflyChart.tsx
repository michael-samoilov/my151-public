import { useRef, useEffect, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';

export interface ButterflyRow {
  label: string;
  count: number;
  deviation: number; // percentage, e.g. +100 = double, -50 = half (or raw diff in scoreMode)
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
  /** Callback when a row is tapped/clicked */
  onBarClick?: (label: string) => void;
  /** Currently selected/active label for focus highlight */
  activeLabel?: string | null;
  /** Score mode: count is a float score (can be negative), deviation is raw difference */
  scoreMode?: boolean;
}

export function ButterflyChart({ data, rowHeight = 22, referenceDeviations, hideDeviation, fixedMaxCount, fixedDevRight, onBarClick, activeLabel, scoreMode }: ButterflyChartProps) {
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

  const countTotal = data.reduce((s, d) => s + d.count, 0);

  // Layout: fixed pixel widths for label + icon + count, rest for deviation
  const hasIcons = data.some(d => d.icon);
  const labelWidth = 42;
  const iconSize = hasIcons ? 14 : 0;
  const iconGap = hasIcons ? 3 : 0;
  const numberWidth = 42;
  const gap = 6;
  const titleHeight = 18;
  const axisHeight = 18;
  const topOffset = titleHeight + axisHeight;
  const chartHeight = topOffset + data.length * rowHeight;

  const iconStart = labelWidth + iconGap;
  const scoreLeftPad = scoreMode ? numberWidth : 0; // space for negative bar labels
  const countSectionStart = iconStart + iconSize + gap + scoreLeftPad;
  const countBarMax = hideDeviation
    ? Math.max(0, width - countSectionStart - numberWidth - gap)
    : 51;
  const devSectionStart = countSectionStart + countBarMax + numberWidth + gap;
  const barLabelPad = 24; // space for labels at bar ends
  const devSectionWidth = Math.max(0, width - devSectionStart);

  // Scales
  const yScale = scaleBand<string>()
    .domain(data.map((d) => d.label))
    .range([topOffset, topOffset + data.length * rowHeight])
    .padding(0.25);

  const barHeight = yScale.bandwidth();

  // Count scale — in scoreMode, center at 0; otherwise start at 0
  const maxCount = fixedMaxCount ?? Math.max(...data.map((d) => Math.abs(d.count)), scoreMode ? 0.01 : 1);
  const countScale = scoreMode
    ? scaleLinear().domain([0, maxCount]).range([0, countBarMax / 2])
    : scaleLinear().domain([0, maxCount]).range([0, countBarMax]);
  const countZeroX = scoreMode ? countBarMax / 2 : 0;

  // Deviation scale
  let devLeft: number;
  let devRight_: number;
  let devTickInterval: number;
  if (scoreMode) {
    // Symmetric around 0, auto-scale to data range
    const maxAbsDev = Math.max(...data.map(d => Math.abs(d.deviation)), 0.1);
    // Snap to nice intervals: 0.1, 0.2, 0.5, 1.0
    const niceIntervals = [0.05, 0.1, 0.2, 0.5, 1.0, 2.0];
    const rawInterval = maxAbsDev / 3;
    devTickInterval = niceIntervals.find(n => n >= rawInterval) ?? 2.0;
    const bound = Math.ceil(maxAbsDev / devTickInterval) * devTickInterval;
    devLeft = -bound;
    devRight_ = fixedDevRight ?? bound;
  } else {
    const DEV_OVER_CAP = 200;
    const maxOverDev = Math.max(...data.map((d) => d.deviation), 50);
    devRight_ = fixedDevRight ?? Math.min(Math.ceil(maxOverDev / 50) * 50, DEV_OVER_CAP);
    devLeft = -100; // 0x — can't go lower
    devTickInterval = 50;
  }
  const devScale = scaleLinear()
    .domain([devLeft, devRight_])
    .range([barLabelPad, devSectionWidth - barLabelPad]);

  // Deviation ticks
  const devTicks: number[] = [];
  for (let t = devLeft; t <= devRight_ + devTickInterval * 0.01; t += devTickInterval) {
    devTicks.push(Math.round(t * 1000) / 1000); // avoid float drift
  }

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
            {scoreMode ? 'SCORE' : 'COUNT'}
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
            <tspan x={devSectionStart + zeroX - 5} dy="0">{scoreMode ? 'WEAKER' : 'UNDER-'}</tspan>
            <tspan x={devSectionStart + zeroX - 5} dy="10">{scoreMode ? '← HERE' : '← INDEXED'}</tspan>
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
            <tspan x={devSectionStart + zeroX + 5} dy="0">{scoreMode ? 'STRONGER' : 'OVER-'}</tspan>
            <tspan x={devSectionStart + zeroX + 5} dy="10">{scoreMode ? 'HERE →' : 'INDEXED →'}</tspan>
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
          {data.map((d, rowIdx) => {
            const y = yScale(d.label)!;

            // Count bar — in scoreMode, bars extend from center
            const countBarW = scoreMode
              ? countScale(Math.abs(d.count))
              : countScale(d.count);
            const countBarX = scoreMode
              ? (d.count >= 0 ? countSectionStart + countZeroX : countSectionStart + countZeroX - countBarW)
              : countSectionStart;

            // Deviation bar — clamp to visible scale
            const clampedDev = Math.max(devLeft, Math.min(devRight_, d.deviation));
            const isClipped = d.deviation > devRight_ || d.deviation < devLeft;
            const clippedBarX = clampedDev >= 0 ? zeroX : devScale(clampedDev);
            const clippedBarW = Math.abs(devScale(clampedDev) - zeroX);

            const isActive = activeLabel === d.label;

            // Highlight extends to midpoints between this row and neighbors
            const prevBottom = rowIdx > 0 ? yScale(data[rowIdx - 1].label)! + barHeight : topOffset;
            const nextTop = rowIdx < data.length - 1 ? yScale(data[rowIdx + 1].label)! : topOffset + data.length * rowHeight;
            const highlightY = (prevBottom + y) / 2;
            const highlightH = ((y + barHeight + nextTop) / 2) - highlightY;

            return (
              <g key={d.label} className={onBarClick ? 'cursor-pointer' : ''} onClick={onBarClick ? () => onBarClick(d.label) : undefined}>
                {/* Full-row hit target + active highlight */}
                <rect
                  x={0} y={highlightY} width={width} height={highlightH}
                  fill={isActive ? d.color : 'transparent'}
                  opacity={isActive ? 0.12 : 1}
                  className={!isActive && onBarClick ? 'hover:fill-current hover:opacity-[0.04] active:opacity-[0.08]' : ''}
                />
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
                  x={countBarX}
                  y={y}
                  width={countBarW}
                  height={barHeight}
                  fill={d.color}
                  opacity={0.85}
                  rx={1}
                />
                {/* Score mode: center line for count column */}
                {scoreMode && rowIdx === 0 && (
                  <line
                    x1={countSectionStart + countZeroX}
                    x2={countSectionStart + countZeroX}
                    y1={topOffset}
                    y2={topOffset + data.length * rowHeight}
                    stroke="var(--color-border)"
                    strokeWidth={0.75}
                  />
                )}
                {/* Count/score number */}
                <text
                  x={scoreMode
                    ? (d.count >= 0 ? countBarX + countBarW + 3 : countBarX - 3)
                    : countSectionStart + countBarW + 3}
                  y={y + barHeight / 2}
                  textAnchor={scoreMode && d.count < 0 ? 'end' : 'start'}
                  dominantBaseline="middle"
                  fontSize={9}
                  fill="var(--color-muted-foreground)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {scoreMode
                    ? (d.count >= 0 ? '+' : '') + d.count.toFixed(2)
                    : `${d.count} (${countTotal > 0 ? ((d.count / countTotal) * 100).toFixed(0) : 0}%)`
                  }
                </text>

                {!hideDeviation && (<>
                {/* Reference deviation marker (behind user's bar) */}
                {referenceDeviations && d.label in referenceDeviations && (() => {
                  const refDev = referenceDeviations[d.label];
                  const refClamped = Math.max(devLeft, Math.min(devRight_, refDev));
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
                  const val = scoreMode
                    ? (d.deviation >= 0 ? '+' : '') + d.deviation.toFixed(2)
                    : ((d.deviation / 100) + 1).toFixed(1) + 'x';
                  const barEnd = devSectionStart + devScale(Math.max(devLeft, Math.min(devRight_, d.deviation)));
                  if (d.deviation >= 0) {
                    return (
                      <text
                        x={barEnd + 3} y={y + barHeight / 2}
                        textAnchor="start" dominantBaseline="middle"
                        fontSize={9} fill="var(--color-muted-foreground)"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >{val}</text>
                    );
                  }
                  return (
                    <text
                      x={barEnd - 3} y={y + barHeight / 2}
                      textAnchor="end" dominantBaseline="middle"
                      fontSize={9} fill="var(--color-muted-foreground)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
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
                  {scoreMode
                    ? (t >= 0 ? '+' : '') + (Number.isInteger(t) ? t.toFixed(0) : t.toFixed(1))
                    : t / 100 + 1 + 'x'
                  }
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
