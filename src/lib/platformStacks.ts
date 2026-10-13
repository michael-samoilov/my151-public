import type { PlatformJoint } from '../../api/_aggregate';

export type { PlatformJoint };

export type PlatformDim = 'device' | 'os' | 'browser';

export interface PlatformClamp {
  dim: PlatformDim;
  value: string;
}

const DEVICE_ORDER = ['Desktop', 'Mobile', 'Tablet'] as const;
const OS_ORDER = ['Windows', 'iOS', 'Android', 'macOS', 'Linux', 'ChromeOS'] as const;
const BROWSER_ORDER = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Opera', 'Samsung Internet'] as const;

const ORDER: Record<PlatformDim, readonly string[]> = {
  device: DEVICE_ORDER,
  os: OS_ORDER,
  browser: BROWSER_ORDER,
};

const BRAND: Record<string, string> = {
  Desktop: '#3f3f46',
  Mobile: '#2563eb',
  Tablet: '#a3a3a3',
  Windows: '#0078d4',
  iOS: '#1d1d1f',
  Android: '#188038',
  macOS: '#86868b',
  Linux: '#d97706',
  ChromeOS: '#5f6368',
  Chrome: '#4285F4',
  Safari: '#0d9488',
  Firefox: '#c2410c',
  Edge: '#0b66c3',
  Opera: '#c4320a',
  'Samsung Internet': '#1428a0',
};

const TRACK = '#f5f5f5';
const FALLBACK_FILL = '#737373';

export const ICON_PX = 15;
const LABEL_GAP_PX = 4;
const LABEL_MIN_GAP_PX = 6;
const BAR_GAP_PX = 2;
const MUTE_MIX = 0.1;

const PCT_MIN_PX = 36;
const INT_MIN_PX = 16;

function dimOfJoint(j: PlatformJoint, dim: PlatformDim): string {
  if (dim === 'device') return j.device;
  if (dim === 'os') return j.os;
  return j.browser;
}

export function mixCounts(
  joints: PlatformJoint[],
  dim: PlatformDim,
  clamp: PlatformClamp | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of joints) {
    if (clamp && clamp.dim !== dim && dimOfJoint(j, clamp.dim) !== clamp.value) continue;
    const key = dimOfJoint(j, dim);
    out[key] = (out[key] ?? 0) + j.n;
  }
  return out;
}

export function clampedN(joints: PlatformJoint[], clamp: PlatformClamp | null): number {
  if (!clamp) return joints.reduce((s, j) => s + j.n, 0);
  return joints.reduce((s, j) => s + (dimOfJoint(j, clamp.dim) === clamp.value ? j.n : 0), 0);
}

function brandFill(value: string): string {
  return BRAND[value] ?? FALLBACK_FILL;
}

export function muteColor(color: string): string {
  return mixHex(color, TRACK, MUTE_MIX);
}

function muteFill(value: string): string {
  return muteColor(brandFill(value));
}

export function sliceFill(key: string, dim: PlatformDim, clamp: PlatformClamp | null): string {
  if (clamp && clamp.dim === dim && clamp.value !== key) return muteFill(key);
  return brandFill(key);
}

const SPELL_ALWAYS = new Set(['ios', 'macos']);

function keepWord(value: string): boolean {
  const v = value.toLowerCase();
  return v.includes('ipad') || SPELL_ALWAYS.has(v);
}

function orderedKeys(counts: Record<string, number>, dim: PlatformDim): string[] {
  const rank = new Map(ORDER[dim].map((k, i) => [k, i]));
  return Object.keys(counts)
    .filter((k) => (counts[k] ?? 0) > 0)
    .sort((a, b) => {
      const ra = rank.get(a) ?? 1000;
      const rb = rank.get(b) ?? 1000;
      if (ra !== rb) return ra - rb;
      return (counts[b] ?? 0) - (counts[a] ?? 0);
    });
}

interface SliceGeom {
  key: string;
  n: number;
  pct: number;
  leftPx: number;
  widthPx: number;
  fill: string;
}

export function sliceGeometry(
  counts: Record<string, number>,
  dim: PlatformDim,
  barWidthPx: number,
): SliceGeom[] {
  const keys = orderedKeys(counts, dim);
  const total = keys.reduce((s, k) => s + counts[k], 0);
  if (total <= 0 || barWidthPx <= 0 || keys.length === 0) return [];
  const gaps = BAR_GAP_PX * Math.max(0, keys.length - 1);
  const usable = Math.max(0, barWidthPx - gaps);
  let x = 0;
  const out: SliceGeom[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const n = counts[key];
    const raw = i === keys.length - 1 ? Math.max(0, usable - x) : (n / total) * usable;
    const leftPx = x + i * BAR_GAP_PX;
    const widthPx = Math.max(0, Math.min(raw, barWidthPx - leftPx));
    out.push({
      key,
      n,
      pct: Math.round((n / total) * 100),
      leftPx,
      widthPx,
      fill: brandFill(key),
    });
    x += raw;
  }
  return out;
}

type InBarKind = 'pct' | 'int' | 'none';

export function inBarKind(slices: SliceGeom[]): InBarKind[] {
  let usedPct = false;
  return slices.map((s) => {
    if (!usedPct && s.widthPx >= PCT_MIN_PX) {
      usedPct = true;
      return 'pct';
    }
    if (s.widthPx >= INT_MIN_PX) return 'int';
    return 'none';
  });
}

export function inkOn(fill: string): string {
  const rgb = parseHex(fill);
  if (!rgb) return '#fff';
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum > 0.55 ? '#0a0a0a' : '#fff';
}

export interface LabelLayout {
  key: string;
  leftPx: number;
  widthPx: number;
  showWord: boolean;
  align: 'start' | 'end';
  color: string;
}

function placeLabels(
  slices: SliceGeom[],
  barWidthPx: number,
  measureWord: (word: string) => number,
  dropped: Set<string>,
): LabelLayout[] {
  const labels: LabelLayout[] = slices.map((s, i, all) => {
    const wordW = measureWord(s.key);
    const fullW = ICON_PX + LABEL_GAP_PX + wordW;
    const showWord = !dropped.has(s.key) && (keepWord(s.key) || fullW <= s.widthPx);
    const widthPx = showWord ? fullW : ICON_PX;
    const isTail = i === all.length - 1;
    let align: 'start' | 'end' = 'start';
    let leftPx = s.leftPx;
    if (!showWord && isTail && s.widthPx < ICON_PX) {
      align = 'end';
      leftPx = Math.max(0, barWidthPx - ICON_PX);
    }
    return { key: s.key, leftPx, widthPx, showWord, align, color: brandFill(s.key) };
  });

  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1];
    const minLeft = prev.leftPx + prev.widthPx + LABEL_MIN_GAP_PX;
    if (labels[i].leftPx < minLeft) labels[i].leftPx = minLeft;
  }

  if (labels.length === 0) return labels;
  const last = labels[labels.length - 1];
  const overflow = last.leftPx + last.widthPx - barWidthPx;
  if (overflow > 0) {
    last.leftPx = Math.max(0, barWidthPx - last.widthPx);
    for (let i = labels.length - 2; i >= 0; i--) {
      const next = labels[i + 1];
      const maxRight = next.leftPx - LABEL_MIN_GAP_PX;
      const right = labels[i].leftPx + labels[i].widthPx;
      if (right > maxRight) {
        labels[i].leftPx = Math.max(0, maxRight - labels[i].widthPx);
      }
    }
  }
  return labels;
}

export function labelsCollide(labels: LabelLayout[], barWidthPx: number): boolean {
  if (labels.length === 0) return false;
  for (let i = 1; i < labels.length; i++) {
    const minLeft = labels[i - 1].leftPx + labels[i - 1].widthPx + LABEL_MIN_GAP_PX;
    if (labels[i].leftPx < minLeft - 0.01) return true;
  }
  const last = labels[labels.length - 1];
  return last.leftPx + last.widthPx > barWidthPx + 0.01;
}

export function layoutLabels(
  slices: SliceGeom[],
  barWidthPx: number,
  measureWord: (word: string) => number,
): LabelLayout[] {
  const dropped = new Set<string>();
  let labels = placeLabels(slices, barWidthPx, measureWord, dropped);
  for (let n = 0; n < slices.length; n++) {
    if (!labelsCollide(labels, barWidthPx)) return labels;
    const victim = [...labels]
      .reverse()
      .find((l) => l.showWord && !keepWord(l.key) && !dropped.has(l.key));
    if (!victim) break;
    dropped.add(victim.key);
    labels = placeLabels(slices, barWidthPx, measureWord, dropped);
  }
  return labels;
}

export function dimTitle(dim: PlatformDim, clamp: { dim: string; value: string } | null): string {
  const name = dim === 'os' ? 'OS' : dim === 'device' ? 'Device' : 'Browser';
  if (!clamp || clamp.dim === dim) return name;
  return `${name} among ${clamp.value}`;
}

export function clampChipLabel(clamp: { dim: string; value: string }): string {
  const dim =
    clamp.dim === 'device' ? 'Device' : clamp.dim === 'os' ? 'OS' : clamp.dim === 'browser' ? 'Browser' : 'Region';
  return `${dim}: ${clamp.value}`;
}

function parseHex(color: string): [number, number, number] | null {
  const hex = color.startsWith('#') ? color.slice(1) : '';
  if (hex.length === 3) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  const m = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function mixHex(a: string, b: string, t: number): string {
  const A = parseHex(a) ?? [115, 115, 115];
  const B = parseHex(b) ?? [245, 245, 245];
  const m = (i: number) => Math.round(A[i] * t + B[i] * (1 - t));
  return `rgb(${m(0)}, ${m(1)}, ${m(2)})`;
}

function relLuminance(rgb: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function contrastOnWhite(rgb: [number, number, number]): number {
  return 1.05 / (relLuminance(rgb) + 0.05);
}

function rgbToHsl(rgb: [number, number, number]): { h: number; s: number; l: number } {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const byte = (v: number) => Math.round((v + m) * 255);
  return [byte(r), byte(g), byte(b)];
}

function colorKey(color: string): string {
  const rgb = parseHex(color);
  return rgb ? rgb.join(',') : color.trim().toLowerCase();
}

/** Lightest lightness of this hue that still reads on white. */
function lightCap(h: number, s: number, baseL: number): number {
  let lo = baseL;
  let hi = 0.9;
  let best = baseL;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (contrastOnWhite(hslToRgb(h, s, mid)) >= 1.55) {
      best = mid;
      lo = mid;
    } else hi = mid;
  }
  return best;
}

function lighterShade(color: string, t: number): string {
  const rgb = parseHex(color);
  if (!rgb || t <= 0) return color;
  const hsl = rgbToHsl(rgb);
  const cap = lightCap(hsl.h, hsl.s, hsl.l);
  const l = hsl.l + (cap - hsl.l) * t;
  const next = hslToRgb(hsl.h, hsl.s, l);
  return `#${next.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Repeated colors become a same-hue ramp. The left copy stays darkest.
 * A color that appears once is unchanged.
 */
export function shadeRamp(colors: readonly string[]): string[] {
  const groups = new Map<string, number[]>();
  colors.forEach((color, i) => {
    const key = colorKey(color);
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  });
  const out = colors.slice();
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const base = colors[indexes[0]];
    indexes.forEach((at, rank) => {
      if (rank === 0) return;
      out[at] = lighterShade(base, rank / (indexes.length - 1));
    });
  }
  return out;
}
