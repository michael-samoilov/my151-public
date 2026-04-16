import type { Pokemon, TypeName } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { computeTypeDominance } from '@/hooks/useTypeDominance';
import { getAllPokemon } from '@/hooks/usePokemonData';

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

/** Representative solid color per generation for inline gen dot */
const GEN_DOT_COLORS: Record<number, string> = {
  1: '#DC0A2D', 2: '#DAA520', 3: '#A00000', 4: '#AACCEE',
  5: '#555555', 6: '#025DA6', 7: '#F5A623', 8: '#00A1E9', 9: '#E3350D',
};

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
  /** Most over-indexed type relative to national dex */
  leanType?: TypeName;
  /** Most over-indexed generation relative to national dex */
  leanGen?: number;
  /** Attacking type with the highest dominance score vs this region — easiest type to sweep it with */
  bestAttackType?: TypeName;
}

function computeFooterInsights(pokemon: Pokemon[]): FooterInsights {
  if (pokemon.length < 15) return {};

  // Type lean — most over-represented type vs national baseline
  const nationalTypeFreq = getNationalTypeFreq();
  const regionTypeCount = new Map<string, number>();
  for (const p of pokemon) {
    for (const t of p.types) regionTypeCount.set(t, (regionTypeCount.get(t) ?? 0) + 1);
  }
  const total = pokemon.length;
  let bestTypeRatio = 1.2;
  let leanType: TypeName | undefined;
  for (const [t, count] of regionTypeCount) {
    const natRatio = nationalTypeFreq.get(t) ?? 0;
    if (natRatio > 0) {
      const ratio = (count / total) / natRatio;
      if (ratio > bestTypeRatio) { bestTypeRatio = ratio; leanType = t as TypeName; }
    }
  }

  // Gen lean — most over-represented generation vs national baseline
  const nationalGenFreq = getNationalGenFreq();
  const regionGenCount = new Map<number, number>();
  for (const p of pokemon) regionGenCount.set(p.generation, (regionGenCount.get(p.generation) ?? 0) + 1);
  let bestGenRatio = 1.3;
  let leanGen: number | undefined;
  for (const [g, count] of regionGenCount) {
    const natRatio = nationalGenFreq.get(g) ?? 0;
    if (natRatio > 0) {
      const ratio = (count / total) / natRatio;
      if (ratio > bestGenRatio) { bestGenRatio = ratio; leanGen = g; }
    }
  }

  // Most advantaged attacking type — highest dominance score vs this region's Pokemon
  // (i.e., which type gives a trainer the easiest time sweeping through this region)
  const dominance = computeTypeDominance(pokemon);
  const topType = dominance.reduce((a, b) => a.score > b.score ? a : b);
  const bestAttackType: TypeName | undefined = topType.score > 0 ? topType.type : undefined;

  return { leanType, leanGen, bestAttackType };
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
  siteUrl: string,
): Promise<Blob> {
  const count = pokemon.length;
  if (count === 0) throw new Error('No Pokemon to export');

  const fullRows = Math.floor(count / COLS);
  const lastRowCount = count % COLS;
  const totalRows = fullRows + (lastRowCount > 0 ? 1 : 0);

  const gridW = COLS * TILE;
  const w = gridW + PAD_X * 2;
  const h = PAD_TOP + totalRows * TILE + PAD_BOTTOM;

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

  // Load all sprites in parallel
  const sprites = await Promise.all(
    pokemon.map((p) => loadImage(p.sprite).catch(() => null)),
  );

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
  // Segments: [dot] Type-heavy & [dot] Gen N-heavy · Most advantaged: [dot] Type · made with ...
  const footerY = PAD_TOP + totalRows * TILE + PAD_BOTTOM / 2;
  const domain = siteUrl.replace(/^https?:\/\//, '');
  const zinc = '#a1a1aa';
  const FONT_SPEC = '600 8px system-ui, -apple-system, sans-serif';
  const DOT_R = 3.5; // dot radius (logical px)
  const DOT_GAP = 2;  // gap after dot before text

  ctx.font = FONT_SPEC;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const insights = computeFooterInsights(pokemon);

  // Segment types: text or colored dot
  type Seg = { kind: 'text'; text: string; color: string } | { kind: 'dot'; color: string };
  const segs: Seg[] = [];

  const hasLean = insights.leanType || insights.leanGen;
  if (hasLean) {
    if (insights.leanType) {
      const t = insights.leanType;
      segs.push({ kind: 'dot', color: TYPE_COLORS[t] });
      segs.push({ kind: 'text', text: t.charAt(0).toUpperCase() + t.slice(1), color: TYPE_COLORS[t] });
    }
    if (insights.leanGen) {
      if (insights.leanType) segs.push({ kind: 'text', text: ' & ', color: zinc });
      const g = insights.leanGen;
      segs.push({ kind: 'dot', color: GEN_DOT_COLORS[g] ?? '#888' });
      segs.push({ kind: 'text', text: `Gen ${g}`, color: GEN_DOT_COLORS[g] ?? '#888' });
    }
    segs.push({ kind: 'text', text: '-heavy', color: zinc });
  }

  if (insights.bestAttackType) {
    if (segs.length > 0) segs.push({ kind: 'text', text: ' · ', color: zinc });
    segs.push({ kind: 'text', text: 'Most advantaged: ', color: zinc });
    const t = insights.bestAttackType;
    segs.push({ kind: 'dot', color: TYPE_COLORS[t] });
    segs.push({ kind: 'text', text: t.charAt(0).toUpperCase() + t.slice(1), color: TYPE_COLORS[t] });
  }

  if (segs.length > 0) segs.push({ kind: 'text', text: ' · ', color: zinc });
  segs.push({ kind: 'text', text: `made with ${domain}`, color: zinc });

  // Measure total width (dots occupy diameter + gap)
  const dotW = DOT_R * 2 + DOT_GAP;
  let totalW = 0;
  for (const seg of segs) {
    totalW += seg.kind === 'dot' ? dotW : ctx.measureText(seg.text).width;
  }

  // Draw left-to-right centered
  let tx = (w - totalW) / 2;
  for (const seg of segs) {
    if (seg.kind === 'dot') {
      ctx.fillStyle = seg.color;
      ctx.beginPath();
      ctx.arc(tx + DOT_R, footerY, DOT_R, 0, Math.PI * 2);
      ctx.fill();
      tx += dotW;
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
