/**
 * Live holographic blend. Multiply at 0.40 darkens ink. This file scores
 * CSS blend modes so the layer tints sprites without dropping luminance.
 */

export const FOIL_HOLO_BLEND_CANDIDATES = [
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'color',
] as const;

export type FoilHoloBlend = (typeof FOIL_HOLO_BLEND_CANDIDATES)[number];

/** Rainbow swatch from the live holographic grating. */
export const FOIL_HOLO_TINT = { r: 255, g: 118, b: 117 };

const INKS = [
  { name: 'grass', r: 40, g: 160, b: 40 },
  { name: 'water', r: 48, g: 112, b: 200 },
  { name: 'fire', r: 220, g: 72, b: 40 },
  { name: 'electric', r: 248, g: 208, b: 48 },
  { name: 'normal', r: 196, g: 164, b: 120 },
] as const;

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function chroma(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function sat(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return 0;
  return l > 127.5 ? (mx - mn) / (510 - mx - mn) : (mx - mn) / (mx + mn);
}

function channel(cb: number, cs: number, mode: FoilHoloBlend): number {
  const b = cb / 255;
  const s = cs / 255;
  let out = b;
  if (mode === 'multiply') out = b * s;
  else if (mode === 'screen') out = 1 - (1 - b) * (1 - s);
  else if (mode === 'overlay') out = b < 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
  else if (mode === 'soft-light') {
    if (s <= 0.5) out = b - (1 - 2 * s) * b * (1 - b);
    else {
      const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
      out = b + (2 * s - 1) * (d - b);
    }
  }
  return out * 255;
}

function setLum(r: number, g: number, b: number, target: number): { r: number; g: number; b: number } {
  const d = target - luma(r, g, b);
  return { r: r + d, g: g + d, b: b + d };
}

function clipColor(rgb: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  const l = luma(rgb.r, rgb.g, rgb.b);
  const mn = Math.min(rgb.r, rgb.g, rgb.b);
  const mx = Math.max(rgb.r, rgb.g, rgb.b);
  if (mn >= 0 && mx <= 255) return rgb;
  if (mn < 0) {
    return {
      r: l + ((rgb.r - l) * l) / (l - mn),
      g: l + ((rgb.g - l) * l) / (l - mn),
      b: l + ((rgb.b - l) * l) / (l - mn),
    };
  }
  return {
    r: l + ((rgb.r - l) * (255 - l)) / (mx - l),
    g: l + ((rgb.g - l) * (255 - l)) / (mx - l),
    b: l + ((rgb.b - l) * (255 - l)) / (mx - l),
  };
}

export function blendRgb(
  base: { r: number; g: number; b: number },
  src: { r: number; g: number; b: number },
  mode: FoilHoloBlend,
): { r: number; g: number; b: number } {
  if (mode === 'color') {
    return clipColor(setLum(src.r, src.g, src.b, luma(base.r, base.g, base.b)));
  }
  return {
    r: channel(base.r, src.r, mode),
    g: channel(base.g, src.g, mode),
    b: channel(base.b, src.b, mode),
  };
}

/** Source-over of a blended layer at `amount` (0–1). */
export function foilComposite(
  base: { r: number; g: number; b: number },
  src: { r: number; g: number; b: number },
  mode: FoilHoloBlend,
  amount: number,
): { r: number; g: number; b: number } {
  const mixed = blendRgb(base, src, mode);
  const t = Math.min(1, Math.max(0, amount));
  return {
    r: clampByte(base.r * (1 - t) + mixed.r * t),
    g: clampByte(base.g * (1 - t) + mixed.g * t),
    b: clampByte(base.b * (1 - t) + mixed.b * t),
  };
}

export type BlendScore = {
  mode: FoilHoloBlend;
  lumaDelta: number;
  satDelta: number;
  chromaShift: number;
  visible: boolean;
  bright: boolean;
};

export function scoreHoloBlend(mode: FoilHoloBlend, amount: number): BlendScore {
  let lumaDelta = 0;
  let satDelta = 0;
  let chromaShift = 0;
  for (const ink of INKS) {
    const out = foilComposite(ink, FOIL_HOLO_TINT, mode, amount);
    lumaDelta += Math.abs(luma(out.r, out.g, out.b) - luma(ink.r, ink.g, ink.b));
    satDelta += Math.abs(sat(out.r, out.g, out.b) - sat(ink.r, ink.g, ink.b));
    chromaShift += Math.abs(chroma(out.r, out.g, out.b) - chroma(ink.r, ink.g, ink.b));
    chromaShift += Math.abs(out.r - ink.r) + Math.abs(out.g - ink.g) + Math.abs(out.b - ink.b);
  }
  const n = INKS.length;
  lumaDelta /= n;
  satDelta /= n;
  chromaShift /= n;
  return {
    mode,
    lumaDelta,
    satDelta,
    chromaShift,
    visible: chromaShift > 24,
    bright: lumaDelta < 12,
  };
}

export function pickHoloBlend(amount: number): BlendScore {
  const scored = FOIL_HOLO_BLEND_CANDIDATES.map((mode) => scoreHoloBlend(mode, amount));
  const keep = scored.filter((s) => s.visible && s.bright);
  const pool = keep.length ? keep : scored.filter((s) => s.visible);
  return pool.sort((a, b) => a.lumaDelta + a.satDelta * 40 - (b.lumaDelta + b.satDelta * 40))[0];
}

/** Live overlay winner: tint ink, keep poster luminance. */
export const FOIL_HOLO_BLEND: FoilHoloBlend = 'soft-light';
export const FOIL_HOLO_AMOUNT = 0.55;
