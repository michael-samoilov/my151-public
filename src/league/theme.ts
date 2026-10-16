import { TYPE_COLORS } from '@/data/type-colors';
import { deriveSectionColor } from '@/lib/sectionColors';
import type { TypeName } from '@/types/pokemon';

export interface CardShades {
  type: string;
  base: string;
  cell: string;
  band: string;
  line: string;
  dash: string;
  hint: string;
  open: string;
  hover: string;
  hoverOnWhite: string;
}

const CELL_LUMINANCE = { lo: 0.05, hi: 0.29 };
const BAND_LUMINANCE = { lo: 0.028, hi: 0.165 };

const LUMINANCE_SCALE = 0.25;

export const NO_TYPE = '#9CA3AF';

export const BASE_TINT = 0.063;

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(c: Rgb): string {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

function bandPosition(source: string): number {
  return 1 - Math.exp(-luminance(hexToRgb(source)) / LUMINANCE_SCALE);
}

function atLuminance(hex: string, target: number): string {
  const [h, s] = rgbToHsl(hexToRgb(hex));
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(hslToRgb([h, s, mid])) < target) lo = mid;
    else hi = mid;
  }
  return rgbToHex(hslToRgb([h, s, (lo + hi) / 2]));
}

function overWhite(hex: string, frac: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([
    r * frac + 255 * (1 - frac),
    g * frac + 255 * (1 - frac),
    b * frac + 255 * (1 - frac),
  ]);
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const cache = new Map<string, CardShades>();

export function cardShades(type: TypeName | 'none' | null): CardShades {
  const key = type ?? 'none';
  const hit = cache.get(key);
  if (hit) return hit;
  const colour = type && type !== 'none' ? TYPE_COLORS[type] : NO_TYPE;
  const alt = deriveSectionColor(colour).stroke;
  const t = bandPosition(colour);
  const cell = atLuminance(alt, CELL_LUMINANCE.lo + (CELL_LUMINANCE.hi - CELL_LUMINANCE.lo) * t);
  const shades: CardShades = {
    type: colour,
    base: overWhite(colour, BASE_TINT),
    cell,
    band: atLuminance(alt, BAND_LUMINANCE.lo + (BAND_LUMINANCE.hi - BAND_LUMINANCE.lo) * t),
    line: overWhite(colour, 0.14),
    dash: overWhite(cell, 0.28),
    hint: overWhite(cell, 0.55),
    open: rgba(colour, 0.055),
    hover: rgba(colour, 0.18),
    hoverOnWhite: overWhite(colour, 0.18),
  };
  cache.set(key, shades);
  return shades;
}
