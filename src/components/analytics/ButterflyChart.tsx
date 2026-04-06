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
  /** Override the deviation axis right bound */
  fixedDevRight?: number;
  /** Override the auto-computed max count for the count scale */
  fixedMaxCount?: number;
  /** Force count section to use bidirectional layout (2x weight) even if current data is unidirectional */
  forceBidirectionalCount?: boolean;
  /** Callback when a row is tapped/clicked */
  onBarClick?: (label: string) => void;
  /** Currently selected/active label for focus highlight */
  activeLabel?: string | null;
  /** Score mode: count is a float score (can be negative), deviation is raw difference */
  scoreMode?: boolean;
}

export function ButterflyChart({ data, rowHeight = 22, referenceDeviations, hideDeviation, fixedMaxCount, fixedDevRight, onBarClick, activeLabel, scoreMode, forceBidirectionalCount }: ButterflyChartProps) {
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

  // Layout: 3-column system
  // Col A: labels + icons (fixed) | Col B: chart 1 (count/score) | Col C: chart 2 (deviation)
  const hasIcons = data.some(d => d.icon);
  const labelWidth = 42;
  const iconSize = hasIcons ? 14 : 0;
  const iconGap = hasIcons ? 3 : 0;
  const gap = 6;
  const gutter = 8; // space between chart sections
  const titleHeight = 18;
  const topOffset = titleHeight;
  const chartHeight = topOffset + data.length * rowHeight;

  const iconStart = labelWidth + iconGap;

  // Column A: labels + icons (fixed width)
  const labelColEnd = iconStart + iconSize + gap;

  // Determine directionality BEFORE width distribution
  const countHasNeg = scoreMode ? data.some(d => d.count < 0) : false;
  const countHasPos = !scoreMode || data.some(d => d.count > 0);
  const countIsBidirectional = forceBidirectionalCount || (countHasNeg && countHasPos);
  const devIsBidirectional = !hideDeviation; // deviation domain always spans neg-to-pos in practice

  // Weighted width distribution: bidirectional charts get 2x weight
  const chartsWidth = Math.max(0, width - labelColEnd);
  let chart1Width: number, chart2Width: number;
  if (hideDeviation) {
    chart1Width = chartsWidth;
    chart2Width = 0;
  } else {
    const w1 = countIsBidirectional ? 2 : 1;
    const w2 = devIsBidirectional ? 2 : 1;
    const available = chartsWidth - gutter;
    chart1Width = Math.floor(available * w1 / (w1 + w2));
    chart2Width = available - chart1Width;
  }

  const countSectionStart = labelColEnd;
  const devSectionStart = labelColEnd + chart1Width + gutter;

  // Chart 1 (count/score): directionality-aware margins
  const countLabelPad = scoreMode ? 30 : 42; // wider for "25 (16%)" labels
  const countLeftPad = countHasNeg ? countLabelPad : 0;
  const countRightPad = countHasPos ? countLabelPad : 0;
  const countBarArea = Math.max(0, chart1Width - countLeftPad - countRightPad);

  // Scales
  const yScale = scaleBand<string>()
    .domain(data.map((d) => d.label))
    .range([topOffset, topOffset + data.length * rowHeight])
    .padding(0.25);

  const barHeight = yScale.bandwidth();

  // Count scale — zero position proportional to data extents (not fixed 50/50)
  const maxCount = fixedMaxCount ?? Math.max(...data.map((d) => Math.abs(d.count)), scoreMode ? 0.01 : 1);
  const rawMaxNeg = scoreMode ? Math.max(...data.map(d => d.count < 0 ? -d.count : 0), 0) : 0;
  const rawMaxPos = scoreMode ? Math.max(...data.map(d => d.count > 0 ? d.count : 0), 0) : maxCount;
  const countZeroX = (() => {
    if (!scoreMode) return countLeftPad;
    if (countIsBidirectional) {
      // Position zero proportionally so each side gets space matching its max extent
      const negE = Math.max(rawMaxNeg, 0.001);
      const posE = Math.max(rawMaxPos, 0.001);
      return countLeftPad + countBarArea * negE / (negE + posE);
    }
    if (countHasNeg) return countLeftPad + countBarArea;
    return countLeftPad;
  })();
  // For bidirectional: uniform scale across the full bar area (not half)
  const countTotalExtent = countIsBidirectional ? rawMaxNeg + rawMaxPos || 0.01 : maxCount;
  const countScale = scaleLinear().domain([0, countTotalExtent]).range([0, countBarArea]);

  // Chart 2 (deviation): domain uses raw data extents (no tick snapping needed)
  let devLeft: number;
  let devRight_: number;
  if (scoreMode) {
    const maxAbsDev = Math.max(...data.map(d => Math.abs(d.deviation)), 0.1);
    devLeft = -maxAbsDev;
    devRight_ = fixedDevRight ?? maxAbsDev;
  } else {
    const maxOverDev = Math.max(...data.map((d) => d.deviation), 50);
    const maxUnderDev = Math.max(...data.map((d) => -d.deviation), 50);
    devRight_ = fixedDevRight ?? maxOverDev;
    devLeft = -(fixedDevRight ?? maxUnderDev);
  }

  const devLabelPad = scoreMode ? 30 : 24;
  const devHasLeft = devLeft < 0;
  const devHasRight = devRight_ > 0;
  const devLeftPad = devHasLeft ? devLabelPad : 0;
  const devRightPad = devHasRight ? devLabelPad : 0;

  const devScale = scaleLinear()
    .domain([devLeft, devRight_])
    .range([devLeftPad, chart2Width - devRightPad]);

  const zeroX = devScale(0);

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <svg width={width} height={chartHeight} className="overflow-visible">
          {/* Titles — alignment follows actual data directionality */}
          <text
            x={countIsBidirectional
              ? countSectionStart + countZeroX
              : countHasNeg
                ? countSectionStart + chart1Width
                : countSectionStart}
            y={12}
            textAnchor={countIsBidirectional ? 'middle' : countHasNeg ? 'end' : 'start'}
            fontSize={10}
            fontWeight={600}
            fill="var(--color-muted-foreground)"
            letterSpacing="0.05em"
          >
            {scoreMode ? 'SCORE' : 'COUNT'}
          </text>
          {!hideDeviation && (<>
          {/* Deviation guide labels — only render sides that have data */}
          {devHasLeft && (
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
          )}
          {devHasRight && (
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
          )}

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
                    : ((d.deviation / 100) + 1).toFixed(2) + 'x';
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

          {/* Zero lines (on top of bars) */}
          <line
            x1={countSectionStart + countZeroX}
            x2={countSectionStart + countZeroX}
            y1={topOffset}
            y2={topOffset + data.length * rowHeight}
            stroke="var(--color-muted-foreground)"
            strokeWidth={1}
          />
          {!hideDeviation && (
            <line
              x1={devSectionStart + zeroX}
              x2={devSectionStart + zeroX}
              y1={topOffset}
              y2={topOffset + data.length * rowHeight}
              stroke="var(--color-muted-foreground)"
              strokeWidth={1}
            />
          )}
        </svg>
      )}
    </div>
  );
}
