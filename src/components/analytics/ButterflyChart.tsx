import { memo, useRef, useEffect, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { rowKey, type ButterflyRow } from './butterflyRow';
import { butterflyColumns } from '@/lib/butterflyLayout';

export type { ButterflyRow };

interface ButterflyChartProps {
  alignBaselines?: boolean;
  fixedIndexDomain?: number;
  data: ButterflyRow[];
  rowHeight?: number;
  referenceDeviations?: Record<string, number>;
  hideDeviation?: boolean;
  fixedDevRight?: number;
  fixedMaxCount?: number;
  forceBidirectionalCount?: boolean;
  onBarClick?: (key: string) => void;
  activeKey?: string | null;
  scoreMode?: boolean;
  sortBy?: 'count' | 'deviation' | 'label';
  onSortChange?: (col: 'count' | 'deviation' | 'label') => void;
  labelHeader?: string;
  hideLabelText?: boolean;
  iconColAspect?: number;
  heightScale?: number;
  iconFillsRow?: boolean;
  labelSortable?: boolean;
  labelWidthBase?: number;
  iconScale?: number;
  disableEmptyRows?: boolean;
  textClass?: string;
}

let countMeasureCanvas: HTMLCanvasElement | undefined;
function countLabelPadding(data: ButterflyRow[], textClass: string | undefined): number {
  countMeasureCanvas ??= document.createElement('canvas');
  const ctx = countMeasureCanvas.getContext('2d');
  const size = textClass?.match(/text-\[([\d.]+)(rem|px)\]/);
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const fontSize = size ? Number(size[1]) * (size[2] === 'rem' ? rootPx : 1) : textClass === 'text-xs' ? rootPx * .75 : rootPx * .6875;
  if (!ctx) return (Math.max(1, ...data.map(row => String(row.count).length)) * fontSize * .65 + 6);
  ctx.font = `400 ${fontSize}px 'Inter Variable', system-ui, sans-serif`;
  return (Math.max(0, ...data.map(row => ctx.measureText(String(row.count)).width)) + 6);
}

function ButterflyChartImpl({ alignBaselines = false, fixedIndexDomain, data, rowHeight: rowHeightProp, referenceDeviations, hideDeviation, fixedMaxCount, fixedDevRight, onBarClick, activeKey, scoreMode, forceBidirectionalCount, sortBy, onSortChange, disableEmptyRows, labelHeader, labelSortable, labelWidthBase = 42, iconScale = 1, hideLabelText, iconColAspect = 1, heightScale = 1, iconFillsRow = false, textClass }: ButterflyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (data.length === 0) return null;

  const hasIcons = data.some(d => d.icon);
  const chartScale = width > 0 ? Math.max(1, Math.min(width / 360, 2)) : 1;
  const iconSize = hasIcons ? 14 * chartScale * iconScale : 0;
  const labelWidth = hideLabelText ? 0 : labelWidthBase * chartScale;
  const iconGap = hasIcons && !hideLabelText ? 3 : 0;
  const gap = 6;
  const gutter = 8;

  const titleHeight = 28;
  const topOffset = titleHeight;
  const headerBaseline = topOffset - 8;
  const columns = butterflyColumns(width, chartScale, hideDeviation, !!scoreMode);
  const rowHeight = Math.max((rowHeightProp ?? 22) * chartScale * heightScale, alignBaselines ? columns.identifierWidth / 5 + 4 : iconSize + 4);
  const chartHeight = topOffset + data.length * rowHeight;

  const iconBoxH = hasIcons ? (alignBaselines ? columns.identifierWidth / 5 : iconFillsRow ? rowHeight : iconSize) : 0;
  const iconColW = alignBaselines ? columns.identifierWidth : iconBoxH * iconColAspect;

  const iconStart = hideLabelText ? 0 : labelWidth + iconGap;

  const labelColEnd = alignBaselines ? columns.countStart : iconStart + iconColW + gap;

  const countHasNeg = scoreMode ? data.some(d => d.count < 0) : false;
  const countHasPos = !scoreMode || data.some(d => d.count > 0);
  const countIsBidirectional = forceBidirectionalCount || (countHasNeg && countHasPos);
  const devIsBidirectional = !hideDeviation;

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

  if (alignBaselines) { chart1Width = columns.countWidth; chart2Width = columns.indexWidth; }
  const countSectionStart = labelColEnd;
  const devSectionStart = alignBaselines ? columns.indexStart : labelColEnd + chart1Width + gutter;

  const countLabelPad = scoreMode ? 32 * chartScale : countLabelPadding(data, textClass);
  const countLeftPad = countHasNeg ? countLabelPad : 0;
  const countRightPad = countHasPos ? countLabelPad : 0;
  const countBarArea = Math.max(0, chart1Width - countLeftPad - countRightPad);

  const yScale = scaleBand<string>()
    .domain(data.map((d) => d.label))
    .range([topOffset, topOffset + data.length * rowHeight])
    .padding(0.25);

  const barHeight = yScale.bandwidth();

  const maxCount = fixedMaxCount ?? Math.max(...data.map((d) => Math.abs(d.count)), scoreMode ? 0.01 : 1);
  const rawMaxNeg = scoreMode ? Math.max(...data.map(d => d.count < 0 ? -d.count : 0), 0) : 0;
  const rawMaxPos = scoreMode ? Math.max(...data.map(d => d.count > 0 ? d.count : 0), 0) : maxCount;

  const maxNegDev = scoreMode ? Math.max(...data.map(d => d.deviation < 0 ? -d.deviation : 0), 0) : 0;
  const maxPosDev = scoreMode ? Math.max(...data.map(d => d.deviation > 0 ? d.deviation : 0), 0) : 0;

  const countZeroX = (() => {
    if (alignBaselines && scoreMode && countIsBidirectional) return countLeftPad + countBarArea / 2;
    if (!scoreMode) return countLeftPad;
    if (countIsBidirectional) {
      const total = (rawMaxNeg + rawMaxPos) || 0.01;
      return countLeftPad + countBarArea * rawMaxNeg / total;
    }
    if (countHasNeg) return countLeftPad + countBarArea;
    return countLeftPad;
  })();
  const countTotalExtent = countIsBidirectional
    ? (alignBaselines ? Math.max(rawMaxNeg, rawMaxPos) * 2 : rawMaxNeg + rawMaxPos) || 0.01
    : maxCount;
  const countScale = scaleLinear().domain([0, countTotalExtent]).range([0, countBarArea]);

  let devLeftRaw: number;
  let devRightRaw: number;
  if (scoreMode) {
    devLeftRaw = Math.max(maxNegDev, 0.001);
    devRightRaw = Math.max(maxPosDev, 0.001);
  } else {
    const maxUnderDev = Math.max(...data.map((d) => -d.deviation), 0);
    const DEV_OVER_CAP = 200;
    const maxOverDev = Math.max(...data.map((d) => d.deviation), 0);
    devLeftRaw = Math.min(Math.max(maxUnderDev, 25), DEV_OVER_CAP);
    devRightRaw = Math.min(Math.max(fixedDevRight ?? maxOverDev, 25), DEV_OVER_CAP);
  }
  const labelPx = (scoreMode ? 60 : 66) * chartScale;
  const barPad = 32 * chartScale;
  const usableW = Math.max(0, chart2Width - 2 * barPad);
  const minSideFrac = usableW > 0
    ? Math.min(0.48, Math.max(0, (labelPx - barPad + 2) / usableW))
    : 0;
  let dl = devLeftRaw;
  let dr = devRightRaw;
  const dTotal = dl + dr;
  if (dTotal > 0 && minSideFrac > 0) {
    if (dl / dTotal < minSideFrac) dl = dr * minSideFrac / (1 - minSideFrac);
    if (dr / dTotal < minSideFrac) dr = dl * minSideFrac / (1 - minSideFrac);
  }
  if (fixedIndexDomain !== undefined) dl = dr = fixedIndexDomain;
  else if (alignBaselines) dl = dr = Math.max(dl, dr);
  const devLeft = -dl;
  const devRight_ = dr;

  const devHasLeft = devLeft < 0;
  const devHasRight = devRight_ > 0;

  const devScale = scaleLinear()
    .domain([devLeft, devRight_])
    .range([barPad, chart2Width - barPad]);

  const zeroX = devScale(0);

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <svg width={width} height={chartHeight} className="overflow-visible" data-index-domain={hideDeviation ? undefined : `${devLeft},${devRight_}`} data-count-baseline={countSectionStart + countZeroX} data-index-baseline={hideDeviation ? undefined : devSectionStart + zeroX}>
          {labelHeader && (
            <text
              x={hideLabelText ? iconStart + iconColW / 2 : iconStart + iconSize}
              y={headerBaseline}
              textAnchor={hideLabelText ? 'middle' : 'end'}
              fontWeight={600}
              fill={labelSortable && sortBy === 'label' ? 'var(--color-destructive)' : 'var(--color-muted-foreground)'}
              letterSpacing="0.05em"
              className={cn(textClass ?? 'text-xs', labelSortable && onSortChange && 'cursor-pointer hover:underline')}
              textDecoration={labelSortable && sortBy === 'label' ? 'underline' : 'none'}
              onClick={labelSortable && onSortChange ? () => onSortChange('label') : undefined}
            >
              {labelHeader}
            </text>
          )}
          <text
            x={countIsBidirectional
              ? countSectionStart + countZeroX
              : countHasNeg
                ? countSectionStart + chart1Width
                : countSectionStart}
            y={headerBaseline}
            textAnchor={countIsBidirectional ? 'middle' : countHasNeg ? 'end' : 'start'}
            fontWeight={600}
            fill={sortBy === 'count' ? 'var(--color-destructive)' : 'var(--color-muted-foreground)'}
            letterSpacing="0.05em"
            className={cn(textClass ?? 'text-xs', onSortChange && 'cursor-pointer hover:underline')}
            textDecoration={sortBy === 'count' ? 'underline' : 'none'}
            onClick={onSortChange ? () => onSortChange('count') : undefined}
          >
            {scoreMode ? t('chart.header.score') : t('chart.header.count')}
          </text>
          {!hideDeviation && (<>
          {devHasLeft && (
          <text
            x={devSectionStart + zeroX - 5}
            y={headerBaseline}
            textAnchor="end"
            fontWeight={600}
            fill={sortBy === 'deviation' ? 'var(--color-destructive)' : 'var(--color-muted-foreground)'}
            letterSpacing="0.05em"
            className={cn(textClass ?? 'text-[0.6875rem]', onSortChange && 'cursor-pointer hover:underline')}
            textDecoration={sortBy === 'deviation' ? 'underline' : 'none'}
            onClick={onSortChange ? () => onSortChange('deviation') : undefined}
          >
            <tspan x={devSectionStart + zeroX - 5} dy="-1.1em">{scoreMode ? t('chart.header.weakerHere1') : t('chart.header.underIndexed1')}</tspan>
            <tspan x={devSectionStart + zeroX - 5} dy="1.1em">{scoreMode ? t('chart.header.weakerHere2') : t('chart.header.underIndexed2')}</tspan>
          </text>
          )}
          {devHasRight && (
          <text
            x={devSectionStart + zeroX + 5}
            y={headerBaseline}
            textAnchor="start"
            fontWeight={600}
            fill={sortBy === 'deviation' ? 'var(--color-destructive)' : 'var(--color-muted-foreground)'}
            letterSpacing="0.05em"
            className={cn(textClass ?? 'text-[0.6875rem]', onSortChange && 'cursor-pointer hover:underline')}
            textDecoration={sortBy === 'deviation' ? 'underline' : 'none'}
            onClick={onSortChange ? () => onSortChange('deviation') : undefined}
          >
            <tspan x={devSectionStart + zeroX + 5} dy="-1.1em">{scoreMode ? t('chart.header.strongerHere1') : t('chart.header.overIndexed1')}</tspan>
            <tspan x={devSectionStart + zeroX + 5} dy="1.1em">{scoreMode ? t('chart.header.strongerHere2') : t('chart.header.overIndexed2')}</tspan>
          </text>
          )}

          </>)}

          {data.map((d, rowIdx) => {
            const y = yScale(d.label)!;

            const countIsPositive = scoreMode
              ? (Math.abs(d.count) < 0.005 ? rawMaxPos > rawMaxNeg : d.count > 0)
              : true;
            const countBarW = scoreMode
              ? countScale(Math.abs(d.count))
              : countScale(d.count);
            const countBarX = scoreMode
              ? (countIsPositive ? countSectionStart + countZeroX : countSectionStart + countZeroX - countBarW)
              : countSectionStart;

            const clampedDev = Math.max(devLeft, Math.min(devRight_, d.deviation));
            const isClipped = d.deviation > devRight_ || d.deviation < devLeft;
            const clippedBarX = clampedDev >= 0 ? zeroX : devScale(clampedDev);
            const clippedBarW = Math.abs(devScale(clampedDev) - zeroX);

            const key = rowKey(d);
            const isActive = activeKey === key;
            const highlightColor = /^(?:white|#fff(?:fff)?)$/i.test(d.color) ? '#737373' : d.color;

            const prevBottom = rowIdx > 0 ? yScale(data[rowIdx - 1].label)! + barHeight : topOffset;
            const nextTop = rowIdx < data.length - 1 ? yScale(data[rowIdx + 1].label)! : topOffset + data.length * rowHeight;
            const highlightY = (prevBottom + y) / 2;
            const highlightH = ((y + barHeight + nextTop) / 2) - highlightY;

            const hasData = !d.unavailable && (!disableEmptyRows || d.count > 0);

            return (
              <g key={key} data-row-key={key} data-unavailable={d.unavailable || undefined} role={onBarClick && hasData ? 'button' : undefined} tabIndex={onBarClick && hasData ? 0 : undefined} aria-label={onBarClick && hasData ? d.label : undefined} aria-pressed={onBarClick && hasData ? isActive : undefined} onKeyDown={onBarClick && hasData ? event => { if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onBarClick(key); } } : undefined} className={onBarClick && hasData ? 'cursor-pointer' : ''} onClick={onBarClick && hasData ? () => onBarClick(key) : undefined}>
                <rect
                  x={0} y={highlightY} width={width} height={highlightH}
                  fill={isActive ? highlightColor : 'transparent'}
                  opacity={isActive ? 0.12 : 1}
                  className={!isActive && onBarClick && hasData ? 'hover:fill-current hover:opacity-[0.04] active:opacity-[0.08]' : ''}
                />
                {!hideLabelText && (
                  <text
                    x={labelWidth}
                    y={y + barHeight / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className={textClass ?? 'text-xs'}
                    fill="currentColor"
                  >
                    {d.label}
                  </text>
                )}

                <g opacity={d.unavailable ? .3 : 1}>
                {d.icon && (
                  typeof d.icon === 'string' ? (
                    <image
                      href={d.icon}
                      x={iconStart}
                      y={y + barHeight / 2 - iconBoxH / 2}
                      width={iconColW}
                      height={iconBoxH}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  ) : d.icon(iconStart, y + barHeight / 2 - iconBoxH / 2, iconBoxH, iconColW)
                )}

                </g>
                {!d.unavailable && <>
                <rect
                  x={countBarX}
                  y={y}
                  width={countBarW}
                  height={barHeight}
                  fill={d.color}
                  stroke={countBarW > 0 ? d.barStroke : undefined}
                  strokeWidth={d.barStroke ? .75 : undefined}
                  opacity={d.barOpacity ?? 0.85}
                  rx={1}
                />
                <text
                  x={scoreMode
                    ? (countIsPositive ? countBarX + countBarW + 3 : countBarX - 3)
                    : countSectionStart + countBarW + 3}
                  y={y + barHeight / 2}
                  textAnchor={scoreMode && !countIsPositive ? 'end' : 'start'}
                  dominantBaseline="middle"
                  className={textClass ?? 'text-[0.6875rem]'}
                  fill="var(--color-muted-foreground)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {scoreMode
                    ? (d.count >= 0 ? '+' : '') + d.count.toFixed(2)
                    : `${d.count}`
                  }
                </text>

                {!hideDeviation && (<>
                {referenceDeviations && key in referenceDeviations && (() => {
                  const refDev = referenceDeviations[key];
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

                {(() => {
                  const bx = devSectionStart + clippedBarX;
                  const bw = clippedBarW;
                  if (bw <= 0) return null;
                  if (!isClipped) {
                    return (
                      <rect x={bx} y={y} width={bw} height={barHeight}
                        fill={d.color} stroke={d.barStroke} strokeWidth={d.barStroke ? .75 : undefined} opacity={d.barOpacity ?? 0.85} rx={1} />
                    );
                  }
                  const teeth = 4;
                  const toothH = barHeight / teeth;
                  const depth = 3;
                  const top = y;
                  const bot = y + barHeight;
                  let p: string;
                  if (d.deviation >= 0) {
                    p = `M${bx},${top} L${bx + bw},${top}`;
                    for (let i = 0; i < teeth; i++) {
                      p += ` L${bx + bw - depth},${top + toothH * i + toothH / 2}`;
                      p += ` L${bx + bw},${top + toothH * (i + 1)}`;
                    }
                    p += ` L${bx},${bot} Z`;
                  } else {
                    p = `M${bx + bw},${top} L${bx},${top}`;
                    for (let i = 0; i < teeth; i++) {
                      p += ` L${bx + depth},${top + toothH * i + toothH / 2}`;
                      p += ` L${bx},${top + toothH * (i + 1)}`;
                    }
                    p += ` L${bx + bw},${bot} Z`;
                  }
                  return <path d={p} fill={d.color} stroke={d.barStroke} strokeWidth={d.barStroke ? .75 : undefined} opacity={d.barOpacity ?? 0.85} />;
                })()}

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
                        className={textClass ?? 'text-[0.6875rem]'} fill="var(--color-muted-foreground)"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >{val}</text>
                    );
                  }
                  return (
                    <text
                      x={barEnd - 3} y={y + barHeight / 2}
                      textAnchor="end" dominantBaseline="middle"
                      className={textClass ?? 'text-[0.6875rem]'} fill="var(--color-muted-foreground)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >{val}</text>
                  );
                })()}
                </>)}
                </>}
              </g>
            );
          })}

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

export const ButterflyChart = memo(ButterflyChartImpl);
