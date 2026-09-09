/**
 * Perceptual colour measurement, for judging the card's ramp.
 *
 * Used by `theme.test.ts` and `scripts/shade-report.ts`, never by the app —
 * "do these two types look the same?" is a question for a number, not for
 * the eye that just called fighting and ground the same brown.
 *
 * CIEDE2000 rather than a hex or HSL distance: it models how far apart two
 * colours *look*. Roughly, 1 is the just-noticeable difference, 5 reads as
 * a clear difference at a glance, and 10 is unmistakable.
 */

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** CIE L*a*b* under D65, the space CIEDE2000 is defined in. */
function rgbToLab([r, g, b]: Rgb): [number, number, number] {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Perceptual distance between two hex colours. */
export function deltaE2000(hex1: string, hex2: string): number {
  const [L1, a1, b1] = rgbToLab(hexToRgb(hex1));
  const [L2, a2, b2] = rgbToLab(hexToRgb(hex2));
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const cMean = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cMean ** 7 / (cMean ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1;
  const ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hue = (y: number, x: number) => {
    if (x === 0 && y === 0) return 0;
    const h = Math.atan2(y, x) * deg;
    return h >= 0 ? h : h + 360;
  };
  const hp1 = hue(b1, ap1);
  const hp2 = hue(b2, ap2);
  const dL = L2 - L1;
  const dC = cp2 - cp1;
  let dh = 0;
  if (cp1 * cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh * rad) / 2);
  const lBar = (L1 + L2) / 2;
  const cBar = (cp1 + cp2) / 2;
  let hBar = hp1 + hp2;
  if (cp1 * cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hBar += hBar < 360 ? 360 : -360;
    hBar /= 2;
  }
  const t =
    1 - 0.17 * Math.cos((hBar - 30) * rad) + 0.24 * Math.cos(2 * hBar * rad)
    + 0.32 * Math.cos((3 * hBar + 6) * rad) - 0.2 * Math.cos((4 * hBar - 63) * rad);
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBar;
  const sh = 1 + 0.015 * cBar * t;
  const rt =
    -Math.sin(2 * (30 * Math.exp(-(((hBar - 275) / 25) ** 2))) * rad)
    * (2 * Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  return Math.sqrt(
    (dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh),
  );
}

/** WCAG contrast ratio against white — the card's cells carry white glyphs. */
export function contrastWithWhite(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const l = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return 1.05 / (l + 0.05);
}
