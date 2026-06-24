import type { Pokemon, TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { computeTypeDominance, getNationalBaseline, getNationalBaselineFiltered } from '@/hooks/useTypeDominance';
import { getAllPokemon, withoutSpecials } from '@/hooks/usePokemonData';
import { typeIconPath } from '@/data/type-ids';
import { GEN_BADGE_URIS } from '@/components/shared/GenBadge';
import { STARTER_IDS } from '@/data/categories';

const COLS = 10;
const TILE = 48;
const SPRITE_SRC = 96; // native sprite resolution
const SPRITE = SPRITE_SRC / 2; // logical draw size = 48px (1:1 with tile)
const PAD_X = 12;
const PAD_TOP = 8;
const PAD_BOTTOM = 28;
const BG = '#ffffff';
const ROTATION = -30 * (Math.PI / 180); // match view page -rotate-[30deg]
const SCALE = 4; // SPRITE * SCALE = 192 = exactly 2× native 96px sprites

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
 */
export async function generateExportImage(
  pokemon: Pokemon[],
): Promise<Blob> {
  const count = pokemon.length;
  if (count === 0) throw new Error('No Pokemon to export');

  const fullRows = Math.floor(count / COLS);
  const lastRowCount = count % COLS;
  const totalRows = fullRows + (lastRowCount > 0 ? 1 : 0);

  const gridW = COLS * TILE;
  const w = gridW + PAD_X * 2;
  const h = PAD_TOP + totalRows * TILE + PAD_BOTTOM;

  // Compute footer insights before loading images so we know which icons to fetch
  const insights = computeFooterInsights(pokemon);

  // Load sprites + footer icons in parallel
  const [sprites, leanType1Img, leanType2Img, leanGen1Img, leanGen2Img, attackTypeImg] = await Promise.all([
    Promise.all(pokemon.map((p) => loadImage(p.sprite).catch(() => null))),
    maybeLoadImage(insights.leanTypes[0] ? typeIconPath(insights.leanTypes[0]) : null),
    maybeLoadImage(insights.leanTypes[1] ? typeIconPath(insights.leanTypes[1]) : null),
    maybeLoadImage(insights.leanGens[0] != null ? (GEN_BADGE_URIS[insights.leanGens[0]] ?? null) : null),
    maybeLoadImage(insights.leanGens[1] != null ? (GEN_BADGE_URIS[insights.leanGens[1]] ?? null) : null),
    maybeLoadImage(insights.bestAttackType ? typeIconPath(insights.bestAttackType) : null),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext('2d')!;

  // Scale everything by 4x for sharp rendering
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = false;

  // White background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // No top header — content starts immediately after PAD_TOP breathing room.

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

  // Footer: two lines — insights (top, normal size) + "made with my151.app"
  // (bottom, smaller so the credit reads quietly rather than as an ad).
  const footerTop = PAD_TOP + totalRows * TILE;
  const line1Y = footerTop + 10;
  const line2Y = footerTop + 21;
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
    let tx = (w - totalW) / 2;
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

  drawLine(insightSegs, line1Y, INSIGHTS_FONT);
  drawLine(creditSegs, line2Y, CREDIT_FONT);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
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
    // Draw sprite at exact integer multiple of native resolution
    // to preserve pixel art without aliasing artifacts
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset to identity (canvas pixels)
    const drawSize = SPRITE * SCALE; // 192px = exactly 2× native 96px
    const sx = cx * SCALE - drawSize / 2;
    const sy = cy * SCALE - drawSize / 2;
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
