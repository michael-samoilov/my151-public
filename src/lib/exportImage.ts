import type { Pokemon, TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { computeTypeDominance, getNationalBaseline, getNationalBaselineFiltered } from '@/hooks/useTypeDominance';
import { getAllPokemon, withoutSpecials } from '@/hooks/usePokemonData';
import { typeIconPath } from '@/data/type-ids';
import { GEN_BADGE_URIS } from '@/components/shared/GenBadge';
import { STARTER_IDS } from '@/data/categories';
import { ensureTypeMask } from '@/lib/typeSymbol';
import { measureStatsPanel, drawStatsPanel, statsBadgeUrls, STATS_NAT_W, CARD_PADX as STATS_CARD_PADX, CARD_GAP as STATS_CARD_GAP, type StatsHeights } from './exportStats';
import type { DetailedStatsData } from '@/components/view/useDetailedStatsData';
import {
  computeOutlineLayout,
  buildOutlines,
  fitLabel,
  starPath,
  outlineStrokeW,
  type OutlineShape,
  type Spandrel,
  OUTLINE_GAP,
  OUTLINE_PAD,
  OUTLINE_HEAD,
  OUTLINE_STROKE_FRAC,
  OUTLINE_TITLE_VBIAS,
  OUTLINE_TITLE_OPACITY,
  OUTLINE_REPEAT_TITLES,
  OUTLINE_SHORTEN_TITLES,
} from '@/lib/sectionOutlines';

const COLS = 10;
const TILE = 48;
const SPRITE_SRC = 96; // native sprite resolution
const SPRITE = SPRITE_SRC / 2; // logical draw size = 48px (1:1 with tile)
const PAD_X = 12;
const PAD_TOP = 8;
const PAD_BOTTOM = 28;
const BG = '#ffffff';
// When the stats panel is composited, the grid is wrapped in a white card (like
// the website). The card's inner padding is computed to match the stat cards'
// padding (see generateExportImage); corner radius + the muted page background
// the cards sit on are below.
const CARD_RADIUS = 12;
const CARD_BG = '#ffffff';
const PAGE_BG = '#f7f7f8';
// Outer margin around the carded content so the cards' soft shadow has room and
// isn't clipped at the canvas edge.
const CARD_SHADOW_ROOM = 20;
const ROTATION = -30 * (Math.PI / 180); // match view page -rotate-[30deg]
const SCALE = 4; // SPRITE * SCALE = 192 = exactly 2× native 96px sprites
// iOS/Safari (and therefore every iOS browser, incl. Chrome) caps a canvas's
// backing store at ~16.7M px (4096²). Past it, canvas ops silently no-op and
// toBlob never fires its callback — the export spinner hangs forever. The
// with-stats export at SCALE=4 (~4400×4900 ≈ 21.6M px) exceeds this, so we cap
// the area and derive the effective scale from it. Margin under the hard limit.
const MAX_CANVAS_AREA = 16_000_000;

// ---------- Footer insight computation ----------

/** National type frequency baseline — proportion of national-dex Pokemon that have each type */
let _nationalTypeFreq: Map<string, number> | null = null;

function getNationalTypeFreq(): Map<string, number> {
  if (_nationalTypeFreq) return _nationalTypeFreq;
  const all = getAllPokemon();
  const freq = new Map<string, number>();
  for (const p of all) {
    for (const t of p.types) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  const total = all.length;
  for (const [t, count] of freq) freq.set(t, count / total);
  _nationalTypeFreq = freq;
  return freq;
}

/** National generation frequency baseline */
let _nationalGenFreq: Map<number, number> | null = null;

function getNationalGenFreq(): Map<number, number> {
  if (_nationalGenFreq) return _nationalGenFreq;
  const all = getAllPokemon();
  const freq = new Map<number, number>();
  for (const p of all) freq.set(p.generation, (freq.get(p.generation) ?? 0) + 1);
  const total = all.length;
  for (const [g, count] of freq) freq.set(g, count / total);
  _nationalGenFreq = freq;
  return freq;
}

interface FooterInsights {
  /** Up to 2 most over-indexed types (>1.5x in both full and legend-excluded pools), desc by ratio */
  leanTypes: TypeName[];
  /** Up to 2 most over-indexed generations (>1.3x vs national), desc by ratio */
  leanGens: number[];
  /** Attacking type with highest positive deviation from national baseline; only if deviation ≥ 0.25 in both full and legend-excluded pools */
  bestAttackType?: TypeName;
}

/** Compute type over-index ratios for a pool of Pokemon vs national type frequencies */
function typeOverIndexRatios(pool: Pokemon[], nationalTypeFreq: Map<string, number>): Map<string, number> {
  const count = new Map<string, number>();
  for (const p of pool) {
    for (const t of p.types) count.set(t, (count.get(t) ?? 0) + 1);
  }
  const total = pool.length;
  const ratios = new Map<string, number>();
  for (const [t, c] of count) {
    const natRatio = nationalTypeFreq.get(t) ?? 0;
    if (natRatio > 0) ratios.set(t, (c / total) / natRatio);
  }
  return ratios;
}

function computeFooterInsights(pokemon: Pokemon[]): FooterInsights {
  if (pokemon.length < 15) return { leanTypes: [], leanGens: [] };

  const nationalTypeFreq = getNationalTypeFreq();

  // Type lean — must be >1.5x in both the full pool AND the legend/mythical-excluded pool.
  const ratiosAll = typeOverIndexRatios(pokemon, nationalTypeFreq);
  const filtered = withoutSpecials(pokemon);
  const ratiosFiltered = filtered.length >= 10
    ? typeOverIndexRatios(filtered, nationalTypeFreq)
    : ratiosAll;

  const qualifyingTypes: { type: TypeName; ratio: number }[] = [];
  for (const [t, ratioAll] of ratiosAll) {
    const ratioFilt = ratiosFiltered.get(t) ?? 0;
    if (ratioAll > 1.5 && ratioFilt > 1.5) {
      qualifyingTypes.push({ type: t as TypeName, ratio: ratioAll });
    }
  }
  qualifyingTypes.sort((a, b) => b.ratio - a.ratio);
  const leanTypes = qualifyingTypes.slice(0, 2).map(x => x.type);

  // Gen lean — up to 2 most over-represented generations vs national baseline (>1.3x threshold).
  const nationalGenFreq = getNationalGenFreq();
  const regionGenCount = new Map<number, number>();
  for (const p of pokemon) regionGenCount.set(p.generation, (regionGenCount.get(p.generation) ?? 0) + 1);
  const total = pokemon.length;
  const qualifyingGens: { gen: number; ratio: number }[] = [];
  for (const [g, count] of regionGenCount) {
    const natRatio = nationalGenFreq.get(g) ?? 0;
    if (natRatio > 0) {
      const ratio = (count / total) / natRatio;
      if (ratio > 1.3) qualifyingGens.push({ gen: g, ratio });
    }
  }
  qualifyingGens.sort((a, b) => b.ratio - a.ratio);
  const leanGens = qualifyingGens.slice(0, 2).map(x => x.gen);

  // Attacking type with highest deviation from national baseline — only if ≥ 0.25
  // in both the full pool AND the legend/mythical/starter-excluded pool (filters out
  // advantages that only exist because of legendary/mythical picks).
  // Uses the same baselines as the analytics chart's exclude-special toggle, so the
  // export result matches what the user sees in the chart.
  const dominanceFull = computeTypeDominance(pokemon);
  const filteredForOverperform = withoutSpecials(pokemon, STARTER_IDS);
  const dominanceFiltered = filteredForOverperform.length >= 10
    ? computeTypeDominance(filteredForOverperform)
    : dominanceFull;
  const dominanceFilteredMap = new Map(dominanceFiltered.map(d => [d.type, d.score]));
  const nationalBaseline = getNationalBaseline();
  const nationalBaselineFiltered = getNationalBaselineFiltered(STARTER_IDS);
  let bestDeviation = 0;
  let bestAttackType: TypeName | undefined;
  for (const { type, score } of dominanceFull) {
    const natScore = nationalBaseline.get(type) ?? 0;
    const natScoreFilt = nationalBaselineFiltered.get(type) ?? natScore;
    const devFull = score - natScore;
    const devFilt = (dominanceFilteredMap.get(type) ?? score) - natScoreFilt;
    if (devFull >= 0.25 && devFilt >= 0.25) {
      const minDev = Math.min(devFull, devFilt);
      if (minDev > bestDeviation) {
        bestDeviation = minDev;
        bestAttackType = type;
      }
    }
  }

  return { leanTypes, leanGens, bestAttackType };
}

/** Load an image by URL, returns a promise. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Load an image that may not exist; resolves to null on missing src or error. */
function maybeLoadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return loadImage(src).catch(() => null);
}

/** Draw a type-colored pokeball behind a sprite tile, rotated to match view page. */
function drawPokeball(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  primary: string,
  secondary: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ROTATION);

  // Colored fills at reduced opacity
  ctx.globalAlpha = 0.33;

  // Top half — primary type
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = primary;
  ctx.fill();

  // Bottom half — secondary type
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = secondary;
  ctx.fill();

  ctx.globalAlpha = 1;

  // Gap strokes to cleanly separate halves (white to match background)
  ctx.strokeStyle = BG;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.closePath();
  ctx.stroke();

  // Center button
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = BG;
  ctx.fill();
  ctx.strokeStyle = BG;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Divider line
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.strokeStyle = BG;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

/**
 * Render the user's Pokemon list as a sharp PNG image blob.
 * Mirrors the view page: 10-column grid, type-colored rotated pokeball
 * backgrounds, last row centered. No empty placeholders.
 * Rendered at 4x with pixel-perfect sprite scaling.
 *
 * When `options.sections` is provided, the build-section outlines (fills,
 * borders, dotted continuation tails, titles and corner spandrels) are drawn
 * over the grid — matching the View page's outline overlay — using the shared
 * geometry in src/lib/sectionOutlines.ts and a gapped/banded layout.
 */
export async function generateExportImage(
  pokemon: Pokemon[],
  options: {
    sections?: Record<string, number[]> | null;
    /** Detailed-stats data to redraw (natively) to the right of the grid. */
    stats?: { data: DetailedStatsData; heights: StatsHeights } | null;
  } = {},
): Promise<Blob> {
  const count = pokemon.length;
  if (count === 0) throw new Error('No Pokemon to export');

  const sections = options.sections ?? null;
  const statsData = options.stats?.data ?? null;
  const statsHeights = options.stats?.heights ?? null;

  // --- Outline geometry (only when section outlines are enabled) -----------
  let outline: {
    gridSlots: number;
    lastRowGeom: { index: number; count: number; offsetCols: number } | null;
    lastRowIndex: number;
    pitch: number;
    ox: number;
    oy: number;
    shapes: OutlineShape[];
    spandrels: Spandrel[];
    tileTop: (r: number) => number;
    spandrelTypes: TypeName[];
  } | null = null;

  // Canvas dimensions + where the footer begins.
  let w: number;
  let h: number;
  let footerTop: number;

  // Canvas text metrics for title fitting / stats wrapping need the real font.
  if ((sections || statsData) && typeof document !== 'undefined' && document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* fall back to metrics-as-is */ }
  }

  if (sections) {
    const oLayout = computeOutlineLayout(pokemon, sections, count, COLS);
    const gap = TILE * OUTLINE_GAP;
    const pad = TILE * OUTLINE_PAD;
    const headroom = TILE * OUTLINE_HEAD;
    const pitch = TILE + gap;
    const startRows = oLayout.bandRows;
    const { shapes, spandrels } = buildOutlines(
      oLayout.allRuns, COLS, TILE, startRows, headroom, gap, pad,
      OUTLINE_TITLE_VBIAS, oLayout.lastRowGeom, OUTLINE_STROKE_FRAC,
    );
    // Row tops mirror buildOutlines' blockTop/tileTop (bands push start rows down).
    const blockTop: number[] = new Array(oLayout.totalRows + 1).fill(0);
    for (let r = 1; r <= oLayout.totalRows; r++) {
      blockTop[r] = blockTop[r - 1] + (startRows.has(r - 1) ? headroom : 0) + TILE + gap;
    }
    const tileTop = (r: number) => blockTop[r] + (startRows.has(r) ? headroom : 0);

    const contentH = oLayout.rowFactor * TILE;
    w = oLayout.colFactor * TILE + PAD_X * 2;
    h = PAD_TOP + contentH + PAD_BOTTOM;
    footerTop = PAD_TOP + contentH;

    outline = {
      gridSlots: oLayout.gridSlots,
      lastRowGeom: oLayout.lastRowGeom,
      lastRowIndex: oLayout.lastRowIndex,
      pitch,
      ox: PAD_X + pad,
      oy: PAD_TOP + pad,
      shapes,
      spandrels,
      tileTop,
      spandrelTypes: [...new Set(spandrels.map((s) => s.type).filter((t): t is TypeName => t !== null))],
    };
  } else {
    const fullRows = Math.floor(count / COLS);
    const lastRowCount = count % COLS;
    const totalRows = fullRows + (lastRowCount > 0 ? 1 : 0);
    w = COLS * TILE + PAD_X * 2;
    h = PAD_TOP + totalRows * TILE + PAD_BOTTOM;
    footerTop = PAD_TOP + totalRows * TILE;
  }

  // Compute footer insights before loading images so we know which icons to fetch
  const insights = computeFooterInsights(pokemon);

  // Load sprites + footer icons (and any spandrel type masks) in parallel
  const [sprites, leanType1Img, leanType2Img, leanGen1Img, leanGen2Img, attackTypeImg, maskImgs] = await Promise.all([
    Promise.all(pokemon.map((p) => loadImage(p.sprite).catch(() => null))),
    maybeLoadImage(insights.leanTypes[0] ? typeIconPath(insights.leanTypes[0]) : null),
    maybeLoadImage(insights.leanTypes[1] ? typeIconPath(insights.leanTypes[1]) : null),
    maybeLoadImage(insights.leanGens[0] != null ? (GEN_BADGE_URIS[insights.leanGens[0]] ?? null) : null),
    maybeLoadImage(insights.leanGens[1] != null ? (GEN_BADGE_URIS[insights.leanGens[1]] ?? null) : null),
    maybeLoadImage(insights.bestAttackType ? typeIconPath(insights.bestAttackType) : null),
    loadSpandrelMasks(outline?.spandrelTypes ?? []),
  ]);

  // Type-name badge sprites for the stats Type-Distribution chart.
  const statsBadges = new Map<string, HTMLImageElement>();
  if (statsData) {
    await Promise.all(
      statsBadgeUrls(statsData).map(async ({ type, url }) => {
        const img = await maybeLoadImage(url);
        if (img) statsBadges.set(type, img);
      }),
    );
  }

  // Detailed-stats panel (if requested): the grid is wrapped in a white card (like
  // the website) and the stats are drawn natively to its right, height-matched to
  // the dex card. The grid is shifted in by the card padding; the canvas grows for
  // the card + stats. Grid-only exports skip the card entirely (unchanged white).
  const statsLayout = (() => {
    if (!statsData || !statsHeights) return null;
    const mc = document.createElement('canvas').getContext('2d');
    return mc ? measureStatsPanel(mc, statsData, statsHeights) : null;
  })();
  const statsNatH = statsLayout?.h ?? 0;
  const willCard = !!(statsData && statsNatH > 0);
  // Outer margins: roomy when carded (so card shadows aren't clipped at the canvas
  // edge), tight otherwise (unchanged grid-only export).
  const mx = willCard ? CARD_SHADOW_ROOM : PAD_X;
  const my = willCard ? CARD_SHADOW_ROOM : PAD_TOP;
  const dexContentW = w - PAD_X * 2;
  const dexContentH = footerTop - PAD_TOP;
  // Dex-card inner padding. When stats are present, match it to the stat cards'
  // padding in final-image units (= STATS_CARD_PADX × statsScale) so all cards
  // share the same content-to-edge spacing. statsScale depends on dexCardH which
  // depends on the pad, so solve the resulting equation in closed form:
  //   pad = P·dexContentH / (statsNatH − 2P),  where P = STATS_CARD_PADX.
  const cardPad = willCard
    ? Math.max(4, (STATS_CARD_PADX * dexContentH) / (statsNatH - 2 * STATS_CARD_PADX))
    : 0;
  const dexCardW = dexContentW + cardPad * 2;
  const dexCardH = dexContentH + cardPad * 2;

  // Scale the natural-width panel so its height matches the dex card.
  const statsScale = willCard ? dexCardH / statsNatH : 0;
  // Horizontal gutter between the dex card and the stats column == the vertical
  // gutter between the stat cards (CARD_GAP, scaled), so all gutters are uniform.
  const STATS_GAP = STATS_CARD_GAP * statsScale;
  const stats = willCard
    ? { x: mx + dexCardW + STATS_GAP, y: my, w: STATS_NAT_W * statsScale, h: dexCardH, scale: statsScale }
    : null;
  const canvasW = stats ? stats.x + stats.w + mx : w;

  // Footer sits below the dex card (a clear gap, like the app footer below the
  // fold), centered under the whole image rather than just the grid. The stats
  // export shows a single, larger credit line (the charts already convey the
  // type/gen lean), so it gets a taller band for legibility.
  const footerSep = stats ? 22 : 0;
  const footerBandH = stats ? 40 : PAD_BOTTOM;
  const footerCenterX = canvasW / 2;
  footerTop = my + dexCardH;
  h = footerTop + footerSep + footerBandH;

  // Cap the backing store to the iOS canvas-area limit. At 151 + stats this pulls
  // SCALE 4 down to ~3.4; grid-only stays at 4 (it's well under the cap).
  const expScale = Math.min(SCALE, Math.sqrt(MAX_CANVAS_AREA / (canvasW * h)));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(canvasW * expScale);
  canvas.height = Math.round(h * expScale);
  const ctx = canvas.getContext('2d')!;

  // Scale everything for sharp rendering (≤ SCALE, lowered when capped above).
  ctx.scale(expScale, expScale);
  ctx.imageSmoothingEnabled = false;

  // Background. With the stats panel present, use the app's muted page background
  // (not pure white) so the white cards read as cards — matching the website. A
  // grid-only export stays white.
  ctx.fillStyle = stats ? PAGE_BG : BG;
  ctx.fillRect(0, 0, canvasW, h);

  // Dex card behind the grid (white rounded rect + soft shadow), matching the
  // stat cards. Drawn before the grid; the grid is then shifted in by cardPad.
  if (cardPad > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = CARD_BG;
    ctx.beginPath();
    ctx.roundRect(mx, my, dexCardW, dexCardH, CARD_RADIUS);
    ctx.fill();
    ctx.restore();
  }

  // Shift the grid to sit inside the card (no-op when not carded: mx=PAD_X,
  // my=PAD_TOP, cardPad=0). drawTile maps through the live transform, so sprites
  // follow this translate too.
  ctx.save();
  ctx.translate(mx + cardPad - PAD_X, my + cardPad - PAD_TOP);

  // No top header — content starts immediately after PAD_TOP breathing room.

  if (outline) {
    // Outlined grid: tiles sit on the gapped/banded layout, then the section
    // outlines are drawn on top (matching the View page's overlay).
    const { ox, oy, pitch, gridSlots, lastRowGeom, lastRowIndex, tileTop } = outline;
    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      if (i < gridSlots) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        x = ox + col * pitch;
        y = oy + tileTop(row);
      } else {
        const c = i - gridSlots;
        const off = lastRowGeom ? lastRowGeom.offsetCols * pitch : 0;
        x = ox + off + c * pitch;
        y = oy + tileTop(lastRowIndex);
      }
      drawTile(ctx, x, y, pokemon[i], sprites[i], i + 1);
    }
    drawOutlines(ctx, outline.shapes, outline.spandrels, ox, oy, maskImgs);
  } else {
    const fullRows = Math.floor(count / COLS);
    const lastRowCount = count % COLS;

    // Draw full rows (left-aligned in grid)
    for (let i = 0; i < fullRows * COLS; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = PAD_X + col * TILE;
      const y = PAD_TOP + row * TILE;
      drawTile(ctx, x, y, pokemon[i], sprites[i], i + 1);
    }

    // Draw last partial row (centered)
    if (lastRowCount > 0) {
      const lastRowW = lastRowCount * TILE;
      const lastRowX = (w - lastRowW) / 2;
      for (let i = 0; i < lastRowCount; i++) {
        const idx = fullRows * COLS + i;
        const x = lastRowX + i * TILE;
        const y = PAD_TOP + fullRows * TILE;
        drawTile(ctx, x, y, pokemon[idx], sprites[idx], idx + 1);
      }
    }
  }

  ctx.restore(); // end grid translate

  // Detailed-stats panel to the right of the grid — drawn natively (NOT via
  // html-to-image, which hangs/fails on iOS).
  if (stats && statsData && statsHeights && statsLayout) {
    // Card backgrounds drawn in the export's logical space so their corner radius
    // and soft shadow match the dex card exactly (same CARD_RADIUS + shadow).
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = CARD_BG;
    for (const c of statsLayout.cards) {
      ctx.beginPath();
      ctx.roundRect(stats.x, stats.y + c.y * stats.scale, STATS_NAT_W * stats.scale, c.h * stats.scale, CARD_RADIUS);
      ctx.fill();
    }
    ctx.restore();

    // Chart/text content scaled on top (smoothing on for anti-aliased charts +
    // badge images, then back off for the pixel sprites/footer icons).
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(stats.x, stats.y);
    ctx.scale(stats.scale, stats.scale);
    drawStatsPanel(ctx, statsData, statsBadges, statsHeights);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }

  // Footer: two lines — insights (top, normal size) + "made with my151.app"
  // (bottom, smaller so the credit reads quietly rather than as an ad).
  const line1Y = footerTop + footerSep + 10;
  const line2Y = footerTop + footerSep + 21;
  const zinc = '#a1a1aa';

  // Insights line — original sizes.
  const INSIGHTS_FONT = '600 8px "Inter Variable", system-ui, -apple-system, sans-serif';
  const TYPE_ICON_SZ = 9;   // logical px: square side for type icons
  const GEN_ICON_SZ = 11;   // logical px: gen badge circle
  const ICON_GAP = 2;       // gap after icon before next element

  // Credit line — smaller so it reads as a quiet credit.
  const CREDIT_FONT = '600 6px "Inter Variable", system-ui, -apple-system, sans-serif';

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // Segment types: text or image icon (with per-icon size)
  type Seg = { kind: 'text'; text: string; color: string } | { kind: 'icon'; img: HTMLImageElement; sz: number };
  const insightSegs: Seg[] = [];

  const isKanto151 = pokemon.length === 151 &&
    pokemon.every((p) => p.id >= 1 && p.id <= 151) &&
    new Set(pokemon.map((p) => p.id)).size === 151;

  const { leanTypes, leanGens } = insights;
  const noLean = leanTypes.length === 0 && leanGens.length === 0;
  const typeImgs = [leanType1Img, leanType2Img];
  const genImgs  = [leanGen1Img,  leanGen2Img];

  if (isKanto151) {
    insightSegs.push({ kind: 'text', text: 'The very best. Like no one ever was.', color: zinc });
    // Still show type lean (skip gen — obvious for Kanto) + attack insights
    if (leanTypes.length > 0 || insights.bestAttackType) {
      insightSegs.push({ kind: 'text', text: ' · ', color: zinc });
      if (leanTypes.length > 0) {
        for (let i = 0; i < leanTypes.length; i++) {
          if (i > 0) insightSegs.push({ kind: 'text', text: ' & ', color: zinc });
          const t = leanTypes[i];
          const img = typeImgs[i];
          if (img) insightSegs.push({ kind: 'icon', img, sz: TYPE_ICON_SZ });
          insightSegs.push({ kind: 'text', text: t.charAt(0).toUpperCase() + t.slice(1), color: TYPE_COLORS[t] });
        }
        insightSegs.push({ kind: 'text', text: '-forward', color: zinc });
        if (insights.bestAttackType) insightSegs.push({ kind: 'text', text: ' · ', color: zinc });
      }
      if (insights.bestAttackType) {
        const t = insights.bestAttackType;
        if (attackTypeImg) insightSegs.push({ kind: 'icon', img: attackTypeImg, sz: TYPE_ICON_SZ });
        insightSegs.push({ kind: 'text', text: t.charAt(0).toUpperCase() + t.slice(1), color: TYPE_COLORS[t] });
        insightSegs.push({ kind: 'text', text: ' over-performs', color: zinc });
      }
    }
  } else if (noLean && !insights.bestAttackType) {
    insightSegs.push({ kind: 'text', text: 'perfectly balanced dex', color: zinc });
  } else {
    // --- Lean section (types + gens) ---
    if (noLean) {
      insightSegs.push({ kind: 'text', text: 'no types or gens strongly over-index', color: zinc });
    } else {
      const leanItems: Seg[][] = [];
      for (let i = 0; i < leanTypes.length; i++) {
        const t = leanTypes[i];
        const item: Seg[] = [];
        const img = typeImgs[i];
        if (img) item.push({ kind: 'icon', img, sz: TYPE_ICON_SZ });
        item.push({ kind: 'text', text: t.charAt(0).toUpperCase() + t.slice(1), color: TYPE_COLORS[t] });
        leanItems.push(item);
      }
      for (let i = 0; i < leanGens.length; i++) {
        const g = leanGens[i];
        const item: Seg[] = [];
        const img = genImgs[i];
        if (img) item.push({ kind: 'icon', img, sz: GEN_ICON_SZ });
        item.push({ kind: 'text', text: `Gen ${g}`, color: zinc });
        leanItems.push(item);
      }
      for (let i = 0; i < leanItems.length; i++) {
        if (i > 0) {
          if (leanItems.length === 2) {
            insightSegs.push({ kind: 'text', text: ' & ', color: zinc });
          } else {
            insightSegs.push({ kind: 'text', text: i === leanItems.length - 1 ? ', & ' : ', ', color: zinc });
          }
        }
        insightSegs.push(...leanItems[i]);
      }
      insightSegs.push({ kind: 'text', text: '-forward', color: zinc });
    }

    // --- Attack section ---
    insightSegs.push({ kind: 'text', text: ' · ', color: zinc });
    if (insights.bestAttackType) {
      const t = insights.bestAttackType;
      if (attackTypeImg) insightSegs.push({ kind: 'icon', img: attackTypeImg, sz: TYPE_ICON_SZ });
      insightSegs.push({ kind: 'text', text: t.charAt(0).toUpperCase() + t.slice(1), color: TYPE_COLORS[t] });
      insightSegs.push({ kind: 'text', text: ' over-performs', color: zinc });
    } else {
      insightSegs.push({ kind: 'text', text: 'no types strongly over-perform', color: zinc });
    }
  }

  const creditSegs: Seg[] = [
    { kind: 'text', text: 'made with ', color: zinc },
    { kind: 'text', text: 'my151', color: '#DC2626' },
    { kind: 'text', text: '.app', color: '#0a0a0a' },
  ];

  const drawLine = (segs: Seg[], y: number, font: string) => {
    ctx.font = font;
    let totalW = 0;
    for (const seg of segs) {
      totalW += seg.kind === 'icon' ? (seg.sz + ICON_GAP) : ctx.measureText(seg.text).width;
    }
    let tx = footerCenterX - totalW / 2;
    for (const seg of segs) {
      if (seg.kind === 'icon') {
        ctx.drawImage(seg.img, tx, y - seg.sz / 2, seg.sz, seg.sz);
        tx += seg.sz + ICON_GAP;
      } else {
        ctx.fillStyle = seg.color;
        ctx.fillText(seg.text, tx, y);
        tx += ctx.measureText(seg.text).width;
      }
    }
  };

  if (stats) {
    // Stats export: the charts already convey the type/gen lean, so drop the
    // insights line and show just a larger, legible "made with my151.app" credit,
    // vertically centred in the footer band.
    const STATS_CREDIT_FONT = '600 13px "Inter Variable", system-ui, -apple-system, sans-serif';
    drawLine(creditSegs, footerTop + footerSep + footerBandH / 2, STATS_CREDIT_FONT);
  } else {
    drawLine(insightSegs, line1Y, INSIGHTS_FONT);
    drawLine(creditSegs, line2Y, CREDIT_FONT);
  }

  return new Promise<Blob>((resolve, reject) => {
    // Guard against iOS occasionally never invoking the toBlob callback (which
    // would hang the export spinner indefinitely).
    const timer = window.setTimeout(() => reject(new Error('Canvas toBlob timed out')), 15000);
    canvas.toBlob((blob) => {
      window.clearTimeout(timer);
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

/** Generate + load the recolourable alpha masks for the given spandrel types.
 *  Failures are skipped (the spandrel falls back to the 4-point star). */
async function loadSpandrelMasks(types: TypeName[]): Promise<Map<TypeName, HTMLImageElement>> {
  const out = new Map<TypeName, HTMLImageElement>();
  await Promise.all(
    types.map(async (t) => {
      try {
        const url = await ensureTypeMask(t);
        const img = await loadImage(url);
        out.set(t, img);
      } catch {
        /* keep falling back to the star */
      }
    }),
  );
  return out;
}

/** Draw the section outlines onto the canvas, in the outline coordinate system
 *  translated by (ox, oy). Mirrors the View page's SectionOverlays SVG render:
 *  faint fills (fading on open edges), 20%-opacity borders, dotted continuation
 *  tails, corner spandrels (type icon or 4-point star), and fitted titles. */
function drawOutlines(
  ctx: CanvasRenderingContext2D,
  shapes: OutlineShape[],
  spandrels: Spandrel[],
  ox: number,
  oy: number,
  maskImgs: Map<TypeName, HTMLImageElement>,
) {
  const fontSize = TILE * 0.26;
  const strokeW = outlineStrokeW(TILE, OUTLINE_STROKE_FRAC);
  const dotTail = 6 * strokeW;

  ctx.save();
  ctx.translate(ox, oy);

  // Fills — open pieces fade toward their open edge, closed pieces are uniform.
  for (const s of shapes) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    if (s.open) {
      const right = s.open.side === 'right';
      const gx1 = right ? s.open.x1 - dotTail : s.open.x0 + dotTail;
      const gx2 = right ? s.open.x1 : s.open.x0;
      const grad = ctx.createLinearGradient(gx1, 0, gx2, 0);
      grad.addColorStop(0, s.fillColor);
      grad.addColorStop(1, s.fillColor + '00');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = s.fillColor;
    }
    ctx.fill(new Path2D(s.fill), 'evenodd');
    ctx.restore();
  }

  // Borders.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = strokeW;
  for (const s of shapes) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = s.strokeColor;
    ctx.stroke(new Path2D(s.stroke));
    ctx.restore();
  }

  // Dotted continuation tails on open edges.
  for (const s of shapes) {
    if (!s.open) continue;
    const edge = s.open.side === 'right' ? s.open.x1 : s.open.x0;
    const dir = s.open.side === 'right' ? -1 : 1;
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = s.strokeColor;
    for (let i = 0; i < 3; i++) {
      for (const cy of [s.open.topY, s.open.botY]) {
        ctx.beginPath();
        ctx.arc(edge + dir * (0.5 + 2 * i) * strokeW, cy, strokeW / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Spandrels: recoloured type icon where its mask loaded, else a 4-point star.
  for (const sp of spandrels) {
    const img = sp.type ? maskImgs.get(sp.type) : undefined;
    if (img) {
      const size = sp.r * 2;
      const px = Math.max(1, Math.round(size * SCALE));
      const tmp = document.createElement('canvas');
      tmp.width = px;
      tmp.height = px;
      const tctx = tmp.getContext('2d');
      if (tctx) {
        tctx.imageSmoothingEnabled = true;
        const iw = img.naturalWidth || 1;
        const ih = img.naturalHeight || 1;
        const scale = Math.min(px / iw, px / ih); // contain-fit, centred
        const dw = iw * scale;
        const dh = ih * scale;
        tctx.drawImage(img, (px - dw) / 2, (px - dh) / 2, dw, dh);
        tctx.globalCompositeOperation = 'source-in';
        tctx.fillStyle = sp.color;
        tctx.fillRect(0, 0, px, px);
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(tmp, sp.cx - size / 2, sp.cy - size / 2, size, size);
        ctx.restore();
      }
    } else {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = sp.color;
      ctx.fill(new Path2D(starPath(sp.cx, sp.cy, sp.r)));
      ctx.restore();
    }
  }

  // Titles — uppercase, weight 900, fitted (squash/stretch) to their outline.
  for (const s of shapes) {
    if (!s.label) continue;
    if (!OUTLINE_REPEAT_TITLES && s.isContinuation) continue;
    const alts = OUTLINE_SHORTEN_TITLES ? s.labelAlts : [s.labelAlts[0]];
    const fit = fitLabel(alts, s.labelMaxW, fontSize);
    ctx.save();
    ctx.translate(s.labelX, s.labelY);
    ctx.scale(fit.scaleX, 1);
    ctx.font = `900 ${fontSize}px 'Inter Variable', system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.globalAlpha = OUTLINE_TITLE_OPACITY;
    ctx.fillStyle = s.strokeColor;
    ctx.fillText(fit.text.toUpperCase(), 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pokemon: Pokemon,
  sprite: HTMLImageElement | null,
  positionNum: number,
) {
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  const r = TILE * 0.42;
  const primary = TYPE_COLORS[pokemon.types[0] as TypeName];
  const secondary = TYPE_COLORS[(pokemon.types[1] ?? pokemon.types[0]) as TypeName];

  drawPokeball(ctx, cx, cy, r, primary, secondary);

  if (sprite) {
    // Draw sprite at exact integer multiple of native resolution to preserve
    // pixel art without aliasing artifacts. We reset to the identity transform
    // (raw canvas pixels) for this, so map the tile centre through the *current*
    // transform first — otherwise any active translate (e.g. the dex-card offset)
    // is dropped and the sprite drifts off its pokeball.
    ctx.save();
    const m = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset to identity (canvas pixels)
    // Size the sprite from the *live* scale (m.a), not the SCALE constant, so it
    // tracks the effective scale when the canvas area is capped (iOS).
    const drawSize = SPRITE * m.a; // = 2× native 96px at full SCALE
    const sx = m.a * cx + m.c * cy + m.e - drawSize / 2;
    const sy = m.b * cx + m.d * cy + m.f - drawSize / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, sx, sy, drawSize, drawSize);
    ctx.restore();
  }

  // Position number in top-left corner — matches view page styling
  const numFontSize = TILE * 0.12; // ~5.76 logical px
  ctx.save();
  ctx.font = `600 ${numFontSize}px "Inter Variable", system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(10, 10, 10, 0.4)';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`${positionNum}.`, x + 1.5, y + 2.5);
  ctx.restore();
}

/** Share via native share sheet (mobile gallery save) or fall back to file download. */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });

  // Skip the share sheet on Android: its system share sheet is an app picker
  // with no obvious "Save to device" action, leaving users stuck (they end up
  // emailing the file to themselves to download it). Going straight to the
  // download path drops the file into /Downloads, which most Android galleries
  // auto-scan. iOS keeps the share path because its share sheet has a one-tap
  // "Save Image" that goes straight to Photos — strictly better than a
  // browser-tab preview, which is what <a download> falls back to on iOS.
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (!isAndroid && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
