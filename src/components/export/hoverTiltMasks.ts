import { typeGlyphPath } from '@/data/type-ids';
import { layoutDexExportGrid } from '@/lib/dexExportLayout';
import type { Pokemon, TypeName } from '@/types/pokemon';
import type { HoverTiltMaskId } from './hoverTiltRecipe';

export type HoverTiltSpriteSpot = {
  cx: number;
  cy: number;
  r: number;
  type: TypeName;
  dexNumber: number;
};

export type HoverTiltMaskContext = {
  width: number;
  height: number;
  sprites: HoverTiltSpriteSpot[];
};

export const EMPTY_MASK_CONTEXT: HoverTiltMaskContext = {
  width: 1,
  height: 1,
  sprites: [],
};

export const DEFAULT_MASK_CONTEXT = EMPTY_MASK_CONTEXT;

export type HoverTiltMaskPaint = {
  image: string;
  size: string;
  repeat: string;
  position: string;
};

export type TypeIconGlyphBox = {
  type: TypeName;
  dexNumber: number;
  x: number;
  y: number;
  size: number;
};

const CARD_MASK: Pick<HoverTiltMaskPaint, 'size' | 'repeat' | 'position'> = {
  size: '100% 100%',
  repeat: 'no-repeat',
  position: '0 0',
};

function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const SPARKLE_VIEW = 128;
const SPARKLE_DOT_COUNT = 160;
const SPARKLE_STAR_COUNT = 24;
/** Small repeating tile so grains stay visible instead of one smeared field. */
export const SPARKLE_MASK_SIZE = '10% 10%';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starPath(cx: number, cy: number, r: number): string {
  const n = r * 0.2;
  return `M${cx} ${cy - r} L${cx + n} ${cy - n} L${cx + r} ${cy} L${cx + n} ${cy + n} L${cx} ${cy + r} L${cx - n} ${cy + n} L${cx - r} ${cy} L${cx - n} ${cy - n} Z`;
}

function sparkleSvg(): string {
  const rnd = mulberry32(0xc0ffee);
  const dots: string[] = [];
  for (let i = 0; i < SPARKLE_DOT_COUNT; i++) {
    const x = rnd() * SPARKLE_VIEW;
    const y = rnd() * SPARKLE_VIEW;
    const r = 2.2 + rnd() * 1.8;
    dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="white"/>`);
  }
  const stars: string[] = [];
  for (let i = 0; i < SPARKLE_STAR_COUNT; i++) {
    const x = rnd() * SPARKLE_VIEW;
    const y = rnd() * SPARKLE_VIEW;
    const r = 2.6 + rnd() * 1.2;
    stars.push(`<path d="${starPath(x, y, r)}" fill="white"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SPARKLE_VIEW}" height="${SPARKLE_VIEW}" viewBox="0 0 ${SPARKLE_VIEW} ${SPARKLE_VIEW}" data-sparkle-dots="${SPARKLE_DOT_COUNT}">${dots.join('')}${stars.join('')}</svg>`;
}

function wordmarkSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="48" viewBox="0 0 220 48"><text x="110" y="32" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="22" font-weight="700" fill="white">my151.app</text></svg>`;
}

function pokeBallSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="1.4"/><path d="M2 12h7.2M14.8 12H22" stroke="white" stroke-width="1.4"/><circle cx="12" cy="12" r="3.2" stroke="white" stroke-width="1.4"/><circle cx="12" cy="12" r="1.3" fill="white"/></svg>`;
}

function dexLabel(n: number): string {
  return `#${String(Math.max(0, Math.floor(n))).padStart(4, '0')}`;
}

function dexNumberFieldSvg(ctx: HoverTiltMaskContext): string {
  const labels = ctx.sprites
    .map((s) => {
      const font = Math.max(6, s.r * 0.55);
      return `<text x="${s.cx}" y="${s.cy}" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${font}" font-weight="800" fill="white">${dexLabel(s.dexNumber)}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ctx.width}" height="${ctx.height}" viewBox="0 0 ${ctx.width} ${ctx.height}">${labels}</svg>`;
}

const NONE_PAINT: HoverTiltMaskPaint = {
  image: 'none',
  ...CARD_MASK,
};

export const SPARKLE_FIELD_URL = svgUrl(sparkleSvg());

export function hoverTiltMaskContextFromDex(
  pokemon: Pokemon[],
  sections: Record<string, number[]> | null = null,
): HoverTiltMaskContext {
  const grid = layoutDexExportGrid(pokemon, sections);
  return {
    width: grid.width,
    height: grid.height,
    sprites: grid.sprites.map((s) => ({
      cx: s.cx,
      cy: s.cy,
      r: s.r,
      type: s.pokemon.types[0] ?? 'normal',
      dexNumber: s.pokemon.id,
    })),
  };
}

/** Square contain-fit box for each sprite's primary-type glyph. Side = pokéball diameter. */
export function typeIconGlyphBoxes(ctx: HoverTiltMaskContext): TypeIconGlyphBox[] {
  return ctx.sprites.map((s) => ({
    type: s.type,
    dexNumber: s.dexNumber,
    x: s.cx - s.r,
    y: s.cy - s.r,
    size: s.r * 2,
  }));
}

function typeIconMaskSvg(ctx: HoverTiltMaskContext, hrefFor: (type: TypeName) => string): string {
  const images = typeIconGlyphBoxes(ctx)
    .map((box) => {
      const href = hrefFor(box.type);
      return `<image href="${href}" x="${box.x}" y="${box.y}" width="${box.size}" height="${box.size}" preserveAspectRatio="xMidYMid meet"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ctx.width}" height="${ctx.height}" viewBox="0 0 ${ctx.width} ${ctx.height}">${images}</svg>`;
}

export function hoverTiltMaskPaint(
  id: HoverTiltMaskId,
  ctx: HoverTiltMaskContext = EMPTY_MASK_CONTEXT,
): HoverTiltMaskPaint {
  switch (id) {
    case 'none':
      return NONE_PAINT;
    case 'typeIcon':
      return {
        image: svgUrl(typeIconMaskSvg(ctx, typeGlyphPath)),
        ...CARD_MASK,
      };
    case 'wordmark':
      return {
        image: svgUrl(wordmarkSvg()),
        size: '38% auto',
        repeat: 'repeat',
        position: '0 0',
      };
    case 'cardSparkle':
      return {
        image: SPARKLE_FIELD_URL,
        size: SPARKLE_MASK_SIZE,
        repeat: 'repeat',
        position: '0 0',
      };
    case 'pokeBall':
      return {
        image: svgUrl(pokeBallSvg()),
        size: '16% 16%',
        repeat: 'repeat',
        position: '0 0',
      };
    case 'dexNumber':
      return {
        image: svgUrl(dexNumberFieldSvg(ctx)),
        ...CARD_MASK,
      };
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function loadGlyph(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

const glyphCache = new Map<TypeName, Promise<HTMLImageElement | null>>();
const typeIconPngCache = new Map<string, string>();

function glyphImage(type: TypeName): Promise<HTMLImageElement | null> {
  const hit = glyphCache.get(type);
  if (hit) return hit;
  const pending = loadGlyph(typeGlyphPath(type)).catch(() => null);
  glyphCache.set(type, pending);
  return pending;
}

function typeIconCacheKey(ctx: HoverTiltMaskContext): string {
  return `${ctx.width}x${ctx.height}:${ctx.sprites.map((s) => `${s.dexNumber}:${s.type}@${s.cx},${s.cy},${s.r}`).join(';')}`;
}

const TYPE_ICON_RASTER_SCALE = 2;

async function typeIconRasterUrl(ctx: HoverTiltMaskContext): Promise<string | null> {
  if (ctx.sprites.length === 0) return null;
  if (typeof document === 'undefined') return null;
  const key = typeIconCacheKey(ctx);
  const cached = typeIconPngCache.get(key);
  if (cached) return cached;

  const types = [...new Set(ctx.sprites.map((s) => s.type))];
  const loaded = await Promise.all(types.map(async (type) => [type, await glyphImage(type)] as const));
  const byType = new Map(loaded);
  if ([...byType.values()].every((img) => img === null)) return null;

  const scale = TYPE_ICON_RASTER_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(ctx.width * scale));
  canvas.height = Math.max(1, Math.round(ctx.height * scale));
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = true;

  for (const s of ctx.sprites) {
    const img = byType.get(s.type);
    if (!img) continue;
    const box = s.r * 2 * scale;
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const fit = Math.min(box / iw, box / ih);
    const dw = iw * fit;
    const dh = ih * fit;
    g.drawImage(img, s.cx * scale - dw / 2, s.cy * scale - dh / 2, dw, dh);
  }

  const url = `url("${canvas.toDataURL('image/png')}")`;
  typeIconPngCache.set(key, url);
  return url;
}

/** CSS mask-image cannot fetch sibling files from a data-URL SVG. Rasterize type glyphs. */
export async function resolveHoverTiltMaskPaint(
  id: HoverTiltMaskId,
  ctx: HoverTiltMaskContext = EMPTY_MASK_CONTEXT,
): Promise<HoverTiltMaskPaint> {
  const paint = hoverTiltMaskPaint(id, ctx);
  if (id !== 'typeIcon') return paint;
  const raster = await typeIconRasterUrl(ctx);
  if (!raster) return paint;
  return { image: raster, ...CARD_MASK };
}

export function hoverTiltMaskCssVars(
  glare: HoverTiltMaskPaint,
  sparkle: HoverTiltMaskPaint,
): Record<string, string> {
  return {
    '--hover-tilt-glare-mask': glare.image,
    '--hover-tilt-glare-mask-size': glare.size,
    '--hover-tilt-glare-mask-repeat': glare.repeat,
    '--hover-tilt-glare-mask-position': glare.position,
    '--hover-tilt-sparkle-mask': sparkle.image,
    '--hover-tilt-sparkle-mask-size': sparkle.size,
    '--hover-tilt-sparkle-mask-repeat': sparkle.repeat,
    '--hover-tilt-sparkle-mask-position': sparkle.position,
    '--hover-tilt-sparkle-field': SPARKLE_FIELD_URL,
  };
}

export function hoverTiltMaskSpriteTypes(ctx: HoverTiltMaskContext): string {
  return ctx.sprites.map((s) => s.type).join(',');
}
