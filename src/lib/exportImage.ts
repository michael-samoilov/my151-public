import { sectionGlyphMask } from '@/lib/sectionGlyph';
import type { Pokemon, TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { computeTypeDominance, getNationalBaseline, getNationalBaselineFiltered } from '@/hooks/useTypeDominance';
import { getAllPokemon, withoutSpecials } from '@/hooks/usePokemonData';
import { drawTypeIcon } from '@/lib/drawTypeBadge';
import { GEN_BADGE_URIS } from '@/components/shared/GenBadge';
import { STARTER_IDS } from '@/data/categories';
import { expandTemplate } from '@/lib/richTemplate';
import { formatListToParts, raw, t, typeLabel } from '@/i18n';
import { measureStatsPanel, drawStatsPanel, type StatsHeights } from './exportStats';
import type { DetailedStatsData } from '@/components/view/useDetailedStatsData';
import {
  fitLabel,
  starPath,
  outlineStrokeW,
  type OutlineShape,
  type Spandrel,
  OUTLINE_STROKE_FRAC,
  OUTLINE_TITLE_OPACITY,
  OUTLINE_REPEAT_TITLES,
  OUTLINE_SHORTEN_TITLES,
} from '@/lib/sectionOutlines';
import {
  DEX_EXPORT_PAD_BOTTOM as PAD_BOTTOM,
  DEX_EXPORT_PAD_TOP as PAD_TOP,
  DEX_EXPORT_PAD_X as PAD_X,
  DEX_EXPORT_POKEBALL_R_FRAC,
  DEX_EXPORT_TILE as TILE,
  DEX_EXPORT_FRAME,
  DEX_EXPORT_HEADER,
  DEX_EXPORT_SCALE,
  layoutDexExportGrid,
} from '@/lib/dexExportLayout';
import { BAR_H, BAR_TEXT_X, FRAME, TITLE_PX, TITLE_TRACK } from '@/league/export/layout';
import { fillTracked, font } from '@/league/export/paint';
import { clipExportCanvas, exportInnerCornerRadius } from '@/lib/exportPngShape';
import { composeStatsExport } from './exportStatsFrame';

export const DEX_EXPORT_FRAME_RED = '#DC2626';

const SPRITE = TILE;
const BG = '#ffffff';
const ROTATION = -30 * (Math.PI / 180);
const SCALE = DEX_EXPORT_SCALE;
// platform: Every iOS browser caps a canvas backing store near 16.7M px; past it, canvas calls do nothing and toBlob never calls back.
const MAX_CANVAS_AREA = 16_000_000;

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
  leanTypes: TypeName[];
  leanGens: number[];
  bestAttackType?: TypeName;
}

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function maybeLoadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return loadImage(src).catch(() => null);
}

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

  ctx.globalAlpha = 0.33;

  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = primary;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = secondary;
  ctx.fill();

  ctx.globalAlpha = 1;

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

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = BG;
  ctx.fill();
  ctx.strokeStyle = BG;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.strokeStyle = BG;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

export async function generateExportImage(
  pokemon: Pokemon[],
  options: {
    sections?: Record<string, number[]> | null;
    stats?: { data: DetailedStatsData; heights: StatsHeights } | null;
  } = {},
): Promise<Blob> {
  const count = pokemon.length;
  if (count === 0) throw new Error('No Pokemon to export');

  const sections = options.sections ?? null;

  // platform: Canvas text measurement uses a fallback font until the web font loads, and a canvas never starts that load.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  if (options.stats) {
    const { data, heights } = options.stats;
    const base = await generateExportImage(pokemon, { sections });
    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) throw new Error('Canvas unavailable');
    const layout = measureStatsPanel(measure, data, heights);
    return composeStatsExport(base, layout, t('export.detailedStatsTitle'),
      ctx => drawStatsPanel(ctx, data, heights),
      { size: 6 * SCALE, bottomOffset: (DEX_EXPORT_FRAME + PAD_BOTTOM - 21) * SCALE });
  }

  const grid = layoutDexExportGrid(pokemon, sections);
  const outline = grid.outline;
  const w = grid.width;
  let h = grid.height;
  let footerTop = grid.footerTop;

  const insights = computeFooterInsights(pokemon);

  const [sprites, leanGen1Img, leanGen2Img, maskImgs] = await Promise.all([
    Promise.all(pokemon.map((p) => loadImage(p.sprite).catch(() => null))),
    maybeLoadImage(insights.leanGens[0] != null ? (GEN_BADGE_URIS[insights.leanGens[0]] ?? null) : null),
    maybeLoadImage(insights.leanGens[1] != null ? (GEN_BADGE_URIS[insights.leanGens[1]] ?? null) : null),
    loadSpandrelMasks(outline?.spandrelMasks ?? []),
  ]);

  const mx = PAD_X;
  const my = PAD_TOP;
  const dexContentH = footerTop - PAD_TOP;
  const dexCardH = dexContentH;
  const canvasW = w;
  const footerCenterX = canvasW / 2;
  footerTop = my + dexCardH;
  h = footerTop + PAD_BOTTOM;

  const framedW = canvasW + 2 * DEX_EXPORT_FRAME;
  const framedH = h + 2 * DEX_EXPORT_FRAME + DEX_EXPORT_HEADER;

  const expScale = Math.min(SCALE, Math.sqrt(MAX_CANVAS_AREA / (framedW * framedH)));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(framedW * expScale);
  canvas.height = Math.round(framedH * expScale);
  const ctx = canvas.getContext('2d')!;

  ctx.scale(expScale, expScale);
  ctx.imageSmoothingEnabled = false;
  clipExportCanvas(ctx, framedW, framedH);

  ctx.fillStyle = DEX_EXPORT_FRAME_RED;
  ctx.fillRect(0, 0, framedW, framedH);
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.roundRect(
    DEX_EXPORT_FRAME,
    DEX_EXPORT_FRAME + DEX_EXPORT_HEADER,
    canvasW,
    h,
    [0, 0, exportInnerCornerRadius(framedW, framedH, DEX_EXPORT_FRAME), exportInnerCornerRadius(framedW, framedH, DEX_EXPORT_FRAME)],
  );
  ctx.fill();
  ctx.save();
  ctx.font = font(TITLE_PX / SCALE, 800);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const cap = ctx.measureText('H').actualBoundingBoxAscent || TITLE_PX / SCALE * 0.72;
  fillTracked(ctx, t('export.dexTitle'), (FRAME + BAR_TEXT_X) / SCALE,
    BAR_H / SCALE / 2 + cap / 2, TITLE_TRACK / SCALE);
  ctx.restore();
  ctx.translate(DEX_EXPORT_FRAME, DEX_EXPORT_FRAME + DEX_EXPORT_HEADER);

  ctx.save();
  ctx.translate(mx - PAD_X, my - PAD_TOP);

  for (const placed of grid.sprites) {
    drawTile(ctx, placed.x, placed.y, placed.pokemon, sprites[placed.index], placed.index + 1);
  }
  if (outline) {
    drawOutlines(ctx, outline.shapes, outline.spandrels, outline.ox, outline.oy, maskImgs);
  }

  ctx.restore();

  const line1Y = footerTop + 10;
  const line2Y = footerTop + 21;
  const zinc = '#a1a1aa';

  const INSIGHTS_FONT = '600 8px "Inter Variable", system-ui, -apple-system, sans-serif';
  const TYPE_ICON_SZ = 9;
  const GEN_ICON_SZ = 11;
  const ICON_GAP = 2;

  const CREDIT_FONT = '600 6px "Inter Variable", system-ui, -apple-system, sans-serif';

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  type Seg = { kind: 'text'; text: string; color: string } | { kind: 'icon'; draw: (x: number, y: number) => void; sz: number };
  const typeIcon = (type: TypeName): Seg => ({ kind: 'icon', draw: (x, y) => drawTypeIcon(ctx, type, x, y, TYPE_ICON_SZ), sz: TYPE_ICON_SZ });
  const insightSegs: Seg[] = [];

  const isKanto151 = pokemon.length === 151 &&
    pokemon.every((p) => p.id >= 1 && p.id <= 151) &&
    new Set(pokemon.map((p) => p.id)).size === 151;

  const { leanTypes, leanGens } = insights;
  const noLean = leanTypes.length === 0 && leanGens.length === 0;
  const genImgs  = [leanGen1Img,  leanGen2Img];

  const leanItem = (i: number): Seg[] => {
    if (i < leanTypes.length) {
      const type = leanTypes[i];
      return [typeIcon(type), { kind: 'text' as const, text: typeLabel(type), color: TYPE_COLORS[type] }];
    }
    const g = leanGens[i - leanTypes.length];
    const img = genImgs[i - leanTypes.length];
    return [
      ...(img ? [{ kind: 'icon' as const, draw: (x: number, y: number) => ctx.drawImage(img, x, y, GEN_ICON_SZ, GEN_ICON_SZ), sz: GEN_ICON_SZ }] : []),
      { kind: 'text' as const, text: t('browser.genChip', { gen: g }), color: zinc },
    ];
  };

  const leanSubjects = (): Seg[] => {
    const count = leanTypes.length + leanGens.length;
    return formatListToParts(Array.from({ length: count }, (_, i) => String(i))).flatMap((part) =>
      part.type === 'element'
        ? leanItem(Number(part.value))
        : [{ kind: 'text' as const, text: part.value, color: zinc }],
    );
  };

  const attackSubject = (): Seg[] => {
    const type = insights.bestAttackType!;
    return [typeIcon(type), { kind: 'text' as const, text: typeLabel(type), color: TYPE_COLORS[type] }];
  };

  const plain = (text: string): Seg => ({ kind: 'text', text, color: zinc });
  const sep = () => insightSegs.push(plain(t('poster.separator')));

  if (isKanto151) {
    insightSegs.push(plain(t('poster.kanto151')));
    if (leanTypes.length > 0 || insights.bestAttackType) {
      sep();
      if (leanTypes.length > 0) {
        insightSegs.push(...expandTemplate(raw('poster.leanForward'), plain, { types: leanSubjects }));
        if (insights.bestAttackType) sep();
      }
      if (insights.bestAttackType) {
        insightSegs.push(...expandTemplate(raw('poster.overPerforms'), plain, { type: attackSubject }));
      }
    }
  } else if (noLean && !insights.bestAttackType) {
    insightSegs.push(plain(t('poster.balanced')));
  } else {
    if (noLean) {
      insightSegs.push(plain(t('poster.noLean')));
    } else {
      insightSegs.push(...expandTemplate(raw('poster.leanForward'), plain, { types: leanSubjects }));
    }
    sep();
    if (insights.bestAttackType) {
      insightSegs.push(...expandTemplate(raw('poster.overPerforms'), plain, { type: attackSubject }));
    } else {
      insightSegs.push(plain(t('poster.noOverPerform')));
    }
  }

  const creditSegs: Seg[] = expandTemplate(raw('poster.credit'), plain, {
    app: () => [
      { kind: 'text', text: 'my151', color: '#DC2626' },
      { kind: 'text', text: '.app', color: '#0a0a0a' },
    ],
  });

  const drawLine = (segs: Seg[], y: number, font: string) => {
    ctx.font = font;
    let totalW = 0;
    for (const seg of segs) {
      totalW += seg.kind === 'icon' ? (seg.sz + ICON_GAP) : ctx.measureText(seg.text).width;
    }
    let tx = footerCenterX - totalW / 2;
    for (const seg of segs) {
      if (seg.kind === 'icon') {
        seg.draw(tx, y - seg.sz / 2);
        tx += seg.sz + ICON_GAP;
      } else {
        ctx.fillStyle = seg.color;
        ctx.fillText(seg.text, tx, y);
        tx += ctx.measureText(seg.text).width;
      }
    }
  };

  drawLine(insightSegs, line1Y, INSIGHTS_FONT);
  drawLine(creditSegs, line2Y, CREDIT_FONT);

  return new Promise<Blob>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Canvas toBlob timed out')), 15000);
    canvas.toBlob((blob) => {
      window.clearTimeout(timer);
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

async function loadSpandrelMasks(urls: string[]): Promise<Map<string, HTMLImageElement>> {
  const out = new Map<string, HTMLImageElement>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const img = await loadImage(url);
        out.set(url, img);
      } catch {
        return;
      }
    }),
  );
  return out;
}

function drawOutlines(
  ctx: CanvasRenderingContext2D,
  shapes: OutlineShape[],
  spandrels: Spandrel[],
  ox: number,
  oy: number,
  maskImgs: Map<string, HTMLImageElement>,
) {
  const fontSize = TILE * 0.26;
  const strokeW = outlineStrokeW(TILE, OUTLINE_STROKE_FRAC);
  const dotTail = 6 * strokeW;

  ctx.save();
  ctx.translate(ox, oy);

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

  for (const sp of spandrels) {
    const mask = sectionGlyphMask(sp.sectionId);
    const img = mask ? maskImgs.get(mask) : undefined;
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
        const scale = Math.min(px / iw, px / ih);
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
  const r = TILE * DEX_EXPORT_POKEBALL_R_FRAC;
  const primary = TYPE_COLORS[pokemon.types[0] as TypeName];
  const secondary = TYPE_COLORS[(pokemon.types[1] ?? pokemon.types[0]) as TypeName];

  drawPokeball(ctx, cx, cy, r, primary, secondary);

  if (sprite) {
    ctx.save();
    const m = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const drawSize = SPRITE * m.a;
    const sx = m.a * cx + m.c * cy + m.e - drawSize / 2;
    const sy = m.b * cx + m.d * cy + m.f - drawSize / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, sx, sy, drawSize, drawSize);
    ctx.restore();
  }

  const numFontSize = TILE * 0.12;
  ctx.save();
  ctx.font = `600 ${numFontSize}px "Inter Variable", system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(10, 10, 10, 0.4)';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`${positionNum}.`, x + 1.5, y + 2.5);
  ctx.restore();
}

export { isShareAbort, shareOrDownload } from './shareOrDownload';
