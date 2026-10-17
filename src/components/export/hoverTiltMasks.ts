import { typeGlyphPath } from '@/data/type-ids';
import { DEX_EXPORT_FRAME, DEX_EXPORT_HEADER, layoutDexExportGrid } from '@/lib/dexExportLayout';
import { CARD_IMG_H, CARD_IMG_W, FRAME } from '@/league/export/layout';
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

type HoverTiltMaskPaint = {
  image: string;
  size: string;
  repeat: string;
  position: string;
};

type TypeIconGlyphBox = {
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

export function hoverTiltMaskContextFromDex(
  pokemon: Pokemon[],
  sections: Record<string, number[]> | null = null,
): HoverTiltMaskContext {
  const grid = layoutDexExportGrid(pokemon, sections);
  return {
    width: grid.width + 2 * DEX_EXPORT_FRAME,
    height: grid.height + 2 * DEX_EXPORT_FRAME + DEX_EXPORT_HEADER,
    sprites: grid.sprites.map((s) => ({
      cx: s.cx + DEX_EXPORT_FRAME,
      cy: s.cy + DEX_EXPORT_FRAME + DEX_EXPORT_HEADER,
      r: s.r,
      type: s.pokemon.types[0] ?? 'normal',
      dexNumber: s.pokemon.id,
    })),
  };
}

function dexBorderInsets(ctx: HoverTiltMaskContext): { x: number; y: number } {
  const dex = ctx.width > 8;
  const frame = dex ? DEX_EXPORT_FRAME : FRAME;
  const width = dex ? ctx.width : CARD_IMG_W;
  const height = dex ? ctx.height : CARD_IMG_H;
  return {
    x: frame / width,
    y: frame / height,
  };
}

function dexBorderFrameSvg(ctx: HoverTiltMaskContext): string {
  const inset = dexBorderInsets(ctx);
  const top = inset.y * 100;
  const left = inset.x * 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="0" y="0" width="100" height="${top.toFixed(3)}" fill="white"/><rect x="0" y="${(100 - top).toFixed(3)}" width="100" height="${top.toFixed(3)}" fill="white"/><rect x="0" y="0" width="${left.toFixed(3)}" height="100" fill="white"/><rect x="${(100 - left).toFixed(3)}" y="0" width="${left.toFixed(3)}" height="100" fill="white"/></svg>`;
}

function typeIconGlyphBoxes(ctx: HoverTiltMaskContext): TypeIconGlyphBox[] {
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
    case 'dexBorder':
      return {
        image: svgUrl(dexBorderFrameSvg(ctx)),
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
): Record<string, string> {
  return {
    '--hover-tilt-glare-mask': glare.image,
    '--hover-tilt-glare-mask-size': glare.size,
    '--hover-tilt-glare-mask-repeat': glare.repeat,
    '--hover-tilt-glare-mask-position': glare.position,
  };
}

export function hoverTiltMaskSpriteTypes(ctx: HoverTiltMaskContext): string {
  return ctx.sprites.map((s) => s.type).join(',');
}
