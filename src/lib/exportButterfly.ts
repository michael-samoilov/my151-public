import { scaleBand, scaleLinear } from 'd3-scale';
import { MAX_LABEL_STRETCH } from '@/lib/sectionOutlines';
import { butterflyColumns } from './butterflyLayout';
const MUTED = '#737373';
const CHART_TEXT = 10;
function font(weight: number, size: number) { return `${weight} ${size}px 'Inter Variable', system-ui, sans-serif`; }

/** Draw text with manual letter-spacing (ctx.letterSpacing isn't reliable on
 *  older iOS). `align` controls anchoring around `x`. */
function spacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'start' | 'middle' | 'end',
) {
  const widths = [...text].map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, text.length - 1);
  let cx = align === 'start' ? x : align === 'middle' ? x - total / 2 : x - total;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = prevAlign;
}

export type IconDrawer = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

export interface ButterflyRowInput {
  count: number;
  deviation: number | null;
  color: string;
  barStroke?: string;
  icon: IconDrawer;
}

/**
 * Measure or draw one butterfly chart (Type / Generation) in natural coords with
 * its top-left at (ox, oy). Returns the chart's natural height. Mirrors
 * ButterflyChart.tsx with chartScale = 1, hideLabelText, iconFillsRow.
 */
export function drawExportButterfly(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  rows: ButterflyRowInput[],
  rowHeightBase: number,
  heightScale: number,
  labelHeader: string,
  draw: boolean,
  options: { contentWidth?: number; iconColAspect?: number; alignBaselines?: boolean } = {},
): number {
  const n = rows.length;
  const iconSize = 14;
  const columns = butterflyColumns(options.contentWidth ?? 280);
  const rowHeight = Math.max(rowHeightBase * heightScale, options.alignBaselines ? columns.identifierWidth / 5 + 4 : iconSize + 4);
  const gap = 6;
  const gutter = 8;
  const topOffset = 28;
  const headerBaseline = topOffset - 8;
  const iconBoxH = options.alignBaselines ? columns.identifierWidth / 5 : rowHeight;
  const iconColAspect = options.iconColAspect ?? 128 / 40;
  const iconColW = options.alignBaselines ? columns.identifierWidth : iconBoxH * iconColAspect;
  const iconStart = 0;
  const labelColEnd = options.alignBaselines ? columns.countStart : iconStart + iconColW + gap;
  ctx.save();
  ctx.font = font(400, CHART_TEXT);
  const countLabelPad = Math.max(0, ...rows.map(row => ctx.measureText(String(row.count)).width)) + 6;
  ctx.restore();
  const countLeftPad = 0;
  const countRightPad = countLabelPad;
  const chartsWidth = (options.contentWidth ?? 280) - labelColEnd;
  const available = chartsWidth - gutter;
  const chart1Width = Math.floor((available * 1) / 3); // count w=1, deviation w=2
  const chart2Width = available - chart1Width;
  const countSectionStart = labelColEnd;
  const devSectionStart = labelColEnd + chart1Width + gutter;
  const countBarArea = Math.max(0, chart1Width - countLeftPad - countRightPad);
  const countZeroX = countLeftPad;
  const chartHeight = topOffset + n * rowHeight;

  if (!draw) return chartHeight;

  const labels = rows.map((_, i) => String(i));
  const yScale = scaleBand<string>()
    .domain(labels)
    .range([topOffset, topOffset + n * rowHeight])
    .padding(0.25);
  const barHeight = yScale.bandwidth();

  const maxCount = Math.max(...rows.map((d) => Math.abs(d.count)), 1);
  const countScale = scaleLinear().domain([0, maxCount]).range([0, countBarArea]);

  // Deviation scale (non-score mode), faithful to ButterflyChart.
  const maxUnderDev = Math.max(...rows.map((d) => -(d.deviation ?? 0)), 0);
  const DEV_OVER_CAP = 200;
  const maxOverDev = Math.max(...rows.map((d) => (d.deviation ?? 0)), 0);
  const devLeftRaw = Math.min(Math.max(maxUnderDev, 25), DEV_OVER_CAP);
  const devRightRaw = Math.min(Math.max(maxOverDev, 25), DEV_OVER_CAP);
  const labelPx = 66;
  const barPad = 32;
  const usableW = Math.max(0, chart2Width - 2 * barPad);
  const minSideFrac = usableW > 0 ? Math.min(0.48, Math.max(0, (labelPx - barPad + 2) / usableW)) : 0;
  let dl = devLeftRaw;
  let dr = devRightRaw;
  const dTotal = dl + dr;
  if (dTotal > 0 && minSideFrac > 0) {
    if (dl / dTotal < minSideFrac) dl = dr * minSideFrac / (1 - minSideFrac);
    if (dr / dTotal < minSideFrac) dr = dl * minSideFrac / (1 - minSideFrac);
  }
  if (options.alignBaselines) dl = dr = Math.max(dl, dr);
  const devLeft = -dl;
  const devRight = dr;
  const devScale = scaleLinear().domain([devLeft, devRight]).range([barPad, chart2Width - barPad]);
  const zeroX = devScale(0);

  ctx.save();
  ctx.translate(ox, oy);

  // Headers — all at the uniform CHART_TEXT size.
  ctx.fillStyle = MUTED;
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(600, CHART_TEXT);
  spacedText(ctx, labelHeader, iconStart + iconColW / 2, headerBaseline, 0.05 * CHART_TEXT, 'middle');
  spacedText(ctx, 'COUNT', countSectionStart, headerBaseline, 0.05 * CHART_TEXT, 'start');
  // Deviation two-line headers, bottom line on headerBaseline.
  const dy = 1.1 * CHART_TEXT;
  spacedText(ctx, 'UNDER-', devSectionStart + zeroX - 5, headerBaseline - dy, 0.05 * CHART_TEXT, 'end');
  spacedText(ctx, '← INDEXED', devSectionStart + zeroX - 5, headerBaseline, 0.05 * CHART_TEXT, 'end');
  spacedText(ctx, 'OVER-', devSectionStart + zeroX + 5, headerBaseline - dy, 0.05 * CHART_TEXT, 'start');
  spacedText(ctx, 'INDEXED →', devSectionStart + zeroX + 5, headerBaseline, 0.05 * CHART_TEXT, 'start');

  // Rows
  rows.forEach((d, i) => {
    const y = yScale(String(i))!;
    const rowMid = y + barHeight / 2;

    // Icon
    d.icon(ctx, iconStart, rowMid - iconBoxH / 2, iconColW, iconBoxH);

    // Count bar + number
    const countBarW = countScale(d.count);
    ctx.fillStyle = d.color;
    ctx.globalAlpha = 0.85;
    roundRect(ctx, countSectionStart, y, countBarW, barHeight, 1);
    ctx.fill();
    if (d.barStroke && countBarW > 0) { ctx.strokeStyle = d.barStroke; ctx.lineWidth = .75; ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = MUTED;
    ctx.font = font(400, CHART_TEXT);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${d.count}`, countSectionStart + countBarW + 3, rowMid);

    // Deviation bar
    const clampedDev = Math.max(devLeft, Math.min(devRight, d.deviation ?? 0));
    const barX = clampedDev >= 0 ? zeroX : devScale(clampedDev);
    const barW = Math.abs(devScale(clampedDev) - zeroX);
    if (barW > 0 && d.deviation !== null) {
      ctx.fillStyle = d.color;
      ctx.globalAlpha = 0.85;
      roundRect(ctx, devSectionStart + barX, y, barW, barHeight, 1);
      ctx.fill();
      if (d.barStroke) { ctx.strokeStyle = d.barStroke; ctx.lineWidth = .75; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // Value label
    const val = d.deviation === null ? '—' : (((d.deviation / 100) + 1).toFixed(2) + 'x');
    const barEnd = devSectionStart + devScale(clampedDev);
    ctx.fillStyle = MUTED;
    ctx.textBaseline = 'middle';
    if ((d.deviation ?? 0) >= 0) {
      ctx.textAlign = 'left';
      ctx.fillText(val, barEnd + 3, rowMid);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText(val, barEnd - 3, rowMid);
    }
    ctx.textAlign = 'left';
  });

  // Zero lines
  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 1;
  line(ctx, countSectionStart + countZeroX, topOffset, countSectionStart + countZeroX, topOffset + n * rowHeight);
  line(ctx, devSectionStart + zeroX, topOffset, devSectionStart + zeroX, topOffset + n * rowHeight);

  ctx.restore();
  return chartHeight;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rr);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Dex detail-card title: identical font, uppercasing, and horizontal stretch. */
export function drawExportStatsTitle(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width = 280) {
  ctx.fillStyle = '#0a0a0a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const up = text.toUpperCase();
  ctx.font = font(900, 14);
  const tw = ctx.measureText(up).width;
  const sx = tw > 0 ? Math.min(MAX_LABEL_STRETCH, width / tw) : 1;
  ctx.save();
  ctx.translate(x, y + 14);
  ctx.scale(sx, 1);
  ctx.fillText(up, 0, 0);
  ctx.restore();
}
