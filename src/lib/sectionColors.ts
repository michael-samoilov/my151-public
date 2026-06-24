import { BUILD_GROUPS } from '@/data/slot-template';

// Each build section has a single theme colour. For legibility we split it into
// an accessible pair: a light FILL and a dark STROKE (used for the outline and
// the section name). Both are derived from the theme colour by darkening the
// stroke and lightening the fill until their contrast meets the target ratio.
//
// Hue preservation: darkening the stroke is what erodes a section's recognisable
// hue (a yellow forced dark enough to hit 4.5:1 reads as olive/brown). So we
// LEAN the contrast work onto the fill — it lightens FILL_LEAN× faster than the
// stroke darkens — which keeps the stroke as light (and as on-hue) as possible
// for a given ratio. Leaning on the fill is essentially free: fills are painted
// at very low opacity (≈0.07–0.20 over the white page), so pushing the fill
// colour close to white barely changes what's drawn. We also target 4.0:1
// rather than 4.5 — these are bold/semibold labels and decorative outlines
// (WCAG AA "large text" is 3:1), and the faint fill means the on-screen label
// sits on a near-white background, so real legibility runs well above the
// nominal stroke-vs-fill ratio. (The app is light-mode only.)

type RGB = [number, number, number];

const hexToRgb = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const rgbToHex = (c: RGB): string =>
  '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const luminance = ([r, g, b]: RGB): number => {
  const f = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrast = (a: RGB, b: RGB): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

export interface SectionColor {
  fill: string;
  stroke: string;
}

/** How much faster the fill lightens than the stroke darkens (see header). */
const FILL_LEAN = 2;

/** Derive the accessible {fill, stroke} pair from a theme colour. */
export function deriveSectionColor(hex: string, target = 4.0): SectionColor {
  const base = hexToRgb(hex);
  let t = 0;
  let stroke = base;
  let fill = base;
  while (t < 1 && contrast(stroke, fill) < target) {
    t += 0.01;
    stroke = mix(base, BLACK, t);
    fill = mix(base, WHITE, Math.min(1, t * FILL_LEAN));
  }
  return { fill: rgbToHex(fill), stroke: rgbToHex(stroke) };
}

const FALLBACK: SectionColor = { fill: '#d9d9d9', stroke: '#555555' };

const MAP: Record<string, SectionColor> = Object.fromEntries(
  BUILD_GROUPS.map((g) => [g.id, deriveSectionColor(g.color)]),
);

/** Accessible fill/stroke pair for a build-section id. */
export function sectionColor(groupId: string): SectionColor {
  return MAP[groupId] ?? FALLBACK;
}
