import { scaleBand, scaleLinear } from 'd3-scale';
import { GEN_STOPS } from '@/components/shared/GenBadge';
import { typeBadgePath } from '@/data/type-ids';
import type { TypeName } from '@/types/pokemon';
import type { DetailedStatsData } from '@/components/view/useDetailedStatsData';

/**
 * Native-canvas renderer for the View "detailed stats" panel, used by the PNG
 * exporter. We deliberately do NOT rasterize the live DOM (html-to-image relies
 * on an SVG <foreignObject>, which hangs/fails on iOS WebKit). Instead we redraw
 * the three charts directly with the canvas 2D API — the same mechanism the grid
 * uses, which is reliable across engines — reusing the exact d3 scales the
 * on-screen charts use so the geometry matches.
 *
 * Everything draws in "natural" coordinates (a fixed ~320px-wide panel); the
 * caller applies a single ctx.scale() to fit it to the dex card's height.
 */

export const STATS_NAT_W = 320;

const CARD_GAP = 16;
const CARD_PADX = 20; // px-5
const CARD_PADY = 12; // py-3
const CARD_RADIUS = 8; // rounded-lg
const CONTENT_W = STATS_NAT_W - CARD_PADX * 2;

const FG = '#0a0a0a';
const MUTED = '#737373';
const CARD_BG = '#ffffff';
const NAT_HIST = '#94a3b8';
const YOURS = '#ef4444';

const TITLE_SIZE = 14;
const TITLE_LH = 20;
const SUB_SIZE = 12;
const SUB_LH = 16.5;
const LEGEND_SIZE = 12;

/** Per-chart vertical-height multipliers (mirror DEFAULT_STATS_HEIGHTS). */
export interface StatsHeights { type: number; region: number; bst: number }

function font(weight: number, size: number): string {
  return `${weight} ${size}px 'Inter Variable', system-ui, sans-serif`;
}

/** Greedy word-wrap to a max width. Returns the wrapped lines. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

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

type IconDrawer = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

interface ButterflyRowInput {
  count: number;
  deviation: number;
  color: string;
  icon: IconDrawer;
}

/**
 * Measure or draw one butterfly chart (Type / Generation) in natural coords with
 * its top-left at (ox, oy). Returns the chart's natural height. Mirrors
 * ButterflyChart.tsx with chartScale = 1, hideLabelText, iconFillsRow.
 */
function butterfly(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  rows: ButterflyRowInput[],
  rowHeightBase: number,
  heightScale: number,
  labelHeader: string,
  draw: boolean,
): number {
  const n = rows.length;
  const iconSize = 14;
  const rowHeight = Math.max(rowHeightBase * heightScale, iconSize + 4);
  const gap = 6;
  const gutter = 8;
  const topOffset = 28;
  const headerBaseline = topOffset - 8;
  const iconBoxH = rowHeight;
  const iconColAspect = 128 / 40;
  const iconColW = iconBoxH * iconColAspect;
  const iconStart = 0;
  const labelColEnd = iconStart + iconColW + gap;
  const countLabelPad = 28;
  const countLeftPad = 0;
  const countRightPad = countLabelPad;
  const chartsWidth = CONTENT_W - labelColEnd;
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
  const maxUnderDev = Math.max(...rows.map((d) => -d.deviation), 0);
  const DEV_OVER_CAP = 200;
  const maxOverDev = Math.max(...rows.map((d) => d.deviation), 0);
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
  const devLeft = -dl;
  const devRight = dr;
  const devScale = scaleLinear().domain([devLeft, devRight]).range([barPad, chart2Width - barPad]);
  const zeroX = devScale(0);

  ctx.save();
  ctx.translate(ox, oy);

  // Headers
  ctx.fillStyle = MUTED;
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(600, 12);
  spacedText(ctx, labelHeader, iconStart + iconColW / 2, headerBaseline, 0.05 * 12, 'middle');
  spacedText(ctx, 'COUNT', countSectionStart, headerBaseline, 0.05 * 12, 'start');
  // Deviation two-line headers (11px), bottom line on headerBaseline.
  ctx.font = font(600, 11);
  const dy = 1.1 * 11;
  spacedText(ctx, 'UNDER-', devSectionStart + zeroX - 5, headerBaseline - dy, 0.05 * 11, 'end');
  spacedText(ctx, '← INDEXED', devSectionStart + zeroX - 5, headerBaseline, 0.05 * 11, 'end');
  spacedText(ctx, 'OVER-', devSectionStart + zeroX + 5, headerBaseline - dy, 0.05 * 11, 'start');
  spacedText(ctx, 'INDEXED →', devSectionStart + zeroX + 5, headerBaseline, 0.05 * 11, 'start');

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
    ctx.globalAlpha = 1;
    ctx.fillStyle = MUTED;
    ctx.font = font(400, 11);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${d.count}`, countSectionStart + countBarW + 3, rowMid);

    // Deviation bar
    const clampedDev = Math.max(devLeft, Math.min(devRight, d.deviation));
    const barX = clampedDev >= 0 ? zeroX : devScale(clampedDev);
    const barW = Math.abs(devScale(clampedDev) - zeroX);
    if (barW > 0) {
      ctx.fillStyle = d.color;
      ctx.globalAlpha = 0.85;
      roundRect(ctx, devSectionStart + barX, y, barW, barHeight, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Value label
    const val = ((d.deviation / 100) + 1).toFixed(2) + 'x';
    const barEnd = devSectionStart + devScale(clampedDev);
    ctx.fillStyle = MUTED;
    ctx.textBaseline = 'middle';
    if (d.deviation >= 0) {
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

/**
 * Measure or draw the Base-Stat-Total histogram in natural coords at (ox, oy).
 * Mirrors SuperimposedHistogram.tsx with chartScale = 1.
 */
function histogram(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  bst: DetailedStatsData['bst'],
  heightScale: number,
  draw: boolean,
): number {
  const height = 200 * heightScale;
  const margin = { top: 8, right: 12, bottom: 24, left: 40 };
  const plotW = Math.max(0, CONTENT_W - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;

  if (!draw) return height;

  const xScale = scaleLinear().domain(bst.xDomain).range([0, plotW]);
  const yScale = scaleLinear().domain([0, bst.yDomain]).range([plotH, 0]);
  const barFullWidth = xScale(bst.binSize) - xScale(0);
  const barNarrowWidth = barFullWidth * 0.5;

  ctx.save();
  ctx.translate(ox + margin.left, oy + margin.top);

  // Baseline
  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 1;
  line(ctx, 0, plotH, plotW, plotH);

  // National bars
  for (const d of bst.merged) {
    const barH = plotH - yScale(d.nationalPct);
    if (barH <= 0) continue;
    ctx.fillStyle = NAT_HIST;
    ctx.globalAlpha = 0.45;
    roundRect(ctx, xScale(d.x - bst.binSize / 2), yScale(d.nationalPct), barFullWidth, barH, 1);
    ctx.fill();
  }
  // Yours bars
  for (const d of bst.merged) {
    const barH = plotH - yScale(d.yoursPct);
    if (barH <= 0) continue;
    ctx.fillStyle = YOURS;
    ctx.globalAlpha = 0.85;
    roundRect(ctx, xScale(d.x - bst.binSize / 2) + (barFullWidth - barNarrowWidth) / 2, yScale(d.yoursPct), barNarrowWidth, barH, 1);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // X ticks
  ctx.fillStyle = MUTED;
  ctx.strokeStyle = MUTED;
  ctx.font = font(400, 12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const t of bst.xTicks) {
    line(ctx, xScale(t), plotH, xScale(t), plotH + 4);
    ctx.fillText(`${t}`, xScale(t), plotH + 15);
  }
  // Y ticks
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of bst.yTicks) {
    line(ctx, -4, yScale(t), 0, yScale(t));
    ctx.fillText(`${t}%`, -7, yScale(t));
  }
  ctx.textAlign = 'left';

  ctx.restore();
  return height;
}

/** Build the per-row icon drawer for a generation badge (gradient disc + number). */
function genIcon(gen: number): IconDrawer {
  const stops = GEN_STOPS[gen] ?? [{ offset: '100%', color: '#888' }];
  return (ctx, x, y, w, h) => {
    // Function icons render square (size = row height), centred in the column.
    const size = h;
    const cx = x + (w - size) / 2;
    const r = size / 2;
    const grad = ctx.createLinearGradient(cx, y, cx + size, y + size);
    for (const s of stops) grad.addColorStop(Math.min(1, Math.max(0, parseFloat(s.offset) / 100)), s.color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx + r, y + r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(800, size * 0.55);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeText(`${gen}`, cx + r, y + r + size * 0.02);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${gen}`, cx + r, y + r + size * 0.02);
    ctx.textAlign = 'left';
  };
}

/** Build the per-row icon drawer for a type-name badge image (contain-fit). */
function typeBadgeIcon(img: HTMLImageElement | null): IconDrawer {
  return (ctx, x, y, w, h) => {
    if (!img) return;
    // Badge aspect (128/40) matches the column aspect, so it fills the box.
    ctx.drawImage(img, x, y, w, h);
  };
}

interface CardSpec {
  title: string;
  subtitle: string;
  legend?: boolean;
  chartH: (draw: boolean) => number;
  drawChart: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
}

/** Lay out + (optionally) draw the whole stats panel at natural scale, top-left
 *  at the current origin. Returns the panel's natural { w, h }. */
function renderPanel(
  ctx: CanvasRenderingContext2D,
  data: DetailedStatsData,
  badges: Map<string, HTMLImageElement>,
  heights: StatsHeights,
  draw: boolean,
): { w: number; h: number } {
  const typeRows: ButterflyRowInput[] = data.typeData.map((d) => ({
    count: d.count,
    deviation: d.deviation,
    color: d.color,
    icon: typeBadgeIcon(badges.get(d.label.toLowerCase()) ?? null),
  }));
  const genRows: ButterflyRowInput[] = data.genData.map((d) => ({
    count: d.count,
    deviation: d.deviation,
    color: d.color,
    icon: genIcon(d.gen),
  }));

  const cards: CardSpec[] = [
    {
      title: 'Type Distribution',
      subtitle: 'Your types, and how they deviate from the national dex.',
      chartH: (dr) => butterfly(ctx, 0, 0, typeRows, 16, heights.type, 'TYPE', dr),
      drawChart: (c, x, y) => butterfly(c, x, y, typeRows, 16, heights.type, 'TYPE', true),
    },
    {
      title: 'Generation Origin',
      subtitle: 'Which generation your Pokémon come from, vs the national dex.',
      chartH: (dr) => butterfly(ctx, 0, 0, genRows, 24, heights.region, 'GEN', dr),
      drawChart: (c, x, y) => butterfly(c, x, y, genRows, 24, heights.region, 'GEN', true),
    },
    {
      title: 'Base Stat Total',
      subtitle: `Yours avg: ${data.bst.yoursAvg}, National avg: ${data.bst.nationalAvg}.`,
      legend: true,
      chartH: (dr) => histogram(ctx, 0, 0, data.bst, heights.bst, dr),
      drawChart: (c, x, y) => histogram(c, x, y, data.bst, heights.bst, true),
    },
  ];

  let cursorY = 0;
  for (const card of cards) {
    // Measure content height.
    ctx.font = font(400, SUB_SIZE);
    const subLines = wrapText(ctx, card.subtitle, CONTENT_W);
    const legendH = card.legend ? LEGEND_SIZE + 8 : 0;
    const chartH = card.chartH(false);
    const contentH = TITLE_LH + 2 + subLines.length * SUB_LH + 8 + legendH + chartH;
    const cardH = CARD_PADY * 2 + contentH;

    if (draw) {
      // Card background.
      ctx.fillStyle = CARD_BG;
      roundRect(ctx, 0, cursorY, STATS_NAT_W, cardH, CARD_RADIUS);
      ctx.fill();

      let y = cursorY + CARD_PADY;
      const x = CARD_PADX;
      // Title
      ctx.fillStyle = FG;
      ctx.font = font(600, TITLE_SIZE);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(card.title, x, y + TITLE_SIZE);
      y += TITLE_LH + 2;
      // Subtitle
      ctx.fillStyle = MUTED;
      ctx.font = font(400, SUB_SIZE);
      for (const ln of subLines) {
        ctx.fillText(ln, x, y + SUB_SIZE);
        y += SUB_LH;
      }
      y += 8;
      // Legend (BST only)
      if (card.legend) {
        drawLegend(ctx, x, y);
        y += legendH;
      }
      // Chart
      card.drawChart(ctx, x, y);
    }

    cursorY += cardH + CARD_GAP;
  }
  const totalH = cursorY - CARD_GAP;
  return { w: STATS_NAT_W, h: totalH };
}

function drawLegend(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const items: [string, string, number][] = [
    ['National Dex', NAT_HIST, 0.5],
    ['Yours', YOURS, 0.85],
  ];
  let cx = x;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const [label, color, alpha] of items) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    roundRect(ctx, cx, y, 12, 12, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    cx += 12 + 6;
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 12);
    ctx.fillText(label, cx, y + 6);
    cx += ctx.measureText(label).width + 16;
  }
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

/** Type-badge sprite URLs needed by the export (one per type row). */
export function statsBadgeUrls(data: DetailedStatsData): { type: string; url: string }[] {
  return data.typeData.map((d) => {
    const type = d.label.toLowerCase();
    return { type, url: typeBadgePath(type as TypeName) };
  });
}

/** Natural height of the panel for a given dataset (for aspect-ratio sizing). */
export function measureStatsPanel(
  ctx: CanvasRenderingContext2D,
  data: DetailedStatsData,
  heights: StatsHeights,
): { w: number; h: number } {
  return renderPanel(ctx, data, new Map(), heights, false);
}

/** Draw the stats panel at natural scale with its top-left at the current
 *  origin (caller applies translate + scale beforehand). */
export function drawStatsPanel(
  ctx: CanvasRenderingContext2D,
  data: DetailedStatsData,
  badges: Map<string, HTMLImageElement>,
  heights: StatsHeights,
) {
  renderPanel(ctx, data, badges, heights, true);
}
