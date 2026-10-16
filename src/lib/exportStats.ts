import { scaleLinear } from 'd3-scale';
import { histogramMeans, histogramMeanLayout } from './histogramMeans';
import { drawGenerationBadge } from './drawAttributeBadge';
import type { GenNumber } from '@/favorites/model/cells';
import { drawExportButterfly as butterfly, drawExportStatsTitle, type ButterflyRowInput, type IconDrawer } from './exportButterfly';
import { typeGlyphPath } from '@/data/type-ids';
import { drawTypeBadge } from '@/lib/drawTypeBadge';
import { TYPE_BADGE_ASPECT } from '@/lib/typeBadgeGeometry';
import { t, formatNumber } from '@/i18n';
import type { DetailedStatsData } from '@/components/view/useDetailedStatsData';
import type { TypeName } from '@/types/pokemon';

const STATS_NAT_W = 320;

const CARD_GAP = 16;
const CARD_PADX = 20;
const CARD_PADY = 12;
const CARD_RADIUS = 8;
const CONTENT_W = STATS_NAT_W - CARD_PADX * 2;
const BUTTERFLY_OPTIONS = { alignBaselines: true, headerBleed: CARD_PADX - 4 };

const MUTED = '#737373';
const CARD_BG = '#ffffff';
const NAT_HIST = '#94a3b8';
const YOURS = '#ef4444';

const TITLE_LH = 20;
const SUB_SIZE = 10;
const SUB_LH = 14;
const LEGEND_SIZE = 10;
const CHART_TEXT = 10;

export interface StatsHeights { type: number; region: number; bst: number }

function font(weight: number, size: number): string {
  return `${weight} ${size}px 'Inter Variable', system-ui, sans-serif`;
}

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

export function drawExportHistogram(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  bst: DetailedStatsData['bst'],
  heightScale: number,
  draw: boolean,
  meanRail?: { labels: { yours:string; options:string; exact:string } },
): number {
  const baseHeight = 200 * heightScale;
  const margin = { top: 8, right: 12, bottom: 24, left: 40 };
  const plotW = Math.max(0, CONTENT_W - margin.left - margin.right);
  const plotH = baseHeight - margin.top - margin.bottom;
  const xScale = scaleLinear().domain(bst.xDomain).range([0, plotW]);
  const tickStep = meanRail ? Math.max(1, Math.ceil(32 / plotW * (bst.xDomain[1] - bst.xDomain[0]) / 100)) : 1;
  const ticks = bst.xTicks.filter((_, i) => i % tickStep === 0);
  const measure = (text: string, bold = false, middle = false) => {
    ctx.save(); ctx.font = font(bold ? 700 : 400, CHART_TEXT);
    ctx.textAlign = 'left'; ctx.textBaseline = middle ? 'middle' : 'alphabetic';
    const m = ctx.measureText(text); ctx.restore();
    return { width: m.width, left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
  };
  const means = meanRail ? histogramMeans(bst.yoursAvg, bst.nationalAvg, plotW, xScale, meanRail.labels, measure,
    { left: -margin.left + 4, right: plotW + margin.right - 4 }) : [];
  const meanLayout = histogramMeanLayout(means, ticks, xScale, measure);
  const height = meanRail ? margin.top + plotH + meanLayout.bottom : baseHeight;
  if (!draw) return height;

  ctx.save();
  const visibleData = meanRail ? bst.merged.filter(bin => bin.x >= bst.xDomain[0] && bin.x < bst.xDomain[1]) : bst.merged;
  const yScale = scaleLinear().domain([0, bst.yDomain]).range([plotH, 0]);
  const barFullWidth = xScale(bst.binSize) - xScale(0);
  const barNarrowWidth = barFullWidth * 0.5;

  ctx.translate(ox + margin.left, oy + margin.top);

  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 1;
  line(ctx, 0, plotH, plotW, plotH);

  for (const d of visibleData) {
    const barH = plotH - yScale(d.nationalPct);
    if (barH <= 0) continue;
    ctx.fillStyle = NAT_HIST;
    ctx.globalAlpha = 0.45;
    roundRect(ctx, xScale(d.x - bst.binSize / 2), yScale(d.nationalPct), barFullWidth, barH, 1);
    ctx.fill();
  }
  for (const d of visibleData) {
    const barH = plotH - yScale(d.yoursPct);
    if (barH <= 0) continue;
    ctx.fillStyle = YOURS;
    ctx.globalAlpha = 0.85;
    roundRect(ctx, xScale(d.x - bst.binSize / 2) + (barFullWidth - barNarrowWidth) / 2, yScale(d.yoursPct), barNarrowWidth, barH, 1);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = MUTED;
  ctx.strokeStyle = MUTED;
  ctx.font = font(400, CHART_TEXT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const t of ticks) {
    line(ctx, xScale(t), plotH, xScale(t), plotH + 4);
    ctx.fillText(`${t}`, xScale(t), plotH + 15);
  }
  for (const point of meanLayout.points) {
    const cy = plotH + meanLayout.rail;
    ctx.strokeStyle = point.color; ctx.fillStyle = point.color;
    for (const [start, end] of point.segments) line(ctx, point.x, plotH + start, point.x, plotH + end);
    ctx.beginPath(); ctx.moveTo(point.x, cy - 4); ctx.lineTo(point.x + 4, cy); ctx.lineTo(point.x, cy + 4); ctx.lineTo(point.x - 4, cy); ctx.closePath(); ctx.fill();
    if (point.exact) { ctx.strokeStyle = NAT_HIST; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let labelX = point.labelX - (point.anchor === 'end' ? point.width : point.anchor === 'middle' ? point.width / 2 : 0);
    for (const run of point.runs) {
      ctx.font = font(run.bold ? 700 : 400, CHART_TEXT);
      ctx.fillText(run.text, labelX, cy + point.labelRail * 17);
      labelX += ctx.measureText(run.text).width;
    }
  }
  ctx.font = font(400, CHART_TEXT); ctx.fillStyle = MUTED; ctx.strokeStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yTickStep=meanRail?Math.max(1,Math.ceil(14/Math.max(1,plotH/Math.max(1,bst.yTicks.length-1)))):1;
  for (const t of bst.yTicks.filter((_,index)=>index%yTickStep===0 || index===bst.yTicks.length-1)) {
    line(ctx, -4, yScale(t), 0, yScale(t));
    ctx.fillText(`${t}%`, -7, yScale(t));
  }
  ctx.textAlign = 'left';

  ctx.restore();
  return height;
}

function genIcon(gen: number): IconDrawer {
  return (ctx, x, y, w, h) => {
    const height = Math.min(h, w / TYPE_BADGE_ASPECT);
    drawGenerationBadge(ctx, gen as GenNumber, x + (w - height * TYPE_BADGE_ASPECT) / 2, y + (h - height) / 2, height);
  };
}

function typeBadgeIcon(type: TypeName, glyph: HTMLImageElement | null): IconDrawer {
  return (ctx, x, y, w, h) => {
    const height = Math.min(h, w / TYPE_BADGE_ASPECT);
    drawTypeBadge(ctx, type, glyph, x + (w - height * TYPE_BADGE_ASPECT) / 2, y + (h - height) / 2, height);
  };
}

interface CardSpec {
  title: string;
  subtitle: string;
  legend?: boolean;
  chartH: (draw: boolean) => number;
  drawChart: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
}

interface StatsCardBox { y: number; h: number }
interface StatsLayout { w: number; h: number; cards: StatsCardBox[] }

function renderPanel(
  ctx: CanvasRenderingContext2D,
  data: DetailedStatsData,
  badges: Map<string, HTMLImageElement>,
  heights: StatsHeights,
  draw: boolean,
  cardBg: boolean,
): StatsLayout {
  const typeRows: ButterflyRowInput[] = data.typeData.map((d) => ({
    count: d.count,
    deviation: d.deviation,
    color: d.color,
    barOpacity: 1,
    icon: typeBadgeIcon(d.type as TypeName, badges.get(d.type) ?? null),
  }));
  const genRows: ButterflyRowInput[] = data.genData.map((d) => ({
    count: d.count,
    deviation: d.deviation,
    color: d.color,
    icon: genIcon(d.gen),
  }));

  const cards: CardSpec[] = [
    {
      title: t('stats.type.title'),
      subtitle: '',
      chartH: (dr) => butterfly(ctx, 0, 0, typeRows, 16, heights.type, t('chart.header.type'), dr, BUTTERFLY_OPTIONS),
      drawChart: (c, x, y) => butterfly(c, x, y, typeRows, 16, heights.type, t('chart.header.type'), true, BUTTERFLY_OPTIONS),
    },
    {
      title: t('stats.gen.title'),
      subtitle: '',
      chartH: (dr) => butterfly(ctx, 0, 0, genRows, 24, heights.region, t('chart.header.gen'), dr, BUTTERFLY_OPTIONS),
      drawChart: (c, x, y) => butterfly(c, x, y, genRows, 24, heights.region, t('chart.header.gen'), true, BUTTERFLY_OPTIONS),
    },
    {
      title: t('stats.bst.title'),
      subtitle: t('analytics.avgCompare', { yours: formatNumber(data.bst.yoursAvg, { maximumFractionDigits: 1 }), national: formatNumber(data.bst.nationalAvg, { maximumFractionDigits: 1 }) }),
      legend: true,
      chartH: (dr) => drawExportHistogram(ctx, 0, 0, data.bst, heights.bst, dr),
      drawChart: (c, x, y) => drawExportHistogram(c, x, y, data.bst, heights.bst, true),
    },
  ];

  const boxes: StatsCardBox[] = [];
  let cursorY = 0;
  for (const card of cards) {
    ctx.font = font(400, SUB_SIZE);
    const subLines = wrapText(ctx, card.subtitle, CONTENT_W);
    const legendH = card.legend ? LEGEND_SIZE + 8 : 0;
    const chartH = card.chartH(false);
    const contentH = TITLE_LH + 2 + subLines.length * SUB_LH + 8 + legendH + chartH;
    const cardH = CARD_PADY * 2 + contentH;
    boxes.push({ y: cursorY, h: cardH });

    if (draw) {
      if (cardBg) {
        ctx.fillStyle = CARD_BG;
        roundRect(ctx, 0, cursorY, STATS_NAT_W, cardH, CARD_RADIUS);
        ctx.fill();
      }

      let y = cursorY + CARD_PADY;
      const x = CARD_PADX;
      drawExportStatsTitle(ctx, card.title, x, y, CONTENT_W);
      y += TITLE_LH + 2;
      ctx.fillStyle = MUTED;
      ctx.font = font(400, SUB_SIZE);
      for (const ln of subLines) {
        ctx.fillText(ln, x, y + SUB_SIZE);
        y += SUB_LH;
      }
      y += 8;
      if (card.legend) {
        drawLegend(ctx, x, y);
        y += legendH;
      }
      card.drawChart(ctx, x, y);
    }

    cursorY += cardH + CARD_GAP;
  }
  const totalH = cursorY - CARD_GAP;
  return { w: STATS_NAT_W, h: totalH, cards: boxes };
}

function drawLegend(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const items: [string, string, number][] = [
    [t('stats.legend.national'), NAT_HIST, 0.5],
    [t('stats.legend.yours'), YOURS, 0.85],
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
    ctx.font = font(500, LEGEND_SIZE);
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

/** Type-symbol URLs needed by the export (one per type row). Canvas does not
 *  trigger image loading, so the caller resolves these before drawing. */
export function statsBadgeUrls(data: DetailedStatsData): { type: string; url: string }[] {
  return data.typeData.map((d) => ({ type: d.type, url: typeGlyphPath(d.type as TypeName) }));
}

export function measureStatsPanel(
  ctx: CanvasRenderingContext2D,
  data: DetailedStatsData,
  heights: StatsHeights,
): StatsLayout {
  return renderPanel(ctx, data, new Map(), heights, false, true);
}

export function drawStatsPanel(
  ctx: CanvasRenderingContext2D,
  data: DetailedStatsData,
  badges: Map<string, HTMLImageElement>,
  heights: StatsHeights,
) {
  renderPanel(ctx, data, badges, heights, true, false);
}
