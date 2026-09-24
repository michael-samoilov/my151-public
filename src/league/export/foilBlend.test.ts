import { describe, expect, it } from 'vitest';
import { deriveFoilMaps } from './foilMaps';
import { FOIL_HOLO_AMOUNT, FOIL_HOLO_BLEND } from './foilBlend';

type Rgb = { r: number; g: number; b: number };

const HOLO_STRIPES = [
  { r: 255, g: 118, b: 117 },
  { r: 255, g: 230, b: 97 },
  { r: 80, g: 220, b: 80 },
  { r: 80, g: 180, b: 255 },
] as const;

const POSTER_INKS = [
  { name: 'grass', r: 40, g: 160, b: 40 },
  { name: 'water', r: 48, g: 112, b: 200 },
  { name: 'fire', r: 220, g: 72, b: 40 },
  { name: 'electric', r: 248, g: 208, b: 48 },
  { name: 'normal', r: 196, g: 164, b: 120 },
  { name: 'band', r: 118, g: 22, b: 28 },
] as const;

function luma({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function chroma({ r, g, b }: Rgb): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function hardLightChannel(base: number, source: number): number {
  const b = base / 255;
  const s = source / 255;
  return (s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)) * 255;
}

function foilComposite(base: Rgb, source: Rgb, amount: number): Rgb {
  const channel = (b: number, s: number) => Math.round(b * (1 - amount) + hardLightChannel(b, s) * amount);
  return {
    r: channel(base.r, source.r),
    g: channel(base.g, source.g),
    b: channel(base.b, source.b),
  };
}

function inkMaskAlpha(ink: Rgb): number {
  const maps = deriveFoilMaps(
    { width: 1, height: 1, data: new Uint8ClampedArray([ink.r, ink.g, ink.b, 255]) },
    { sat: true, edge: false, gloss: false },
  );
  return maps.sat.data[3]! / 255;
}

describe('fixed foil holographic blend', () => {
  it('uses hard-light at the production 0.25 amount', () => {
    expect(FOIL_HOLO_BLEND).toBe('hard-light');
    expect(FOIL_HOLO_AMOUNT).toBe(0.25);
  });

  it('visibly shifts representative ink while its production mask bounds color loss', () => {
    for (const ink of POSTER_INKS) {
      let maxShift = 0;
      let maxLumaDelta = 0;
      let minChromaRetention = Number.POSITIVE_INFINITY;
      const effectiveAmount = FOIL_HOLO_AMOUNT * inkMaskAlpha(ink);
      for (const stripe of HOLO_STRIPES) {
        const out = foilComposite(ink, stripe, effectiveAmount);
        maxShift = Math.max(
          maxShift,
          Math.abs(out.r - ink.r) + Math.abs(out.g - ink.g) + Math.abs(out.b - ink.b),
        );
        maxLumaDelta = Math.max(maxLumaDelta, Math.abs(luma(out) - luma(ink)));
        minChromaRetention = Math.min(minChromaRetention, chroma(out) / chroma(ink));
      }
      expect(maxShift, ink.name).toBeGreaterThan(20);
      expect(maxLumaDelta, ink.name).toBeLessThan(36);
      expect(minChromaRetention, ink.name).toBeGreaterThan(0.62);
    }
  });
});
