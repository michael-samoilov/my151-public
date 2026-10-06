import { scaleLinear } from 'd3-scale';
import { histogramMeans } from './histogramMeans';
import { drawGenerationBadge } from './drawAttributeBadge';
import type { GenNumber } from '@/favorites/model/cells';
import { drawExportButterfly as butterfly, drawExportStatsTitle, type ButterflyRowInput, type IconDrawer } from './exportButterfly';
import { typeGlyphPath } from '@/data/type-ids';
import { drawTypeBadge } from '@/lib/drawTypeBadge';
import { TYPE_BADGE_ASPECT } from '@/lib/typeBadgeGeometry';
import { t, formatNumber } from '@/i18n';
import type { DetailedStatsData } from '@/components/view/useDetailedStatsData';
import type { TypeName } from '@/types/pokemon';

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

/** Vertical gap between stacked stat cards (natural units). Exported so the
 *  exporter can make the dex↔stats horizontal gutter match it after scaling. */
export const CARD_GAP = 16;
/** Stat-card inner padding (natural units): px-5 horizontal, py-3 vertical. The
 *  horizontal value is exported so the exporter can match the dex card's padding
 *  to it (uniform content-to-edge spacing across all cards). */
export const CARD_PADX = 20; // px-5
const CARD_PADY = 12; // py-3
const CARD_RADIUS = 8; // rounded-lg
const CONTENT_W = STATS_NAT_W - CARD_PADX * 2;

const MUTED = '#737373';
const CARD_BG = '#ffffff';
const NAT_HIST = '#94a3b8';
const YOURS = '#ef4444';

const TITLE_LH = 20;
const SUB_SIZE = 10; // matches CHART_TEXT (subtitle unified with chart text)
const SUB_LH = 14; // 10px * leading-snug (1.375)
const LEGEND_SIZE = 10; // unified with CHART_TEXT (matches on-screen STATS_TEXT)
/** Single font size for all chart text (headers, axis + value numbers), matching
 *  the on-screen STATS_TEXT (text-[0.625rem] = 10px). */
const CHART_TEXT = 10;

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

/**
 * Measure or draw the Base-Stat-Total histogram in natural coords at (ox, oy).
 * Mirrors SuperimposedHistogram.tsx with chartScale = 1.
 */
export function drawExportHistogram(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  bst: DetailedStatsData['bst'],
  heightScale: number,
  draw: boolean,
  meanRail?: { labels: { yours:string; options:string; exact:string }; legend: { yours:string; options:string } },
): number {
  const height = 200 * heightScale + (meanRail ? 76 : 0);
  const margin = { top: 8, right: 12, bottom: 24 + (meanRail ? 76 : 0), left: 40 };
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

  if(meanRail){
    ctx.font=font(400,CHART_TEXT);
    const means=histogramMeans(bst.yoursAvg,bst.nationalAvg,plotW,xScale,meanRail.labels,text=>ctx.measureText(text).width);
    for(const point of means){
      const cy=plotH+34+point.rail*17;
      ctx.strokeStyle=point.color;ctx.fillStyle=point.color;
      if(point.rail>0)line(ctx,point.x,plotH+34,point.x,cy);
      ctx.beginPath();ctx.moveTo(point.x,cy-4);ctx.lineTo(point.x+4,cy);ctx.lineTo(point.x,cy+4);ctx.lineTo(point.x-4,cy);ctx.closePath();ctx.fill();if(point.exact){ctx.strokeStyle=NAT_HIST;ctx.lineWidth=2;ctx.stroke();}
      ctx.textAlign=point.anchor==='middle'?'center':point.anchor==='end'?'right':'left';ctx.textBaseline='middle';ctx.fillText(point.text,point.labelX,cy+((point.labelRail ?? point.rail)-point.rail)*17);
    }
    const lx=Math.max(0,plotW-110);ctx.fillStyle='#fff';ctx.globalAlpha=.92;ctx.fillRect(lx,6,110,32);ctx.globalAlpha=1;
    [{text:meanRail.legend.options,color:NAT_HIST},{text:meanRail.legend.yours,color:YOURS}].forEach((item,i)=>{ctx.fillStyle=item.color;ctx.fillRect(lx+4,11+i*15,7,7);ctx.fillStyle=MUTED;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(item.text,lx+16,18+i*15);});
  }
  // X ticks
  ctx.fillStyle = MUTED;
  ctx.strokeStyle = MUTED;
  ctx.font = font(400, CHART_TEXT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const tickStep=meanRail?Math.max(1,Math.ceil(32/plotW*(bst.xDomain[1]-bst.xDomain[0])/100)):1;
  for (const t of bst.xTicks.filter((_,i)=>i%tickStep===0)) {
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

/** A generation uses the same pill geometry as its neighboring type identifiers. */
function genIcon(gen: number): IconDrawer {
  return (ctx, x, y, w, h) => {
    const height = Math.min(h, w / TYPE_BADGE_ASPECT);
    drawGenerationBadge(ctx, gen as GenNumber, x + (w - height * TYPE_BADGE_ASPECT) / 2, y + (h - height) / 2, height);
  };
}

/** Build the per-row icon drawer for a type badge. Contain-fit and centre within
 *  the column (mirrors the on-screen SVG); the badge's 5:1 aspect differs from
 *  the column's, so filling it would distort the pill. */
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

export interface StatsCardBox { y: number; h: number }
export interface StatsLayout { w: number; h: number; cards: StatsCardBox[] }

/** Lay out + (optionally) draw the whole stats panel at natural scale, top-left
 *  at the current origin. Returns the panel's natural { w, h } and per-card boxes
 *  (natural coords). When `cardBg` is false the white card backgrounds are NOT
 *  filled here — the caller draws them (with shadow) in the export's logical
 *  space so their radius/shadow match the dex card. */
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
      chartH: (dr) => butterfly(ctx, 0, 0, typeRows, 16, heights.type, 'TYPE', dr, { alignBaselines: true }),
      drawChart: (c, x, y) => butterfly(c, x, y, typeRows, 16, heights.type, 'TYPE', true, { alignBaselines: true }),
    },
    {
      title: t('stats.gen.title'),
      subtitle: '',
      chartH: (dr) => butterfly(ctx, 0, 0, genRows, 24, heights.region, 'GEN', dr, { alignBaselines: true }),
      drawChart: (c, x, y) => butterfly(c, x, y, genRows, 24, heights.region, 'GEN', true, { alignBaselines: true }),
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
    // Measure content height.
    ctx.font = font(400, SUB_SIZE);
    const subLines = wrapText(ctx, card.subtitle, CONTENT_W);
    const legendH = card.legend ? LEGEND_SIZE + 8 : 0;
    const chartH = card.chartH(false);
    const contentH = TITLE_LH + 2 + subLines.length * SUB_LH + 8 + legendH + chartH;
    const cardH = CARD_PADY * 2 + contentH;
    boxes.push({ y: cursorY, h: cardH });

    if (draw) {
      // Card background (skipped when the caller draws it in logical space).
      if (cardBg) {
        ctx.fillStyle = CARD_BG;
        roundRect(ctx, 0, cursorY, STATS_NAT_W, cardH, CARD_RADIUS);
        ctx.fill();
      }

      let y = cursorY + CARD_PADY;
      const x = CARD_PADX;
      // Title — outline-section style: Inter Black, uppercase, stretched (scaleX)
      // to fill the card width, capped at the same MAX_LABEL_STRETCH the grid uses.
      drawExportStatsTitle(ctx, card.title, x, y, CONTENT_W);
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

/** Natural size + per-card boxes for a dataset (for aspect-ratio sizing and for
 *  drawing the card backgrounds/shadows in the export's logical space). */
export function measureStatsPanel(
  ctx: CanvasRenderingContext2D,
  data: DetailedStatsData,
  heights: StatsHeights,
): StatsLayout {
  return renderPanel(ctx, data, new Map(), heights, false, true);
}

/** Draw the stats panel CONTENT (no card backgrounds) at natural scale with its
 *  top-left at the current origin (caller applies translate + scale, and draws
 *  the shadowed card backgrounds itself so they match the dex card). */
export function drawStatsPanel(
  ctx: CanvasRenderingContext2D,
  data: DetailedStatsData,
  badges: Map<string, HTMLImageElement>,
  heights: StatsHeights,
) {
  renderPanel(ctx, data, badges, heights, true, false);
}
