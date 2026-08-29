import { TYPE_COLORS } from '@/data/type-colors';
import { deriveSectionColor } from '@/lib/sectionColors';
import type { TypeName } from '@/types/pokemon';

/**
 * The card's colour system, one type in, every painted surface out. Ported
 * from the design canvas (docs/future-tools/league-builder/DECISIONS.md,
 * "Card theme"):
 *
 * - body = the build page's own section fill (type at 6.3% over white);
 * - glyph cells = the app's alt shade (`deriveSectionColor(...).stroke`,
 *   the view page's outline colour) lifted to relative luminance 0.26 so it
 *   reads against a near-white card;
 * - spacer bands = the same hue and saturation at luminance 0.12.
 *
 * Fixed HSL lightness does not hold brightness across hues (L 55% green is
 * far brighter than L 55% blue), so both dark steps solve for a luminance
 * target instead.
 */

export interface CardShades {
  /** The type colour itself (chips, accents). */
  type: string;
  /** Card body. */
  base: string;
  /** Glyph cells. */
  cell: string;
  /** Spacer bands. */
  band: string;
  /** Row hairlines. */
  line: string;
  /** Dashed borders on empty slots. */
  dash: string;
  /** Placeholder text in empty slots. */
  hint: string;
  /** The open league row, and the desktop flow. */
  open: string;
  /** Hovered row/column wash (desktop). */
  hover: string;
}

const CELL_LUMINANCE = 0.26;
const BAND_LUMINANCE = 0.12;

/** The neutral "no type" colour the boards use. */
const NO_TYPE = '#9CA3AF';

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

/** The same hue and saturation, at a target relative luminance. */
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

/** `frac` of the colour over white. */
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

export function cardShades(type: TypeName | null): CardShades {
  const key = type ?? 'none';
  const hit = cache.get(key);
  if (hit) return hit;
  const colour = type ? TYPE_COLORS[type] : NO_TYPE;
  const cell = atLuminance(deriveSectionColor(colour).stroke, CELL_LUMINANCE);
  const shades: CardShades = {
    type: colour,
    base: overWhite(colour, 0.063),
    cell,
    band: atLuminance(deriveSectionColor(colour).stroke, BAND_LUMINANCE),
    line: overWhite(colour, 0.14),
    dash: overWhite(cell, 0.28),
    hint: overWhite(cell, 0.55),
    open: rgba(colour, 0.055),
    hover: rgba(colour, 0.09),
  };
  cache.set(key, shades);
  return shades;
}
