// Shared geometry: the egg curve as Beziers and samples, ellipses, polylines.
import { EGG } from './trace.mjs';

const r2 = (n) => Math.round(n * 100) / 100;
export const pt = (p) => `${r2(p[0])} ${r2(p[1])}`;

/** Egg profile in any frame: centre (cx, cy), half-width a, half-height b. */
export function eggFrame({ cx, cy, a, b, K = EGG.K }) {
  const P = (t) => [cx + a * Math.sin(t) * (1 - K * Math.cos(t)), cy - b * Math.cos(t)];
  const dP = (t) => [a * (Math.cos(t) * (1 - K * Math.cos(t)) + K * Math.sin(t) ** 2), b * Math.sin(t)];
  const arc = (t0, t1, n) => {
    let d = '';
    const h = (t1 - t0) / n;
    for (let i = 0; i < n; i++) {
      const u = t0 + i * h, v = u + h;
      const p0 = P(u), p3 = P(v), d0 = dP(u), d3 = dP(v);
      d += `C${pt([p0[0] + (h / 3) * d0[0], p0[1] + (h / 3) * d0[1]])} ${pt([p3[0] - (h / 3) * d3[0], p3[1] - (h / 3) * d3[1]])} ${pt(p3)}`;
    }
    return d;
  };
  const path = () => `M${pt(P(0))}${arc(0, 2 * Math.PI, 8)}Z`;
  const samples = (n = 720, t0 = 0, t1 = 2 * Math.PI) => Array.from({ length: n + 1 }, (_, i) => P(t0 + ((t1 - t0) * i) / n));
  /** Half-width at height y (for clearance against the outline). */
  const inside = (x, y) => {
    const Y = (y - cy) / b;
    if (Math.abs(Y) >= 1) return false;
    return Math.abs(x - cx) < a * Math.sqrt(1 - Y * Y) * (1 + K * Y);
  };
  /** t on the profile nearest to point p (coarse search, then refine). */
  const nearestT = (p) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < 2000; i++) {
      const t = (i / 2000) * 2 * Math.PI;
      const q = P(t);
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };
  return { P, dP, arc, path, samples, inside, nearestT };
}

export function polyline(pts) {
  return `M${pts.map(pt).join('L')}`;
}

export function samplePolyline(pts, step = 0.05) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function ellipsePts([cx, cy, rx, ry], n = 360) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

/** Minimum distance between two point sets. */
export function minDist(A, B) {
  let m = Infinity;
  for (const p of A) for (const q of B) {
    const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    if (d < m) m = d;
  }
  return Math.sqrt(m);
}
