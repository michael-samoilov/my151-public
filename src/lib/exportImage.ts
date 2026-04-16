import type { Pokemon, TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { computeTypeDominance, getNationalBaseline } from '@/hooks/useTypeDominance';
import { getAllPokemon } from '@/hooks/usePokemonData';
import { typeIconPath } from '@/data/type-ids';
import { GEN_BADGE_URIS } from '@/components/shared/GenBadge';

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
  /** Most over-indexed type relative to national dex (>1.5x in both full and filtered pools) */
  leanType?: TypeName;
  /** True when no type exceeds 1.5x over-representation in both pools */
  noTypesOverIndex: boolean;
  /** Most over-indexed generation relative to national dex */
  leanGen?: number;
  /** Attacking type with highest advantage *deviation* from national baseline */
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
  if (pokemon.length < 15) return { noTypesOverIndex: false };

  const nationalTypeFreq = getNationalTypeFreq();

  // Type lean — must be >1.5x in both the full pool AND the pool excluding
  // legendary/mythical Pokemon (prevents starters/legends from inflating a type).
  const ratiosAll = typeOverIndexRatios(pokemon, nationalTypeFreq);
  const filtered = pokemon.filter(p => !p.isLegendary && !p.isMythical);
  const ratiosFiltered = filtered.length >= 10
    ? typeOverIndexRatios(filtered, nationalTypeFreq)
    : ratiosAll; // too few non-special mons — fall back to full pool

  let leanType: TypeName | undefined;
  let bestLean = 1.5; // threshold
  for (const [t, ratioAll] of ratiosAll) {
    const ratioFilt = ratiosFiltered.get(t) ?? 0;
    if (ratioAll > 1.5 && ratioFilt > 1.5 && ratioAll > bestLean) {
      bestLean = ratioAll;
      leanType = t as TypeName;
    }
  }
  const noTypesOverIndex = !leanType;

  // Gen lean — most over-represented generation vs national baseline
  const nationalGenFreq = getNationalGenFreq();
  const regionGenCount = new Map<number, number>();
  for (const p of pokemon) regionGenCount.set(p.generation, (regionGenCount.get(p.generation) ?? 0) + 1);
  const total = pokemon.length;
  let bestGenRatio = 1.3;
  let leanGen: number | undefined;
  for (const [g, count] of regionGenCount) {
    const natRatio = nationalGenFreq.get(g) ?? 0;
    if (natRatio > 0) {
      const ratio = (count / total) / natRatio;
      if (ratio > bestGenRatio) { bestGenRatio = ratio; leanGen = g; }
    }
  }

  // Advantaged attacking type — highest dominance score *deviation* from
  // national baseline (not absolute score, so Steel doesn't always win).
  const dominance = computeTypeDominance(pokemon);
  const nationalBaseline = getNationalBaseline();
  let bestDeviation = 0;
  let bestAttackType: TypeName | undefined;
  for (const { type, score } of dominance) {
    const natScore = nationalBaseline.get(type) ?? 0;
    const deviation = score - natScore;
    if (deviation > bestDeviation) {
      bestDeviation = deviation;
      bestAttackType = type;
    }
  }

  return { leanType, noTypesOverIndex, leanGen, bestAttackType };
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
  const [sprites, leanTypeImg, leanGenImg, attackTypeImg] = await Promise.all([
    Promise.all(pokemon.map((p) => loadImage(p.sprite).catch(() => null))),
    insights.leanType
      ? loadImage(typeIconPath(insights.leanType)).catch(() => null)
      : Promise.resolve(null),
    insights.leanGen != null && GEN_BADGE_URIS[insights.leanGen]
      ? loadImage(GEN_BADGE_URIS[insights.leanGen]).catch(() => null)
      : Promise.resolve(null),
    insights.bestAttackType
      ? loadImage(typeIconPath(insights.bestAttackType)).catch(() => null)
      : Promise.resolve(null),
  ] as const);

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
    drawTile(ctx, x, y, pokemon[i], sprites[i]);
  }

  // Draw last partial row (centered)
  if (lastRowCount > 0) {
    const lastRowW = lastRowCount * TILE;
    const lastRowX = (w - lastRowW) / 2;
    for (let i = 0; i < lastRowCount; i++) {
      const idx = fullRows * COLS + i;
      const x = lastRowX + i * TILE;
      const y = PAD_TOP + fullRows * TILE;
      drawTile(ctx, x, y, pokemon[idx], sprites[idx]);
    }
  }

  // Footer: insights + "made with my151.app"
  const footerY = PAD_TOP + totalRows * TILE + PAD_BOTTOM / 2;
  const zinc = '#a1a1aa';
  const FONT_SPEC = '600 8px "Inter Variable", system-ui, -apple-system, sans-serif';
  const ICON_SZ = 9;  // logical px: square side for type icon / gen badge
  const ICON_GAP = 2; // gap after icon before next element

  ctx.font = FONT_SPEC;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // Segment types: text or image icon
  type Seg = { kind: 'text'; text: string; color: string } | { kind: 'icon'; img: HTMLImageElement };
  const segs: Seg[] = [];

  if (insights.noTypesOverIndex) {
    segs.push({ kind: 'text', text: 'No types over-index', color: zinc });
  } else if (insights.leanType || insights.leanGen) {
    if (insights.leanType) {
      const t = insights.leanType;
      if (leanTypeImg) segs.push({ kind: 'icon', img: leanTypeImg });
      segs.push({ kind: 'text', text: t.charAt(0).toUpperCase() + t.slice(1), color: TYPE_COLORS[t] });
    }
    if (insights.leanGen) {
      if (insights.leanType) segs.push({ kind: 'text', text: ' & ', color: zinc });
      if (leanGenImg) segs.push({ kind: 'icon', img: leanGenImg });
      segs.push({ kind: 'text', text: `Gen ${insights.leanGen}`, color: zinc });
    }
    segs.push({ kind: 'text', text: '-heavy', color: zinc });
  }

  if (insights.bestAttackType) {
    if (segs.length > 0) segs.push({ kind: 'text', text: ' · ', color: zinc });
    segs.push({ kind: 'text', text: 'Advantaged: ', color: zinc });
    const t = insights.bestAttackType;
    if (attackTypeImg) segs.push({ kind: 'icon', img: attackTypeImg });
    segs.push({ kind: 'text', text: t.charAt(0).toUpperCase() + t.slice(1), color: TYPE_COLORS[t] });
  }

  if (segs.length > 0) segs.push({ kind: 'text', text: ' · ', color: zinc });
  segs.push({ kind: 'text', text: 'made with ', color: zinc });
  segs.push({ kind: 'text', text: 'my151', color: '#DC2626' });
  segs.push({ kind: 'text', text: '.app', color: '#0a0a0a' });

  // Measure total width (icons occupy ICON_SZ + ICON_GAP)
  let totalW = 0;
  for (const seg of segs) {
    totalW += seg.kind === 'icon' ? (ICON_SZ + ICON_GAP) : ctx.measureText(seg.text).width;
  }

  // Draw left-to-right centered
  let tx = (w - totalW) / 2;
  for (const seg of segs) {
    if (seg.kind === 'icon') {
      ctx.drawImage(seg.img, tx, footerY - ICON_SZ / 2, ICON_SZ, ICON_SZ);
      tx += ICON_SZ + ICON_GAP;
    } else {
      ctx.fillStyle = seg.color;
      ctx.fillText(seg.text, tx, footerY);
      tx += ctx.measureText(seg.text).width;
    }
  }

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
}

/** Share via native share sheet (mobile gallery save) or fall back to file download. */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });

  if (navigator.canShare?.({ files: [file] })) {
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
