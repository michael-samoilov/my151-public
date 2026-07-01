import { useRef, useEffect, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { cn } from '@/lib/utils';

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
  /** Which column is actively sorted */
  sortBy?: 'count' | 'deviation' | 'label';
  /** Called when user clicks a column title to sort */
  onSortChange?: (col: 'count' | 'deviation' | 'label') => void;
  /** Header text for the label/icon column (e.g. "TYPE", "GEN") */
  labelHeader?: string;
  /** Drop the per-row label text (and the label-column header), keeping only the
   *  row icon as the identifier. Collapses the label column to just the icon so
   *  the chart bodies reclaim the freed width. Only sensible when every row has an
   *  icon that stands on its own (type symbols, numbered gen badges). */
  hideLabelText?: boolean;
  /** Width-to-height ratio reserved for the icon column (default 1 = square). Use
   *  >1 for wide identifiers like type-name badges. String icons fill the column at
   *  this aspect; function icons still render square (left-aligned in the column),
   *  so two charts can share an aspect to keep their bar columns aligned. */
  iconColAspect?: number;
  /** Multiplier on the per-row height (default 1). Lets a caller make the whole
   *  chart taller/shorter to tune how much vertical space it takes vs. its peers. */
  heightScale?: number;
  /** Size the row icon to fill the row height instead of the fixed ~14px icon size.
   *  Used for tall identifiers like type-name badges so the name reads at bar size. */
  iconFillsRow?: boolean;
  /** When true, the label-column header is clickable and toggles `sortBy='label'`.
   *  Default false: the label header is display-only. */
  labelSortable?: boolean;
  /** When true, rows with count === 0 are not clickable */
  disableEmptyRows?: boolean;
  /** Override the denominator used for the per-bar percentage label. Defaults
   *  to the sum of all counts in `data`. That default is correct for
   *  disjoint categories (e.g. generations), but for overlapping categories
   *  like types — where a dual-type pokemon contributes to two bars — the
   *  correct denominator is the number of pokemon, not the sum of type-slot
   *  mentions. Pass `pokemon.length` in that case so each bar reads as
   *  "share of the dex" rather than "share of type mentions". */
  countDenominator?: number;
  /** When set, overrides the font-size class on every text element (headers,
   *  count numbers, value labels) so they render at a single uniform size.
   *  Defaults to the per-element sizes (used by the analytics dashboard). */
  textClass?: string;
}

export function ButterflyChart({ data, rowHeight: rowHeightProp, referenceDeviations, hideDeviation, fixedMaxCount, fixedDevRight, onBarClick, activeLabel, scoreMode, forceBidirectionalCount, sortBy, onSortChange, disableEmptyRows, countDenominator, labelHeader, labelSortable, hideLabelText, iconColAspect = 1, heightScale = 1, iconFillsRow = false, textClass }: ButterflyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoveredSort, setHoveredSort] = useState<'count' | 'deviation' | 'label' | null>(null);

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



  // Layout: 3-column system
  // Col A: labels + icons (fixed) | Col B: chart 1 (count/score) | Col C: chart 2 (deviation)
  //
  // Chart-geometry sizing scales with the container width rather than being
  // hardcoded px. On mobile (~360px) values match today's tuning; on a
  // desktop dashboard (~900–1100px) icons, labels, and row height grow
  // proportionally so type icons / gen badges occupy the same visual
  // fraction of the chart at every width. Clamps preserve legibility at
  // extreme widths. Callers may still pass `rowHeight` as a floor — but
  // it is always raised to stay ≥ iconSize + 6 so the icon fits in its
  // row regardless of the prop.
  const hasIcons = data.some(d => d.icon);
  // chartScale: 1 at mobile-reference width (~360px), ramping up to 2 at
  // ~720px and holding at 2 beyond. Used to scale icon size and row
  // height (and indirectly label width) so the chart's visual density
  // stays consistent as the container grows — mobile proportions match
  // today, desktop proportions match mobile (just larger).
  const chartScale = width > 0 ? Math.max(1, Math.min(width / 360, 2)) : 1;
  const iconSize = hasIcons ? 14 * chartScale : 0;
  // With label text hidden the column collapses to just the icon (flush left); the
  // freed width flows into the chart bodies below via labelColEnd.
  const labelWidth = hideLabelText ? 0 : 42 * chartScale;
  const iconGap = hasIcons && !hideLabelText ? 3 : 0;
  const gap = 6;
  const gutter = 8; // space between chart sections
  // Header band. Tall enough for the two-line deviation header ("UNDER- / ←
  // INDEXED") to sit bottom-aligned — its lower line shares the baseline with the
  // single-line "COUNT" / "TYPE" headers (headerBaseline), and its upper line
  // stacks above within the band — instead of being vertically centred (which
  // pushed the lower line down into the first chart row).
  const titleHeight = 28;
  const topOffset = titleHeight;
  const headerBaseline = topOffset - 8;
  const rowHeight = Math.max((rowHeightProp ?? 22) * chartScale * heightScale, iconSize + 4);
  const chartHeight = topOffset + data.length * rowHeight;

  // Icon box height: a fixed ~14px square by default, or the full row height for
  // tall identifiers (type-name badges) so the name reads at roughly bar height.
  const iconBoxH = hasIcons ? (iconFillsRow ? rowHeight : iconSize) : 0;
  // Reserved icon-column width. Square by default; wider for type-name badges etc.
  const iconColW = iconBoxH * iconColAspect;

  const iconStart = hideLabelText ? 0 : labelWidth + iconGap;

  // Column A: labels + icons (fixed width)
  const labelColEnd = iconStart + iconColW + gap;

  // Determine directionality BEFORE width distribution
  const countHasNeg = scoreMode ? data.some(d => d.count < 0) : false;
  const countHasPos = !scoreMode || data.some(d => d.count > 0);
  const countIsBidirectional = forceBidirectionalCount || (countHasNeg && countHasPos);
  const devIsBidirectional = !hideDeviation; // deviation domain always spans neg-to-pos in practice

  // Weighted width distribution: bidirectional charts get 2x weight since
  // they carry bars on both sides of zero.
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

  // Chart 1 (count/score): directionality-aware margins. Reserves room for
  // value labels at bar ends — "-0.54" (~28px) in score mode, "25 (16%)"
  // (~48px) with percentages, "25" (~20px) without. Scales with chartScale
  // so labels don't clip on desktop where the root font grows.
  const countLabelPad = (scoreMode ? 32 : countDenominator ? 52 : 28) * chartScale;
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

  // Each chart's own data extents — chart 1 (count/score) and chart 2
  // (deviation) scale independently so each fills its allocated width with
  // bars instead of reserving horizontal room for the other chart's data.
  // Earlier versions shared extents via sharedLeft/sharedRight to visually
  // align the two zero lines, but that left huge empty gaps whenever one
  // chart's data skewed differently from the other's (e.g. score mode
  // where scores spanned [-0.5,+0.3] but deviations spanned [-0.17,+0.30]).
  const maxNegDev = scoreMode ? Math.max(...data.map(d => d.deviation < 0 ? -d.deviation : 0), 0) : 0;
  const maxPosDev = scoreMode ? Math.max(...data.map(d => d.deviation > 0 ? d.deviation : 0), 0) : 0;

  const countZeroX = (() => {
    if (!scoreMode) return countLeftPad;
    if (countIsBidirectional) {
      // Zero's proportional position follows this chart's own asymmetry
      const total = (rawMaxNeg + rawMaxPos) || 0.01;
      return countLeftPad + countBarArea * rawMaxNeg / total;
    }
    if (countHasNeg) return countLeftPad + countBarArea;
    return countLeftPad;
  })();
  // For bidirectional: uniform scale across the full bar area
  const countTotalExtent = countIsBidirectional
    ? (rawMaxNeg + rawMaxPos) || 0.01
    : maxCount;
  const countScale = scaleLinear().domain([0, countTotalExtent]).range([0, countBarArea]);

  // Chart 2 (deviation): domain + scale range
  //
  // Two labels need to fit inside chart 2 without clipping neighbors:
  //
  // 1. Header labels ("WEAKER ← HERE" / "STRONGER HERE →", etc.) anchor at
  //    `zeroX ± 5` with textAnchor pointing outward — they need `zeroX` to
  //    sit at least `labelPx` away from each of chart 2's usable-area edges.
  // 2. Per-bar value labels ("-0.23", "+0.12") anchor at the bar's outer
  //    end ± 3, extending outward — they need ~`barPad` of room from the
  //    bar end to the chart 2 edge, or they spill into the gutter (and,
  //    on the left, into chart 1's score labels).
  //
  // Solution: the scale range is inset by `barPad` on each side to give
  // bar value labels room. Inside that usable area, the domain's smaller
  // side is *inflated* (not the range padded) as needed so `zeroX` also
  // honors the header constraint. When data is balanced, bars fill the
  // entire usable width; when asymmetric, the short side shows a bit of
  // extra axis (still proportional to actual data) rather than wasting a
  // fixed padding chunk.
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
  // Header label extent (widest single line + 5px offset from zeroX).
  const labelPx = (scoreMode ? 60 : 66) * chartScale;
  // Bar value label extent (e.g. "-0.23" ≈ 24px, "1.54x" ≈ 30px with the +3
  // anchor offset at mobile base font). Reserved on each side of the bar area as
  // scale-range padding so value labels never spill into the gutter / chart 1 (or,
  // on the right, past the chart edge into the page margin).
  const barPad = 32 * chartScale;
  const usableW = Math.max(0, chart2Width - 2 * barPad);
  // In the usable area, zeroX still needs `labelPx` from each edge for the
  // header labels. The barPad we already reserved buys us some of that, so
  // the remaining constraint is `labelPx - barPad`.
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
        <svg width={width} height={chartHeight} className="overflow-visible">
          {/* Label column header (e.g. "TYPE", "GEN"). Sortable only when
              `labelSortable` is true — e.g. the gen chart uses natural-order
              sort; the type chart does not. With the label text hidden the header
              centers over the (wide) icon column; otherwise it right-aligns to the
              label+icon column edge. */}
          {labelHeader && (
            <text
              x={hideLabelText ? iconStart + iconColW / 2 : iconStart + iconSize}
              y={headerBaseline}
              textAnchor={hideLabelText ? 'middle' : 'end'}
              fontWeight={600}
              fill={labelSortable && sortBy === 'label' ? 'var(--color-destructive)' : 'var(--color-muted-foreground)'}
              letterSpacing="0.05em"
              className={cn(textClass ?? 'text-xs', labelSortable && onSortChange && 'cursor-pointer')}
              textDecoration={labelSortable && (sortBy === 'label' || hoveredSort === 'label') ? 'underline' : 'none'}
              onClick={labelSortable && onSortChange ? () => onSortChange('label') : undefined}
              onMouseEnter={labelSortable && onSortChange ? () => setHoveredSort('label') : undefined}
              onMouseLeave={labelSortable && onSortChange ? () => setHoveredSort(null) : undefined}
            >
              {labelHeader}
            </text>
          )}
          {/* Titles — alignment follows actual data directionality */}
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
            className={cn(textClass ?? 'text-xs', onSortChange && 'cursor-pointer')}
            textDecoration={sortBy === 'count' || hoveredSort === 'count' ? 'underline' : 'none'}
            onClick={onSortChange ? () => onSortChange('count') : undefined}
            onMouseEnter={onSortChange ? () => setHoveredSort('count') : undefined}
            onMouseLeave={onSortChange ? () => setHoveredSort(null) : undefined}
          >
            {scoreMode ? 'SCORE' : 'COUNT'}
          </text>
          {!hideDeviation && (<>
          {/* Deviation guide labels — only render sides that have data */}
          {devHasLeft && (
          <text
            x={devSectionStart + zeroX - 5}
            y={headerBaseline}
            textAnchor="end"
            fontWeight={600}
            fill={sortBy === 'deviation' ? 'var(--color-destructive)' : 'var(--color-muted-foreground)'}
            letterSpacing="0.05em"
            className={cn(textClass ?? 'text-[0.6875rem]', onSortChange && 'cursor-pointer')}
            textDecoration={sortBy === 'deviation' || hoveredSort === 'deviation' ? 'underline' : 'none'}
            onClick={onSortChange ? () => onSortChange('deviation') : undefined}
            onMouseEnter={onSortChange ? () => setHoveredSort('deviation') : undefined}
            onMouseLeave={onSortChange ? () => setHoveredSort(null) : undefined}
          >
            <tspan x={devSectionStart + zeroX - 5} dy="-1.1em">{scoreMode ? 'WEAKER' : 'UNDER-'}</tspan>
            <tspan x={devSectionStart + zeroX - 5} dy="1.1em">{scoreMode ? '← HERE' : '← INDEXED'}</tspan>
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
            className={cn(textClass ?? 'text-[0.6875rem]', onSortChange && 'cursor-pointer')}
            textDecoration={sortBy === 'deviation' || hoveredSort === 'deviation' ? 'underline' : 'none'}
            onClick={onSortChange ? () => onSortChange('deviation') : undefined}
            onMouseEnter={onSortChange ? () => setHoveredSort('deviation') : undefined}
            onMouseLeave={onSortChange ? () => setHoveredSort(null) : undefined}
          >
            <tspan x={devSectionStart + zeroX + 5} dy="-1.1em">{scoreMode ? 'STRONGER' : 'OVER-'}</tspan>
            <tspan x={devSectionStart + zeroX + 5} dy="1.1em">{scoreMode ? 'HERE →' : 'INDEXED →'}</tspan>
          </text>
          )}

          </>)}

          {/* Rows */}
          {data.map((d, rowIdx) => {
            const y = yScale(d.label)!;

            // Count bar — in scoreMode, bars extend from center
            // For label direction: treat near-zero values (rounds to ±0.00) as going toward dominant side
            const countIsPositive = scoreMode
              ? (Math.abs(d.count) < 0.005 ? rawMaxPos > rawMaxNeg : d.count > 0)
              : true;
            const countBarW = scoreMode
              ? countScale(Math.abs(d.count))
              : countScale(d.count);
            const countBarX = scoreMode
              ? (countIsPositive ? countSectionStart + countZeroX : countSectionStart + countZeroX - countBarW)
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

            const hasData = !disableEmptyRows || d.count > 0;

            return (
              <g key={d.label} className={onBarClick && hasData ? 'cursor-pointer' : ''} onClick={onBarClick && hasData ? () => onBarClick(d.label) : undefined}>
                {/* Full-row hit target + active highlight */}
                <rect
                  x={0} y={highlightY} width={width} height={highlightH}
                  fill={isActive ? d.color : 'transparent'}
                  opacity={isActive ? 0.12 : 1}
                  className={!isActive && onBarClick && hasData ? 'hover:fill-current hover:opacity-[0.04] active:opacity-[0.08]' : ''}
                />
                {/* Label */}
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

                {/* Row icon */}
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
                  ) : d.icon(iconStart + (iconColW - iconBoxH) / 2, y + barHeight / 2 - iconBoxH / 2, iconBoxH)
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
                    : countDenominator
                      ? `${d.count} (${countDenominator > 0 ? ((d.count / countDenominator) * 100).toFixed(0) : 0}%)`
                      : `${d.count}`
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
                        className={textClass ?? 'text-[0.6875rem]'} fill="var(--color-muted-foreground)"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >{val}</text>
                    );
                  }
                  return (
                    <text
                      x={barEnd - 3} y={y + barHeight / 2}
                      textAnchor="end" dominantBaseline="middle"
                      className="text-[0.6875rem]" fill="var(--color-muted-foreground)"
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
