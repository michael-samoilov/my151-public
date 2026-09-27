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
 *   the view page's outline colour) taken to a relative luminance that reads
 *   against a near-white card;
 * - spacer bands = the same hue and saturation, darker.
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
  /** Hovered row/column wash (desktop). Translucent type over the slot. */
  hover: string;
  /** `hover` composited on white — the opaque plate a hovered cell shows. */
  hoverOnWhite: string;
}

/**
 * How dark the cell and the band go, as relative luminance.
 *
 * These were one fixed number each — every cell at 0.26, every band at 0.12 —
 * and that is what made fighting read as ground and ice as steel. A single
 * target discards the one thing those pairs differ by: brightness. Measured
 * on the old ramp, all eighteen cells sat between 3.37:1 and 3.41:1 against
 * white and the closest pair was ΔE2000 3.95, which is inside "the same
 * colour". It also inverted pairs outright — ground (#915121, a dark brown)
 * came out *lighter* than fighting (#FF8000, a bright orange).
 *
 * So each type now lands somewhere in a band, placed by its own luminance.
 * The ends are set by what the surface has to carry, not by taste: the cell
 * holds white glyphs and white text, so its lightest value keeps 3:1 against
 * white (WCAG AA for large text); the band holds small bold white text, so
 * its lightest keeps 4.5:1. `scripts/shade-report.ts` prints the resulting
 * ramp and `theme.test.ts` holds the floor.
 */
const CELL_LUMINANCE = { lo: 0.05, hi: 0.29 };
const BAND_LUMINANCE = { lo: 0.028, hi: 0.165 };

/**
 * How fast the band fills as the source brightens.
 *
 * A saturating curve rather than a linear map or a clamp: the type palette's
 * own luminances bunch below 0.35 (only ice, electric and flying run
 * brighter), so a linear map would leave the top of the band nearly empty and
 * crowd everything else together. Exponential saturation spends most of the
 * band on the range the palette actually occupies, and needs no clamp — which
 * matters, because a clamp is a fixed target again for everything past it.
 * 0.25 is where the palette's dark half spreads without the bright half
 * flattening.
 */
const LUMINANCE_SCALE = 0.25;

/** The neutral "no type" colour the boards use. */
export const NO_TYPE = '#9CA3AF';

/**
 * How much of the type colour the card body carries: the type at 6.3% over
 * white. Exported so the desktop connector can wear the same tint by another
 * route — the type colour at this alpha over white composites to the same rgb
 * as `base`, so a translucent ribbon meets the row with no seam.
 */
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

/**
 * Where a source colour sits in the band: 0 at black, approaching 1 as it
 * brightens. Shared by the cell and the band so the two move together.
 */
function bandPosition(source: string): number {
  return 1 - Math.exp(-luminance(hexToRgb(source)) / LUMINANCE_SCALE);
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

export function cardShades(type: TypeName | 'none' | null): CardShades {
  const key = type ?? 'none';
  const hit = cache.get(key);
  if (hit) return hit;
  // An explicit "no type" and an unset type share the neutral ramp.
  const colour = type && type !== 'none' ? TYPE_COLORS[type] : NO_TYPE;
  const alt = deriveSectionColor(colour).stroke;
  // Placed by the type's own brightness, so the palette's ordering survives.
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
