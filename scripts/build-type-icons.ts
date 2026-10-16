import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decode, type Raster } from './png-rgba';

const SRC_DIR = 'public/sprites/types/small';
const OUT_DIR = 'docs/design/type-icons';
const NAMES = [
  'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
  'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy',
];

const UP = 10;
const GRID = 24;
const PAD = 2;
const GAP = Number(process.env.TYPE_ICON_GAP ?? 1.3);
const POCKET = 4;
const SPOT = 1.5;
const SPECK = 0.6;
const STEP = 0.1;
const SMOOTH = 5;
const SNAP = 0.7;
const FIT_TOL = 0.18;
const CORNER_DEG = 50;
const LEAF = 0.8;
const COLLAPSE = 2;
const CONTINUE_DEG = 45;
const CONTINUE_AXIS_DEG = 70;
const STRAIGHT = 0.045;
const STRAIGHT_MAX = 0.7;
const STRAIGHT_MIN = 5;
const SYMMETRIC = 0.98;

type Pt = [number, number];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const len = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(p, pts[i]), 0);

function whiteness({ width, height, data }: Raster): Float64Array {
  const bgAt = ((height >> 1) * width + 4) * 4;
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

function cubicWeights(t: number): number[] {
  const t2 = t * t, t3 = t2 * t;
  return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2];
}

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

interface Line { pts: Pt[]; closed: boolean; cuts?: number[] }

function contours(f: (x: number, y: number) => number, W: number, H: number, use: (x: number, y: number) => boolean): Line[] {
  const point = (x: number, y: number, e: number): Pt => {
    const [ax, ay, bx, by] = [[x, y, x + 1, y], [x + 1, y, x + 1, y + 1], [x, y + 1, x + 1, y + 1], [x, y, x, y + 1]][e];
    const va = f(ax, ay), vb = f(bx, by), t = va / (va - vb);
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  };
  const key = (x: number, y: number, e: number) => (e === 0 ? `h${x},${y}` : e === 2 ? `h${x},${y + 1}` : e === 1 ? `v${x + 1},${y}` : `v${x},${y}`);
  const corner = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const next = new Map<string, string>(), at = new Map<string, Pt>(), incoming = new Set<string>();
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    if (!use(x, y)) continue;
    const c = corner.map(([dx, dy]) => f(x + dx, y + dy) > 0);
    const crossed = [0, 1, 2, 3].filter((e) => c[e] !== c[(e + 1) % 4]);
    if (!crossed.length) continue;
    let pairs: [number, number][];
    if (crossed.length === 2) pairs = [[crossed[0], crossed[1]]];
    else {
      const centre = f(x, y) + f(x + 1, y) + f(x + 1, y + 1) + f(x, y + 1) > 0;
      pairs = c[0] !== centre ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
    }
    for (const [e1, e2] of pairs) {

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

function smooth(pts: Pt[], w: number): Pt[] {
  return pts.map((p, i) => {
    const r = Math.min(w, i, pts.length - 1 - i);
    if (r <= 0) return p;
    let sx = 0, sy = 0;
    for (let j = i - r; j <= i + r; j++) { sx += pts[j][0]; sy += pts[j][1]; }
    return [sx / (2 * r + 1), sy / (2 * r + 1)];
  });
}

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

const endTangent = (pts: Pt[], fromEnd: boolean): Pt => {
  const k = Math.min(pts.length - 1, 4);
  return fromEnd ? unit(sub(pts[pts.length - 1 - k], pts[pts.length - 1])) : unit(sub(pts[k], pts[0]));
};

const num = (v: number) => {
  const s = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

function curve({ pts, closed, cuts: hard }: Line, t0?: Pt, t1?: Pt): Bez[] {
  const cuts = [...new Set([...corners(pts, 6, closed), ...(hard ?? [])])].sort((a, b) => a - b);
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
  pieces = pieces.filter((p) => p.length > 1 && len(p) > 0.01);
  return pieces.flatMap((raw, k) => {
    if (raw.length === 2) return [segment(raw[0], raw[1])];
    const p = smooth(raw, SMOOTH);
    const a = k === 0 && t0 ? t0 : endTangent(p, false), b = k === pieces.length - 1 && t1 ? t1 : endTangent(p, true);
    return fit(p, a, b, FIT_TOL);
  });
}

const mirrorPt = ([x, y]: Pt): Pt => [GRID - x, y];
const reverseBez = (bez: Bez[]): Bez[] => bez.slice().reverse().map((b) => [b[3], b[2], b[1], b[0]] as Bez);

function pathData(bez: Bez[], closed: boolean): string {
  if (!bez.length) return '';
  let d = `M${num(bez[0][0][0])} ${num(bez[0][0][1])}`;
  for (const b of bez) {
    const straight = dist(b[1], add(b[0], mul(sub(b[3], b[0]), 1 / 3))) < 1e-6 && dist(b[2], add(b[0], mul(sub(b[3], b[0]), 2 / 3))) < 1e-6;
    d += straight ? `L${num(b[3][0])} ${num(b[3][1])}` : `C${num(b[1][0])} ${num(b[1][1])} ${num(b[2][0])} ${num(b[2][1])} ${num(b[3][0])} ${num(b[3][1])}`;
  }
  return closed ? `${d}Z` : d;
}
const segment = (a: Pt, b: Pt): Bez => [a, add(a, mul(sub(b, a), 1 / 3)), add(a, mul(sub(b, a), 2 / 3)), b];

const keyOf = (p: Pt) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

function pieces(lines: Line[]): Line[] {
  const joints = new Set<string>();
  for (const l of lines) if (!l.closed) { joints.add(keyOf(l.pts[0])); joints.add(keyOf(l.pts[l.pts.length - 1])); }
  const out: Line[] = [];
  for (const l of lines) {
    const n = l.pts.length;
    const cuts = l.pts.map((p, i) => (joints.has(keyOf(p)) && (l.closed || (i > 0 && i < n - 1)) ? i : -1)).filter((i) => i >= 0);
    if (!cuts.length) { out.push(l); continue; }
    if (l.closed) {
      for (let k = 0; k < cuts.length; k++) {
        const a = cuts[k], b = cuts[(k + 1) % cuts.length];
        out.push({ pts: b > a ? l.pts.slice(a, b + 1) : [...l.pts.slice(a), ...l.pts.slice(0, b + 1)], closed: false });
      }
    } else {
      const bounds = [0, ...cuts, n - 1];
      for (let k = 0; k + 1 < bounds.length; k++) out.push({ pts: l.pts.slice(bounds[k], bounds[k + 1] + 1), closed: false });
    }
  }
  return out.filter((l) => l.pts.length > 1);
}

interface End { l: Line; first: boolean }
function leaving(e: End): Pt {
  const pts = e.first ? e.l.pts : e.l.pts.slice().reverse();
  let k = 1;
  while (k < pts.length - 1 && dist(pts[k], pts[0]) < 1) k++;
  return unit(sub(pts[k], pts[0]));
}
function jointsOf(lines: Line[]): Map<string, End[]> {
  const m = new Map<string, End[]>();
  for (const l of lines) if (!l.closed) for (const first of [true, false]) {
    const k = keyOf(first ? l.pts[0] : l.pts[l.pts.length - 1]);
    m.set(k, [...(m.get(k) ?? []), { l, first }]);
  }
  return m;
}
const turn = (a: End, b: End) => (Math.acos(Math.max(-1, Math.min(1, -dot(leaving(a), leaving(b))))) * 180) / Math.PI;

function continuing(ends: End[], onAxis = false): [End, End] | null {
  const pairs: { a: End; b: End; t: number }[] = [];
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
    if (ends[i].l === ends[j].l && ends.length > 2) continue;
    if (onAxis) {
      const u = leaving(ends[i]), v = leaving(ends[j]);
      if (Math.abs(u[0] + v[0]) > 0.15 || Math.abs(u[1] - v[1]) > 0.15) continue;
    }
    pairs.push({ a: ends[i], b: ends[j], t: turn(ends[i], ends[j]) });
  }
  pairs.sort((p, q) => p.t - q.t);
  if (!pairs.length || pairs[0].t > (onAxis ? CONTINUE_AXIS_DEG : CONTINUE_DEG)) return null;
  const rival = pairs.slice(1).find((p) => [p.a, p.b].some((e) => e === pairs[0].a || e === pairs[0].b));
  if (rival && rival.t - pairs[0].t < 5) return null;
  return [pairs[0].a, pairs[0].b];
}

function moveEnd(e: End, to: Pt) {
  const pts = e.first ? e.l.pts : e.l.pts.reverse();
  const from = pts[0], reach = dist(from, to);
  while (pts.length > 2 && dist(pts[1], from) < reach) pts.splice(1, 1);
  pts[0] = to;
  if (!e.first) e.l.pts.reverse();
}

function symmetrize(lines: Line[]): Line[] {
  const C = GRID / 2, out: Line[] = [];
  for (const l of lines) {
    if (l.pts.every((p) => Math.abs(p[0] - C) < 0.05)) { out.push({ pts: l.pts.map((p) => [C, p[1]] as Pt), closed: l.closed }); continue; }
    const src = l.closed ? [...l.pts, l.pts[0]] : l.pts;
    let pts = src;
    if (l.closed) {
      const r = src.findIndex((p) => p[0] > C);
      if (r < 0) { out.push(l, { pts: l.pts.map(mirrorPt), closed: true }); continue; }
      const body = src.slice(0, -1);
      pts = [...body.slice(r), ...body.slice(0, r + 1)];
    }
    let run: Pt[] = [];
    const flush = () => { if (run.length > 1) out.push({ pts: run, closed: false }, { pts: run.map(mirrorPt), closed: false }); run = []; };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[i - 1];
      if (q && (q[0] - C) * (p[0] - C) < 0) {
        const x: Pt = [C, q[1] + ((p[1] - q[1]) * (C - q[0])) / (p[0] - q[0])];
        if (p[0] < C) run = [x]; else { run.push(x); flush(); }
      }
      if (p[0] <= C) run.push(p[0] === C ? [C, p[1]] : p);
    }
    flush();
  }
  for (const l of out) for (const p of l.pts) if (Math.abs(p[0] - C) < 1e-3) p[0] = C;
  const axisEnds = out.flatMap((l) => (l.closed ? [] : [l.pts[0], l.pts[l.pts.length - 1]])).filter((p) => p[0] === C).sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < axisEnds.length;) {
    let j = i;
    while (j + 1 < axisEnds.length && axisEnds[j + 1][1] - axisEnds[j][1] < SNAP) j++;
    const y = axisEnds.slice(i, j + 1).reduce((a, p) => a + p[1], 0) / (j - i + 1);
    for (let k = i; k <= j; k++) axisEnds[k][1] = y;
    i = j + 1;
  }
  return out;
}

function cleanUp(input: Line[], symmetric: boolean): Line[] {
  const onAxis = (k: string) => symmetric && Math.abs(Number(k.split(',')[0]) - GRID / 2) < 0.05;
  let lines = pieces(input);
  for (let changed = true; changed;) {
    changed = false;
    const j = jointsOf(lines);
    const drop = lines.find((l) => !l.closed && len(l.pts) < LEAF && [j.get(keyOf(l.pts[0]))!.length, j.get(keyOf(l.pts[l.pts.length - 1]))!.length].sort().join() === '1,3');
    if (drop) { lines = lines.filter((l) => l !== drop); changed = true; }
  }

  for (let changed = true; changed;) {
    changed = false;
    const j = jointsOf(lines);
    const link = lines
      .filter((l) => !l.closed && len(l.pts) < COLLAPSE && j.get(keyOf(l.pts[0]))!.length >= 3 && j.get(keyOf(l.pts[l.pts.length - 1]))!.length >= 3)
      .sort((p, q) => len(p.pts) - len(q.pts))[0];
    if (!link) break;
    const ka = keyOf(link.pts[0]), kb = keyOf(link.pts[link.pts.length - 1]);
    const others = (k: string) => j.get(k)!.filter((e) => e.l !== link);
    const smoothA = continuing(others(ka), onAxis(ka)), smoothB = continuing(others(kb), onAxis(kb));
    const reach = (p: [End, End] | null) => (p ? len(p[0].l.pts) + len(p[1].l.pts) : 0);
    const target: Pt = reach(smoothA) > reach(smoothB) ? link.pts[0] : reach(smoothB) > reach(smoothA) ? link.pts[link.pts.length - 1] : link.pts[Math.floor(link.pts.length / 2)];
    lines = lines.filter((l) => l !== link);
    for (const e of [...others(ka), ...others(kb)]) moveEnd(e, target);
    changed = true;
  }

  for (let changed = true; changed;) {
    changed = false;
    const through = new Set<string>();
    for (const l of lines) (l.closed ? l.pts : l.pts.slice(1, -1)).forEach((p) => through.add(keyOf(p)));
    for (const [k, ends] of jointsOf(lines)) {
      const pair = ends.length === 2 && !through.has(k) ? (ends as [End, End]) : continuing(ends, onAxis(k));
      if (!pair) continue;
      const [a, b] = pair;
      if (a.l === b.l) { a.l.closed = true; a.l.pts.pop(); changed = true; break; }
      const pa = a.first ? a.l.pts.slice().reverse() : a.l.pts, pb = b.first ? b.l.pts : b.l.pts.slice().reverse();
      lines = [...lines.filter((l) => l !== a.l && l !== b.l), { pts: [...pa, ...pb.slice(1)], closed: false }];
      changed = true;
      break;
    }
  }

  for (const l of lines) {
    if (l.closed || len(l.pts) < STRAIGHT_MIN) continue;
    const pts = l.pts, n = pts.length;
    const straight = (i: number, j: number) => {
      const a = pts[i], u = unit(sub(pts[j], a));
      let dev = 0;
      for (let k = i + 1; k < j; k++) dev = Math.max(dev, Math.abs((pts[k][0] - a[0]) * u[1] - (pts[k][1] - a[1]) * u[0]));
      return dev <= Math.min(STRAIGHT_MAX, STRAIGHT * dist(a, pts[j]));
    };

    const midAxis = (k: number) => symmetric && k > 0 && k < n - 1 && Math.abs(pts[k][0] - GRID / 2) < 0.3;
    const runs: [number, number][] = [];
    for (let i = 0; i < n - 1;) {
      let best = -1;
      for (let j = n - 1; j > i; j--) if (dist(pts[i], pts[j]) >= STRAIGHT_MIN && !midAxis(i) && !midAxis(j) && straight(i, j)) { best = j; break; }
      if (best < 0) { i++; continue; }
      runs.push([i, best]);
      i = best;
    }
    if (!runs.length) continue;
    const j = jointsOf(lines);
    const out: Pt[] = [], cuts: number[] = [];
    let at = 0;
    for (const [i, k] of runs) {
      out.push(...pts.slice(at, i));
      const a = pts[i], b = pts[k], u = unit(sub(b, a));
      for (const p of pts.slice(i + 1, k)) for (const e of j.get(keyOf(p)) ?? []) if (e.l !== l) moveEnd(e, add(a, mul(u, dot(sub(p, a), u))));
      cuts.push(out.length);
      out.push(a);
      cuts.push(out.length);
      out.push(b);
      at = k + 1;
    }
    out.push(...pts.slice(at));
    l.pts = out;
    l.cuts = [...new Set(cuts)].filter((c) => c > 0 && c < out.length - 1);
  }

  if (symmetric) {
    const C = GRID / 2;
    for (const l of lines) {
      const pts = l.pts, n = pts.length;
      const m = pts.findIndex((p, k) => p[0] === C && (l.closed || (k > 0 && k < n - 1)));
      if (m < 0 || l.cuts?.length) continue;
      let k = m;
      for (let walked = 0; walked < 1.5;) { const prev = (k - 1 + n) % n; if (!l.closed && prev > k) break; walked += dist(pts[k], pts[prev]); k = prev; if (k === m) break; }
      const q = pts[k], before = pts[(k - 1 + n) % n];
      const dx = q[0] - C;
      if (Math.abs(dx) < 0.5 || q[0] === before[0]) continue;
      const slope = (q[1] - before[1]) / (q[0] - before[0]);
      if (Math.abs(slope) > Math.tan((60 * Math.PI) / 180)) continue;
      const kk = slope / (2 * dx), top = q[1] - kk * dx * dx;
      const old = pts[m], j = jointsOf(lines).get(keyOf(old)) ?? [];
      for (let t = k; t !== (2 * m - k + n) % n; t = (t + 1) % n) {
        const x = pts[t][0];
        if (Math.abs(x - C) <= Math.abs(dx)) pts[t] = [x, top + kk * (x - C) * (x - C)];
      }
      for (const e of j) if (e.l !== l) moveEnd(e, pts[m]);
    }
  }

  return lines;
}

interface Drawn { bez: Bez[]; closed: boolean }

function draw(lines: Line[], symmetric: boolean): Drawn[] {
  const fitted = (l: Line, t0?: Pt, t1?: Pt): Bez[] =>
    len(l.pts) < 0.3 ? [segment(l.pts[0], add(l.pts[0], [0.01, 0]))] : l.pts.length === 2 && !l.closed ? [segment(l.pts[0], l.pts[1])] : curve(l, t0, t1);
  if (!symmetric) return lines.map((l) => ({ bez: fitted(l), closed: l.closed }));
  const C = GRID / 2;
  const near = (p: Pt, l: Line) => Math.min(...densify(l).map((q) => dist(p, q)));
  const mirrorOf = (l: Line, m: Line) => { const pts = densify(l).map(mirrorPt); return pts.reduce((s, p) => s + near(p, m), 0) / pts.length; };
  const out: Drawn[] = [], done = new Set<Line>();
  for (const l of lines) {
    if (done.has(l)) continue;
    done.add(l);
    const xs = l.pts.map((p) => p[0]);
    if (Math.max(...xs) < C + 0.05 || Math.min(...xs) > C - 0.05) {
      const twin = lines.find((m) => !done.has(m) && mirrorOf(l, m) < 0.4);
      if (twin) done.add(twin);
      const left = Math.max(...xs) <= C + 0.05 ? l : twin;
      if (!left) { out.push({ bez: fitted(l), closed: l.closed }); continue; }
      const bez = fitted(left);
      out.push({ bez, closed: left.closed }, { bez: bez.map((b) => b.map(mirrorPt) as Bez), closed: left.closed });
      continue;
    }
    out.push({ bez: mirrorHalf(l, fitted), closed: false });
  }
  return out;
}

function densify(l: Line): Pt[] {
  const out: Pt[] = [l.pts[0]];
  const src = l.closed ? [...l.pts, l.pts[0]] : l.pts;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i], n = Math.max(1, Math.ceil(dist(a, b) / STEP));
    for (let k = 1; k <= n; k++) out.push(add(a, mul(sub(b, a), k / n)));
  }
  return out;
}

function mirrorHalf(l: Line, fitted: (l: Line, t0?: Pt, t1?: Pt) => Bez[]): Bez[] {
  const C = GRID / 2, pts = l.pts, n = pts.length, hard = l.cuts ?? [];
  const cross: { i: number; p: Pt }[] = [];
  for (let i = 0; i < (l.closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if ((a[0] - C) * (b[0] - C) <= 0 && a[0] !== b[0]) cross.push({ i, p: add(a, mul(sub(b, a), (C - a[0]) / (b[0] - a[0]))) });
  }

  const level = (half: Pt[]) => {
    const end = half[half.length - 1];
    let k = half.length - 2;
    while (k > 0 && dist(half[k], end) < 1.5) k--;
    const d = unit(sub(end, half[k]));
    return Math.abs(d[1]) < Math.sin((60 * Math.PI) / 180);
  };
  const mirrored = (bez: Bez[]) => [...bez, ...reverseBez(bez.map((b) => b.map(mirrorPt) as Bez))];
  if (!l.closed && cross.length >= 1) {
    const c = cross[0], startLeft = pts[0][0] < C;
    const idx = startLeft ? pts.slice(0, c.i + 1).map((_, k) => k) : pts.slice(c.i + 1).map((_, k) => c.i + 1 + k).reverse();
    const half = [...idx.map((k) => pts[k]), c.p];
    const cuts = idx.map((k, at) => (hard.includes(k) ? at : -1)).filter((at) => at > 0);
    const inRun = hard.includes(c.i) && hard.includes(c.i + 1);
    if (inRun) cuts.push(half.length - 2);
    const piece: Line = { pts: half, closed: false, cuts: [...new Set(cuts)].filter((at) => at > 0 && at < half.length - 1) };
    return mirrored(fitted(piece, undefined, !inRun && level(half) ? [-1, 0] : undefined));
  }
  if (l.closed && cross.length >= 2) {
    const [c1, c2] = cross[0].p[1] < cross[1].p[1] ? [cross[0], cross[1]] : [cross[1], cross[0]];
    const walk = (dir: 1 | -1) => {
      const out: Pt[] = [c1.p];
      for (let i = dir === 1 ? (c1.i + 1) % n : c1.i, guard = 0; guard <= n; i = (i + dir + n) % n, guard++) {
        out.push(pts[i]);
        if (i === (dir === 1 ? c2.i : (c2.i + 1) % n)) break;
      }
      out.push(c2.p);
      return out;
    };
    const a = walk(1), b = walk(-1);
    const left = Math.min(...a.map((p) => p[0])) < Math.min(...b.map((p) => p[0])) ? a : b;
    const t0 = level(left.slice().reverse()) ? ([-1, 0] as Pt) : undefined;
    const t1 = level(left) ? ([1, 0] as Pt) : undefined;
    return mirrored(fitted({ pts: left, closed: false }, t0 && left[1][0] < C ? t0 : t0 ? [1, 0] : undefined, t1));
  }
  return fitted(l);
}

interface IconReport { id: number; name: string; unitsPerPx: number; origin: Pt; symmetric: boolean; shapes: number; strokes: number; segments: number }

function convert(id: number): { svg: string; report: IconReport } {
  const src = decode(readFileSync(`${SRC_DIR}/${id}.png`));
  const W = src.width * UP, H = src.height * UP;
  const v = upscale(whiteness(src), src.width, src.height);
  let white = new Uint8Array(W * H);
  for (let i = 0; i < white.length; i++) white[i] = v[i] > 0.5 ? 1 : 0;
  let lo = W, hi = -1;
  for (let i = 0; i < white.length; i++) if (white[i]) { lo = Math.min(lo, i % W); hi = Math.max(hi, i % W); }
  const flip = (i: number) => (((i / W) | 0) * W) + (lo + hi - (i % W));
  let both = 0, either = 0;
  for (let i = 0; i < white.length; i++) {
    const x = i % W, m = lo + hi - x, f = m >= 0 && m < W && white[flip(i)];
    if (white[i] && f) both++;
    if (white[i] || f) either++;
  }
  const symmetric = both / either >= SYMMETRIC;
  if (symmetric) {
    for (let i = 0; i < v.length; i++) { const x = i % W, m = lo + hi - x; if (m >= 0 && m < W && m > x) { const a = (v[i] + v[flip(i)]) / 2; v[i] = a; v[flip(i)] = a; } }
    white = new Uint8Array(W * H);
    for (let i = 0; i < white.length; i++) white[i] = v[i] > 0.5 ? 1 : 0;
  }

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

  const inBand = new Uint8Array(W * H);
  for (let i = 0; i < inBand.length; i++) inBand[i] = dmin[i] < gap ? 1 : 0;
  const { parts: pockets } = regions(inBand.map((b) => 1 - b), W, H);
  for (const pocket of pockets.slice(1)) {
    if (pocket.some((i) => i % W === 0 || i % W === W - 1 || i < W || i >= W * (H - 1))) continue;
    const xs = pocket.map((i) => i % W), ys = pocket.map((i) => (i / W) | 0);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * s;
    const touching = new Set(pocket.map((i) => nearest[i])).size;
    if (size < SPOT || (size < POCKET && touching === 2)) for (const i of pocket) inBand[i] = 2;
  }
  const band = (x: number, y: number) => (!inside(x, y) ? -gap : inBand[y * W + x] === 2 ? gap / 2 : gap - dmin[y * W + x]);

  const lines: Line[] = contours(band, W, H, () => true);
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
  const { parts: dark } = regions(white.map((w) => 1 - w), W, H);
  for (const hole of dark.slice(1)) {
    if (hole.some((i) => i % W === 0 || i % W === W - 1 || i < W || i >= W * (H - 1))) continue;
    if (hole.length < speck || hole.some((i) => dmin[i] > gap)) continue;
    const mid = spine(hole, W, 2);
    if (mid.length) lines.push({ pts: mid, closed: false });
  }

  const traced = join(lines.map((l) => resample({ pts: l.pts.map(toUnits), closed: l.closed }, STEP)).filter((l) => len(l.pts) > 0.3));
  const unitLines = cleanUp(symmetric ? symmetrize(traced) : traced, symmetric);
  let segments = 0;
  const paths = draw(unitLines, symmetric)
    .map(({ bez, closed }) => {
      const d = pathData(bez, closed);
      segments += bez.length;
      return { d, key: Math.min(...bez.map((b) => Math.round(b[0][1] * 10) * 1000 + b[0][0])) };
    })
    .filter((p) => p.d)
    .sort((p, q) => p.key - q.key || (p.d < q.d ? -1 : 1))
    .map((p) => `  <path d="${p.d}"/>`);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,
    ...paths,
    '</svg>',
    '',
  ].join('\n');
  return { svg, report: { id, name: NAMES[id - 1], unitsPerPx: s, origin, symmetric, shapes: shapes.length, strokes: paths.length, segments } };
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
