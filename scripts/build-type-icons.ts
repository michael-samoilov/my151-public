import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decode, type Raster } from './png-rgba';

/**
 * Convert each Gen IX type symbol into a line icon in the app's lucide style:
 * a 24-unit grid, a 2-unit stroke, round caps and joins, and no fill.
 *
 * The strokes go between the white shapes, like the lead between pieces of
 * stained glass. Each white shape becomes an empty cell. One stroke runs down
 * the middle of every gap between two neighbouring shapes, and one stroke runs
 * around the outside of everything, GAP units out. Formally: the borders of
 * each shape's zone of influence (the points nearer to it than to any other
 * shape), inside the band within GAP of the symbol, plus that band's outline.
 * A hole too narrow to hold its own outline gets one line down its middle.
 *
 * Steps: upscale the 60 px icon 10x, split the symbol into its white shapes,
 * measure each pixel's distance to every shape, trace the band outline and the
 * zone borders (marching squares), join their ends, and fit cubic Béziers.
 *
 * The output is deterministic and committed. Re-run: npx tsx scripts/build-type-icons.ts
 */

const SRC_DIR = 'public/sprites/types/small';
const OUT_DIR = 'docs/design/type-icons';
const NAMES = [
  'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
  'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy',
];

const UP = 10;
/** Centre lines fit 2..22, so the 2-unit stroke fits inside 1..23. */
const GRID = 24;
const PAD = 2;
/** Units. How far the outer stroke sits outside the shapes: about half a typical gap. Override with TYPE_ICON_GAP. */
const GAP = Number(process.env.TYPE_ICON_GAP ?? 1.3);
/** Units. An enclosed pocket of open space between just two shapes, smaller than this, is part of their gap. */
const POCKET = 4;
/** Units. A white shape smaller than this across is a speck, not a shape. */
const SPECK = 0.6;
/** Units between resampled line points. */
const STEP = 0.1;
/** Line points (±) averaged to remove the source's pixel steps, about 1 unit in all. */
const SMOOTH = 5;
/** Units. A line end this close to another line joins it there. */
const SNAP = 0.7;
/** Units. The fitted curve stays this close to the traced line. */
const FIT_TOL = 0.18;
/** Degrees. A sharper turn is kept as a corner instead of being smoothed. */
const CORNER_DEG = 50;

type Pt = [number, number];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const len = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(p, pts[i]), 0);

/** How white each source pixel is, 0 (field colour) to 1 (symbol white). */
function whiteness({ width, height, data }: Raster): Float64Array {
  const bgAt = ((height >> 1) * width + 4) * 4; // inside the rounded square, left of the symbol
  const bg = [data[bgAt], data[bgAt + 1], data[bgAt + 2]];
  const bgMin = Math.min(...bg);
  const out = new Float64Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const a = data[p + 3] / 255;
    let m = 255;
    for (let c = 0; c < 3; c++) m = Math.min(m, a * data[p + c] + (1 - a) * bg[c]);
    out[i] = Math.min(1, Math.max(0, (m - bgMin) / (255 - bgMin)));
  }
  return out;
}

/** Catmull-Rom weights for the four taps around a fractional position. */
function cubicWeights(t: number): number[] {
  const t2 = t * t, t3 = t2 * t;
  return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
}

/** Separable bicubic upscale by UP, clamping at the borders. */
function upscale(src: Float64Array, w: number, h: number): Float64Array {
  const W = w * UP, H = h * UP;
  const taps = (n: number, N: number) => Array.from({ length: N }, (_, X) => {
    const s = (X + 0.5) / UP - 0.5, i = Math.floor(s);
    return { idx: [i - 1, i, i + 1, i + 2].map((k) => Math.min(n - 1, Math.max(0, k))), wt: cubicWeights(s - i) };
  });
  const tx = taps(w, W), ty = taps(h, H);
  const rows = new Float64Array(W * h);
  for (let y = 0; y < h; y++) for (let X = 0; X < W; X++) {
    const { idx, wt } = tx[X];
    rows[y * W + X] = wt[0] * src[y * w + idx[0]] + wt[1] * src[y * w + idx[1]] + wt[2] * src[y * w + idx[2]] + wt[3] * src[y * w + idx[3]];
  }
  const out = new Float64Array(W * H);
  for (let Y = 0; Y < H; Y++) {
    const { idx, wt } = ty[Y];
    for (let X = 0; X < W; X++) {
      out[Y * W + X] = wt[0] * rows[idx[0] * W + X] + wt[1] * rows[idx[1] * W + X] + wt[2] * rows[idx[2] * W + X] + wt[3] * rows[idx[3] * W + X];
    }
  }
  return out;
}

/** Felzenszwalb's 1-D squared distance transform of `f` (length n), in place. */
function edt1d(f: Float64Array, n: number, v: Int32Array, z: Float64Array, d: Float64Array) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  f.set(d.subarray(0, n));
}

/** Euclidean distance (px) from every pixel to the nearest pixel where `seed` is set. */
function distance(seed: Uint8Array, W: number, H: number): Float64Array {
  const n = Math.max(W, H), out = new Float64Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = seed[i] ? 0 : 1e20;
  const f = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), d = new Float64Array(n);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = out[y * W + x];
    edt1d(f, H, v, z, d);
    for (let y = 0; y < H; y++) out[y * W + x] = f[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = out[y * W + x];
    edt1d(f, W, v, z, d);
    for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(f[x]);
  }
  return out;
}

/** 4-connected regions of `mask`: a label per pixel (0 = none) and each region's pixels. */
function regions(mask: Uint8Array, W: number, H: number): { label: Int32Array; parts: number[][] } {
  const label = new Int32Array(W * H), parts: number[][] = [[]];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i]) continue;
    const id = parts.length, part: number[] = [i];
    label[i] = id;
    for (let k = 0; k < part.length; k++) {
      const j = part[k], x = j % W, y = (j / W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const q = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && mask[q] && !label[q]) { label[q] = id; part.push(q); }
      }
    }
    parts.push(part);
  }
  return { label, parts };
}

interface Line { pts: Pt[]; closed: boolean }

/**
 * Level lines of `f` at 0, by marching squares on pixel centres, in the cells
 * where `use(x, y)` holds. A line stops where it leaves those cells, so it can
 * be open. Returned in pixel coordinates.
 */
function contours(f: (x: number, y: number) => number, W: number, H: number, use: (x: number, y: number) => boolean): Line[] {
  const point = (x: number, y: number, e: number): Pt => {
    const [ax, ay, bx, by] = [[x, y, x + 1, y], [x + 1, y, x + 1, y + 1], [x, y + 1, x + 1, y + 1], [x, y, x, y + 1]][e];
    const va = f(ax, ay), vb = f(bx, by), t = va / (va - vb);
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  };
  // A crossing on a pixel edge has one key, shared by the two cells on either side.
  const key = (x: number, y: number, e: number) => (e === 0 ? `h${x},${y}` : e === 2 ? `h${x},${y + 1}` : e === 1 ? `v${x + 1},${y}` : `v${x},${y}`);
  const corner = [[0, 0], [1, 0], [1, 1], [0, 1]]; // TL TR BR BL; edge e runs from corner e to corner e + 1
  const next = new Map<string, string>(), at = new Map<string, Pt>(), incoming = new Set<string>();
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    if (!use(x, y)) continue;
    const c = corner.map(([dx, dy]) => f(x + dx, y + dy) > 0);
    const crossed = [0, 1, 2, 3].filter((e) => c[e] !== c[(e + 1) % 4]);
    if (!crossed.length) continue;
    let pairs: [number, number][];
    if (crossed.length === 2) pairs = [[crossed[0], crossed[1]]];
    else {
      // Saddle: the centre's side decides which corners join.
      const centre = f(x, y) + f(x + 1, y) + f(x + 1, y + 1) + f(x, y + 1) > 0;
      pairs = c[0] !== centre ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
    }
    for (const [e1, e2] of pairs) {
      // Walk from the edge where the field turns positive (going clockwise) to the edge where it turns
      // negative, so the positive side is always on the left. Decided from the corner signs alone: a
      // line through a pixel centre gives a zero-length segment, which has no direction of its own.
      const entry = (e: number) => !c[e] && c[(e + 1) % 4];
      const [from, to] = entry(e1) ? [e1, e2] : [e2, e1];
      const a = key(x, y, from), b = key(x, y, to);
      next.set(a, b); incoming.add(b);
      at.set(a, point(x, y, from)); at.set(b, point(x, y, to));
    }
  }
  const lines: Line[] = [], done = new Set<string>();
  const walk = (start: string) => {
    const pts: Pt[] = [];
    let k: string | undefined = start;
    while (k && !done.has(k)) { done.add(k); pts.push(at.get(k)!); k = next.get(k); }
    return { pts, closed: k === start };
  };
  for (const start of [...next.keys()].filter((k) => !incoming.has(k)).sort()) lines.push(walk(start));
  for (const start of [...next.keys()].sort()) if (!done.has(start)) lines.push(walk(start));
  return lines.filter((l) => l.pts.length > 2);
}

/** Evenly spaced points along a line. */
function resample({ pts, closed }: Line, step: number): Line {
  const src = closed ? [...pts, pts[0]] : pts, out: Pt[] = [src[0]];
  let carry = 0;
  for (let i = 0; i + 1 < src.length; i++) {
    const a = src[i], b = src[i + 1], l = dist(a, b);
    let t = step - carry;
    while (t <= l) { out.push(add(a, mul(sub(b, a), t / l))); t += step; }
    carry = l - (t - step);
  }
  if (closed && out.length > 1 && dist(out[0], out[out.length - 1]) < step / 2) out.pop();
  if (!closed && dist(out[out.length - 1], src[src.length - 1]) > 1e-9) out.push(src[src.length - 1]);
  return { pts: out, closed };
}

/** A narrow hole's middle line: the midpoint of each slice across its long axis. */
function spine(pixels: number[], W: number, step: number): Pt[] {
  const pts: Pt[] = pixels.map((i) => [i % W, (i / W) | 0]);
  const c = mul(pts.reduce((a, p) => add(a, p), [0, 0] as Pt), 1 / pts.length);
  let xx = 0, xy = 0, yy = 0;
  for (const p of pts) { const d = sub(p, c); xx += d[0] * d[0]; xy += d[0] * d[1]; yy += d[1] * d[1]; }
  const ang = Math.atan2(2 * xy, xx - yy) / 2, axis: Pt = [Math.cos(ang), Math.sin(ang)], across: Pt = [-axis[1], axis[0]];
  const along = pts.map((p) => dot(sub(p, c), axis)), side = pts.map((p) => dot(sub(p, c), across));
  const lo = Math.min(...along), hi = Math.max(...along), out: Pt[] = [];
  for (let t = lo + step / 2; t < hi; t += step) {
    let mn = Infinity, mx = -Infinity;
    along.forEach((a, k) => { if (Math.abs(a - t) <= step / 2) { mn = Math.min(mn, side[k]); mx = Math.max(mx, side[k]); } });
    if (mn <= mx) out.push(add(c, add(mul(axis, t), mul(across, (mn + mx) / 2))));
  }
  return out;
}

/** Move each open line's ends onto the nearest point of another line within SNAP, so joints meet exactly. */
function join(lines: Line[]): Line[] {
  for (const l of lines) {
    if (l.closed) continue;
    for (const end of [0, 1] as const) {
      const i = end ? l.pts.length - 1 : 0, p = l.pts[i];
      let best: Pt | null = null, bestD = SNAP;
      for (const m of lines) {
        if (m === l) continue;
        for (const q of m.pts) { const d = dist(p, q); if (d < bestD) { best = q; bestD = d; } }
      }
      if (best) l.pts[i] = best;
    }
  }
  return lines;
}

/** Indices where the line turns sharper than CORNER_DEG over a window of `k` points. */
function corners(pts: Pt[], k: number, closed: boolean): number[] {
  const n = pts.length, turn = new Float64Array(n);
  const at = (i: number) => pts[closed ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i))];
  for (let i = closed ? 0 : k; i < (closed ? n : n - k); i++) {
    const a1 = Math.atan2(pts[i][1] - at(i - k)[1], pts[i][0] - at(i - k)[0]);
    const a2 = Math.atan2(at(i + k)[1] - pts[i][1], at(i + k)[0] - pts[i][0]);
    let t = Math.abs(a2 - a1);
    if (t > Math.PI) t = 2 * Math.PI - t;
    turn[i] = (t * 180) / Math.PI;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (turn[i] < CORNER_DEG) continue;
    let peak = true;
    for (let j = -k; j <= k && peak; j++) {
      const m = closed ? (((i + j) % n) + n) % n : i + j;
      if (m >= 0 && m < n && m !== i && (turn[m] > turn[i] || (turn[m] === turn[i] && m < i))) peak = false;
    }
    if (peak) out.push(i);
  }
  return out;
}

/** Moving average over ±w points, keeping both ends fixed. */
function smooth(pts: Pt[], w: number): Pt[] {
  return pts.map((p, i) => {
    const r = Math.min(w, i, pts.length - 1 - i);
    if (r <= 0) return p;
    let sx = 0, sy = 0;
    for (let j = i - r; j <= i + r; j++) { sx += pts[j][0]; sy += pts[j][1]; }
    return [sx / (2 * r + 1), sy / (2 * r + 1)];
  });
}

// --- Cubic Bézier fitting (Schneider, "An Algorithm for Automatically Fitting Digitized Curves") ---

type Bez = [Pt, Pt, Pt, Pt];
const bezAt = (b: Bez, t: number): Pt => {
  const s = 1 - t;
  return add(add(mul(b[0], s * s * s), mul(b[1], 3 * s * s * t)), add(mul(b[2], 3 * s * t * t), mul(b[3], t * t * t)));
};

function generate(pts: Pt[], u: number[], t1: Pt, t2: Pt): Bez {
  const first = pts[0], last = pts[pts.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  u.forEach((t, i) => {
    const s = 1 - t, a1 = mul(t1, 3 * s * s * t), a2 = mul(t2, 3 * s * t * t);
    c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2);
    const tmp = sub(pts[i], add(mul(first, s * s * s + 3 * s * s * t), mul(last, 3 * s * t * t + t * t * t)));
    x0 += dot(a1, tmp); x1 += dot(a2, tmp);
  });
  const det = c00 * c11 - c01 * c01, seg = dist(first, last);
  let al = det ? (x0 * c11 - x1 * c01) / det : 0, ar = det ? (c00 * x1 - c01 * x0) / det : 0;
  if (al < 1e-6 * seg || ar < 1e-6 * seg) al = ar = seg / 3;
  return [first, add(first, mul(t1, al)), add(last, mul(t2, ar)), last];
}

function fit(pts: Pt[], t1: Pt, t2: Pt, tol: number): Bez[] {
  const first = pts[0], last = pts[pts.length - 1];
  if (pts.length === 2) {
    const d = dist(first, last) / 3;
    return [[first, add(first, mul(t1, d)), add(last, mul(t2, d)), last]];
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  let u = cum.map((c) => c / cum[cum.length - 1]);
  let bez = generate(pts, u, t1, t2);
  const error = () => {
    let max = 0, at = Math.floor(pts.length / 2);
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(bezAt(bez, u[i]), pts[i]);
      if (d > max) { max = d; at = i; }
    }
    return { max, at };
  };
  let e = error();
  for (let it = 0; it < 6 && e.max > tol && e.max < tol * 8; it++) {
    // Newton-Raphson step towards each point's nearest parameter.
    u = u.map((t, i) => {
      const s = 1 - t, q = bezAt(bez, t), d = sub(q, pts[i]);
      const q1 = add(add(mul(sub(bez[1], bez[0]), 3 * s * s), mul(sub(bez[2], bez[1]), 6 * s * t)), mul(sub(bez[3], bez[2]), 3 * t * t));
      const q2 = add(mul(add(sub(bez[2], mul(bez[1], 2)), bez[0]), 6 * s), mul(add(sub(bez[3], mul(bez[2], 2)), bez[1]), 6 * t));
      const den = dot(q1, q1) + dot(d, q2);
      return den ? Math.min(1, Math.max(0, t - dot(d, q1) / den)) : t;
    });
    bez = generate(pts, u, t1, t2);
    e = error();
  }
  if (e.max <= tol) return [bez];
  const split = Math.min(pts.length - 2, Math.max(1, e.at));
  const tc = unit(sub(pts[split - 1], pts[split + 1]));
  return [...fit(pts.slice(0, split + 1), t1, tc, tol), ...fit(pts.slice(split), mul(tc, -1), t2, tol)];
}

/** Tangent at an end, read a few points in so small steps do not tilt it. */
const endTangent = (pts: Pt[], fromEnd: boolean): Pt => {
  const k = Math.min(pts.length - 1, 4);
  return fromEnd ? unit(sub(pts[pts.length - 1 - k], pts[pts.length - 1])) : unit(sub(pts[k], pts[0]));
};

const num = (v: number) => {
  const s = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

/** One <path> d: split at corners, smoothed, fitted. */
function pathData(line: Line): string {
  const { pts, closed } = line;
  if (len(pts) < 0.3) return `M${num(pts[0][0])} ${num(pts[0][1])}h.01`;
  const cuts = corners(pts, 6, closed);
  let pieces: Pt[][];
  if (closed && cuts.length) {
    const rot = [...pts.slice(cuts[0]), ...pts.slice(0, cuts[0] + 1)];
    const local = [...cuts.map((i) => i - cuts[0]), rot.length - 1];
    pieces = local.slice(1).map((end, j) => rot.slice(local[j], end + 1));
  } else if (closed) {
    pieces = [[...pts, pts[0]]];
  } else {
    const bounds = [0, ...cuts, pts.length - 1];
    pieces = bounds.slice(1).map((end, j) => pts.slice(bounds[j], end + 1));
  }
  let d = '';
  pieces.filter((p) => p.length > 1 && len(p) > 0.01).forEach((raw, k) => {
    const p = smooth(raw, SMOOTH);
    const bez = fit(p, endTangent(p, false), endTangent(p, true), FIT_TOL);
    if (k === 0) d += `M${num(bez[0][0][0])} ${num(bez[0][0][1])}`;
    for (const b of bez) d += `C${num(b[1][0])} ${num(b[1][1])} ${num(b[2][0])} ${num(b[2][1])} ${num(b[3][0])} ${num(b[3][1])}`;
  });
  return closed ? `${d}Z` : d;
}


interface IconReport { id: number; name: string; unitsPerPx: number; origin: Pt; shapes: number; strokes: number; segments: number }

function convert(id: number): { svg: string; report: IconReport } {
  const src = decode(readFileSync(`${SRC_DIR}/${id}.png`));
  const W = src.width * UP, H = src.height * UP;
  const v = upscale(whiteness(src), src.width, src.height);
  const white = new Uint8Array(W * H);
  for (let i = 0; i < white.length; i++) white[i] = v[i] > 0.5 ? 1 : 0;

  // Scale so the outer stroke, GAP outside the symbol, fits the grid.
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let i = 0; i < white.length; i++) {
    if (!white[i]) continue;
    const x = i % W, y = (i / W) | 0;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const s = (GRID - 2 * PAD - 2 * GAP) / Math.max(maxX - minX + 1, maxY - minY + 1);
  const origin: Pt = [(minX + maxX + 1) / 2, (minY + maxY + 1) / 2];
  const toUnits = ([x, y]: Pt): Pt => [GRID / 2 + (x + 0.5 - origin[0]) * s, GRID / 2 + (y + 0.5 - origin[1]) * s];
  const gap = GAP / s, speck = (SPECK / s) ** 2;

  // The white shapes, and every pixel's distance to each of them.
  const { parts } = regions(white, W, H);
  const shapes = parts.slice(1).filter((p) => p.length >= speck);
  const near = shapes.map((p) => {
    const seed = new Uint8Array(W * H);
    for (const i of p) seed[i] = 1;
    return distance(seed, W, H);
  });
  const nearest = new Int32Array(W * H), dmin = new Float64Array(W * H).fill(Infinity);
  near.forEach((d, k) => { for (let i = 0; i < d.length; i++) if (d[i] < dmin[i]) { dmin[i] = d[i]; nearest[i] = k; } });
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  // The band: everything within GAP of a shape. A small enclosed pocket outside it that touches only two
  // shapes is a wider stretch of the gap between them, so their line runs straight through it. A pocket
  // where three or more shapes meet stays open space with its own outline.
  const inBand = new Uint8Array(W * H);
  for (let i = 0; i < inBand.length; i++) inBand[i] = dmin[i] < gap ? 1 : 0;
  const { parts: pockets } = regions(inBand.map((b) => 1 - b), W, H);
  for (const pocket of pockets.slice(1)) {
    if (pocket.some((i) => i % W === 0 || i % W === W - 1 || i < W || i >= W * (H - 1))) continue;
    const xs = pocket.map((i) => i % W), ys = pocket.map((i) => (i / W) | 0);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * s;
    if (size < POCKET && new Set(pocket.map((i) => nearest[i])).size === 2) for (const i of pocket) inBand[i] = 2;
  }
  const band = (x: number, y: number) => (!inside(x, y) ? -gap : inBand[y * W + x] === 2 ? gap / 2 : gap - dmin[y * W + x]);

  // 1. The outline of the band: the outer stroke, and the edge of any open space inside.
  const lines: Line[] = contours(band, W, H, () => true);
  // 2. Zone borders: between each pair of neighbouring shapes, where both are inside the band.
  const pairs = new Set<string>();
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const i = y * W + x;
    for (const j of [i + 1, i + W]) {
      if (nearest[i] !== nearest[j] && inBand[i] && inBand[j]) pairs.add([nearest[i], nearest[j]].sort((a, b) => a - b).join(','));
    }
  }
  for (const pair of [...pairs].sort()) {
    const [a, b] = pair.split(',').map(Number);
    const cell = (x: number, y: number) => [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].every(([cx, cy]) => {
      const i = cy * W + cx;
      return inBand[i] > 0 && (nearest[i] === a || nearest[i] === b);
    });
    lines.push(...contours((x, y) => near[b][y * W + x] - near[a][y * W + x], W, H, cell));
  }
  // 3. Holes too narrow for the band to leave an outline inside: one line down the middle.
  const { parts: dark } = regions(white.map((w) => 1 - w), W, H);
  for (const hole of dark.slice(1)) {
    if (hole.some((i) => i % W === 0 || i % W === W - 1 || i < W || i >= W * (H - 1))) continue; // the outside, not a hole
    if (hole.length < speck || hole.some((i) => dmin[i] > gap)) continue;
    const mid = spine(hole, W, 2);
    if (mid.length) lines.push({ pts: mid, closed: false });
  }

  const unitLines = join(lines.map((l) => resample({ pts: l.pts.map(toUnits), closed: l.closed }, STEP)).filter((l) => len(l.pts) > 0.3));
  let segments = 0;
  const paths = unitLines
    .map((l) => {
      const d = pathData(l);
      segments += (d.match(/C/g) ?? []).length;
      return { d, key: Math.min(...l.pts.map((p) => Math.round(p[1] * 10) * 1000 + p[0])) };
    })
    .sort((p, q) => p.key - q.key)
    .map((p) => `  <path d="${p.d}"/>`);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
    ...paths,
    '</svg>',
    '',
  ].join('\n');
  return { svg, report: { id, name: NAMES[id - 1], unitsPerPx: s, origin, shapes: shapes.length, strokes: paths.length, segments } };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const reports: IconReport[] = [];
  for (let id = 1; id <= 18; id++) {
    const { svg, report } = convert(id);
    writeFileSync(`${OUT_DIR}/${String(id).padStart(2, '0')}-${report.name}.svg`, svg);
    reports.push(report);
  }
  writeFileSync(`${OUT_DIR}/report.json`, `${JSON.stringify({ up: UP, gap: GAP, fitTol: FIT_TOL, icons: reports }, null, 2)}\n`);
  console.log(`${OUT_DIR}/: 18 icons`);
  for (const r of reports) {
    console.log(`  ${String(r.id).padStart(2)} ${r.name.padEnd(9)} shapes ${String(r.shapes).padStart(2)}  strokes ${String(r.strokes).padStart(2)}  curve segments ${String(r.segments).padStart(3)}`);
  }
}

main();
