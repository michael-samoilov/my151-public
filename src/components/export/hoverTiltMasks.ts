import { typeGlyphPath } from '@/data/type-ids';
import type { TypeName } from '@/types/pokemon';
import type { HoverTiltMaskId } from './hoverTiltRecipe';

export type HoverTiltMaskContext = {
  type: TypeName;
  dexNumber: number;
};

export const DEFAULT_MASK_CONTEXT: HoverTiltMaskContext = {
  type: 'grass',
  dexNumber: 387,
};

export type HoverTiltMaskPaint = {
  image: string;
  size: string;
  repeat: string;
  position: string;
  followPointer: boolean;
};

function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const SPARKLE_DOTS: ReadonlyArray<readonly [number, number, number]> = [
  [18, 22, 1.4],
  [46, 12, 2.1],
  [78, 28, 1.2],
  [112, 16, 1.8],
  [148, 24, 1.3],
  [184, 10, 2.0],
  [222, 30, 1.5],
  [28, 64, 1.6],
  [62, 52, 1.1],
  [96, 70, 1.9],
  [134, 58, 1.4],
  [170, 74, 1.2],
  [208, 54, 1.7],
  [240, 68, 1.3],
  [14, 108, 1.5],
  [52, 98, 2.0],
  [88, 118, 1.2],
  [126, 104, 1.6],
  [162, 122, 1.4],
  [198, 96, 1.8],
  [236, 114, 1.1],
  [36, 154, 1.7],
  [72, 142, 1.3],
  [108, 160, 1.9],
  [144, 148, 1.2],
  [180, 166, 1.5],
  [216, 150, 1.4],
  [22, 196, 1.6],
  [58, 210, 1.2],
  [94, 188, 2.0],
  [132, 204, 1.3],
  [168, 192, 1.7],
  [204, 214, 1.4],
  [240, 198, 1.8],
  [40, 236, 1.3],
  [86, 242, 1.6],
  [150, 238, 1.2],
  [198, 244, 1.5],
];

const SPARKLE_STARS: ReadonlyArray<readonly [number, number, number]> = [
  [64, 36, 5],
  [176, 44, 4.2],
  [42, 128, 4.6],
  [210, 132, 5.2],
  [118, 176, 4.4],
  [74, 220, 3.8],
];

function starPath(cx: number, cy: number, r: number): string {
  const n = r * 0.2;
  return `M${cx} ${cy - r} L${cx + n} ${cy - n} L${cx + r} ${cy} L${cx + n} ${cy + n} L${cx} ${cy + r} L${cx - n} ${cy + n} L${cx - r} ${cy} L${cx - n} ${cy - n} Z`;
}

function sparkleSvg(): string {
  const dots = SPARKLE_DOTS.map(
    ([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="white"/>`,
  ).join('');
  const stars = SPARKLE_STARS.map(([x, y, r]) => `<path d="${starPath(x, y, r)}" fill="white"/>`).join(
    '',
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${dots}${stars}</svg>`;
}

function wordmarkSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="48" viewBox="0 0 220 48"><text x="110" y="32" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="22" font-weight="700" fill="white">my151.app</text></svg>`;
}

function pokeBallSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="1.4"/><path d="M2 12h7.2M14.8 12H22" stroke="white" stroke-width="1.4"/><circle cx="12" cy="12" r="3.2" stroke="white" stroke-width="1.4"/><circle cx="12" cy="12" r="1.3" fill="white"/></svg>`;
}

function dexNumberSvg(n: number): string {
  const label = `#${String(Math.max(0, Math.floor(n))).padStart(4, '0')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="180" viewBox="0 0 420 180"><text x="210" y="118" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="92" font-weight="800" fill="white">${label}</text></svg>`;
}

const NONE_PAINT: HoverTiltMaskPaint = {
  image: 'none',
  size: '100% 100%',
  repeat: 'no-repeat',
  position: '0 0',
  followPointer: false,
};

export const SPARKLE_FIELD_URL = svgUrl(sparkleSvg());

export function hoverTiltMaskPaint(
  id: HoverTiltMaskId,
  ctx: HoverTiltMaskContext = DEFAULT_MASK_CONTEXT,
): HoverTiltMaskPaint {
  switch (id) {
    case 'none':
      return NONE_PAINT;
    case 'typeIcon':
      return {
        image: `url("${typeGlyphPath(ctx.type)}")`,
        size: '28% 28%',
        repeat: 'no-repeat',
        position: '8% 10%',
        followPointer: false,
      };
    case 'wordmark':
      return {
        image: svgUrl(wordmarkSvg()),
        size: '38% auto',
        repeat: 'repeat',
        position: '0 0',
        followPointer: true,
      };
    case 'cardSparkle':
      return {
        image: SPARKLE_FIELD_URL,
        size: '180% 180%',
        repeat: 'repeat',
        position: '0 0',
        followPointer: true,
      };
    case 'pokeBall':
      return {
        image: svgUrl(pokeBallSvg()),
        size: '16% 16%',
        repeat: 'repeat',
        position: '0 0',
        followPointer: true,
      };
    case 'dexNumber':
      return {
        image: svgUrl(dexNumberSvg(ctx.dexNumber)),
        size: '72% auto',
        repeat: 'no-repeat',
        position: 'center',
        followPointer: false,
      };
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function hoverTiltMaskCssVars(
  glare: HoverTiltMaskPaint,
  sparkle: HoverTiltMaskPaint,
): Record<string, string> {
  return {
    '--hover-tilt-glare-mask': glare.image,
    '--hover-tilt-glare-mask-size': glare.size,
    '--hover-tilt-glare-mask-repeat': glare.repeat,
    '--hover-tilt-glare-mask-position': glare.followPointer
      ? 'calc(var(--pointer-from-left) * 80%) calc(var(--pointer-from-top) * 80%)'
      : glare.position,
    '--hover-tilt-sparkle-mask': sparkle.image,
    '--hover-tilt-sparkle-mask-size': sparkle.size,
    '--hover-tilt-sparkle-mask-repeat': sparkle.repeat,
    '--hover-tilt-sparkle-mask-position': sparkle.followPointer
      ? 'calc(var(--pointer-from-left) * 80%) calc(var(--pointer-from-top) * 80%)'
      : sparkle.position,
    '--hover-tilt-sparkle-field': SPARKLE_FIELD_URL,
  };
}
