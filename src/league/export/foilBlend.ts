/** Fixed live holographic treatment shared by the preview and its regression model. */
export const FOIL_HOLO_BLEND = 'hard-light' as const;
export const FOIL_HOLO_AMOUNT = 0.25;

/** Rainbow swatches from the live holographic grating. */
export const FOIL_HOLO_STRIPES = [
  { r: 255, g: 118, b: 117 },
  { r: 255, g: 230, b: 97 },
  { r: 80, g: 220, b: 80 },
  { r: 80, g: 180, b: 255 },
] as const;

/** Representative ink colors covered by the saturation mask. */
export const FOIL_POSTER_INKS = [
  { name: 'grass', r: 40, g: 160, b: 40 },
  { name: 'water', r: 48, g: 112, b: 200 },
  { name: 'fire', r: 220, g: 72, b: 40 },
  { name: 'electric', r: 248, g: 208, b: 48 },
  { name: 'normal', r: 196, g: 164, b: 120 },
  { name: 'band', r: 118, g: 22, b: 28 },
] as const;

type Rgb = { r: number; g: number; b: number };

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

function hardLightChannel(base: number, source: number): number {
  const b = base / 255;
  const s = source / 255;
  const mixed = s <= 0.5
    ? 2 * b * s
    : 1 - 2 * (1 - b) * (1 - s);
  return mixed * 255;
}

export function luma({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function chroma({ r, g, b }: Rgb): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** Hard-light followed by source-over at the fixed live amount. */
export function foilComposite(base: Rgb, source: Rgb, amount = FOIL_HOLO_AMOUNT): Rgb {
  const mixed = {
    r: hardLightChannel(base.r, source.r),
    g: hardLightChannel(base.g, source.g),
    b: hardLightChannel(base.b, source.b),
  };
  const t = Math.min(1, Math.max(0, amount));
  return {
    r: clampByte(base.r * (1 - t) + mixed.r * t),
    g: clampByte(base.g * (1 - t) + mixed.g * t),
    b: clampByte(base.b * (1 - t) + mixed.b * t),
  };
}
