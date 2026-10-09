import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decode, type Raster } from './png-rgba';

/**
 * Convert each Gen IX type symbol into a line icon in the app's lucide style:
 * a 24-unit grid, a 2-unit stroke, round caps and joins, and no fill.
 *
 * One rule decides where the strokes go. A stroke runs along each edge between
 * the white symbol and the coloured field. Where two edges run side by side,
 * facing each other, closer than MERGE units, two strokes would print as one
 * blot, so they become a single stroke along the middle: a thin gap or a thin
 * white part turns into one line. Edges that only meet at a point, like the
 * two sides of a sharp tip, are not side by side, so tips stay sharp outlines.
 *
 * Steps: upscale the 60 px icon 10x, trace the symbol's outlines (marching
 * squares), resample them evenly, pair up facing edges, replace each pair with
 * its midline, drop the round end of each merged part (the stroke's round cap
 * draws it), and fit cubic Béziers.
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
/** Units. Two 2-unit strokes need 1 unit of clear space to read as two lines. */
const MERGE = 3;
/** Units between resampled outline points. */
const STEP = 0.1;
/** Degrees. Facing edges must be this close to anti-parallel to merge. */
const FACING_DEG = 30;
/** Units of outline either side of a point that cannot be its partner (keeps tips apart). */
const SELF_GAP = 2;
/** Units. Shorter merged runs are noise. */
const RUN_MIN = 0.8;
/** A merged run continues while its edges stay within MERGE x HOLD, so edges near the limit do not flicker. */
const HOLD = 1.2;
/** Units. A shorter break between two merged runs on the same pair of edges is closed. */
const GAP_FILL = 1;
/** Outline points (±) averaged to remove the source's pixel steps, about 1 unit in all. */
const SMOOTH = 5;
/** Outline points. A midline continues across a jump this small in its partner edge. */
const PARTNER_JUMP = 20;
/** Units. Line ends this close are joined at one point. */
const SNAP = 0.8;
/** An edge joining a midline is trimmed back this many times its sideways step, so it meets the midline as a Y. */
const TAPER = 2;
/** Units. A loose piece of edge shorter than this is dropped. */
const SPECK = 0.8;
/** Units. A part (or hole) whose outline fits in a box this size is drawn as one dot. */
const DOT = 3.2;
/** Units. A part narrower than DOT and shorter than this is drawn as one dash along its length. */
const DASH = 6;
/** Units. A branch this short with one free end is a stub left by merging, not a feature. */
const STUB = 1;
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
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
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

/**
 * Closed outlines of the region `v > 0.5`, by marching squares on pixel centres.
 * Every outline is oriented with white on its left, so the two sides of a thin
 * part, or of a thin gap, run in opposite directions.
 */
function outlines(v: Float64Array, W: number, H: number): Pt[][] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : v[y * W + x]);
  const iso = 0.5;
  // Edge ids: 0 top, 1 right, 2 bottom, 3 left of the cell whose top-left pixel is (x, y).
  const point = (x: number, y: number, e: number): Pt => {
    const [ax, ay, bx, by] = [[x, y, x + 1, y], [x + 1, y, x + 1, y + 1], [x, y + 1, x + 1, y + 1], [x, y, x, y + 1]][e];
    const va = at(ax, ay), vb = at(bx, by), t = (iso - va) / (vb - va);
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  };
  const key = (x: number, y: number, e: number) => (e === 0 ? `h${x},${y}` : e === 2 ? `h${x},${y + 1}` : e === 1 ? `v${x + 1},${y}` : `v${x},${y}`);
  const corner = [[0, 0], [1, 0], [1, 1], [0, 1]]; // TL TR BR BL
  const testCorner: Record<string, number> = { '03': 0, '01': 1, '12': 2, '23': 3, '02': 0, '13': 0 };
  const next = new Map<string, { to: string; p: Pt }>();
  for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
    const c = corner.map(([dx, dy]) => at(x + dx, y + dy) > iso);
    const crossed = [0, 1, 2, 3].filter((e) => c[e] !== c[(e + 1) % 4]);
    if (!crossed.length) continue;
    let pairs: [number, number][];
    if (crossed.length === 2) pairs = [[crossed[0], crossed[1]]];
    else {
      const centre = (at(x, y) + at(x + 1, y) + at(x + 1, y + 1) + at(x, y + 1)) / 4 > iso;
      // Saddle: a white centre joins the two white corners, cutting off the dark ones.
      const cutTL = c[0] !== centre;
      pairs = cutTL ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
    }
    for (const [e1, e2] of pairs) {
      const k = testCorner[[e1, e2].sort().join('')];
      const p = point(x, y, e1), q = point(x, y, e2), tc: Pt = [x + corner[k][0], y + corner[k][1]];
      const cross = (q[0] - p[0]) * (tc[1] - p[1]) - (q[1] - p[1]) * (tc[0] - p[0]);
      // In screen coordinates a negative cross product puts the corner on the left.
      const forward = c[k] ? cross < 0 : cross > 0;
      const [from, to] = forward ? [e1, e2] : [e2, e1];
      next.set(key(x, y, from), { to: key(x, y, to), p: point(x, y, from) });
    }
  }
  const loops: Pt[][] = [];
  const done = new Set<string>();
  for (const start of [...next.keys()].sort()) {
    if (done.has(start)) continue;
    const loop: Pt[] = [];
    for (let k = start; !done.has(k);) {
      done.add(k);
      const step = next.get(k);
      if (!step) break;
      loop.push(step.p);
      k = step.to;
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

/** Evenly spaced points along a closed outline. */
function resample(loop: Pt[], step: number): Pt[] {
  const out: Pt[] = [loop[0]];
  let carry = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], l = dist(a, b);
    let t = step - carry;
    while (t <= l) { out.push(add(a, mul(sub(b, a), t / l))); t += step; }
    carry = l - (t - step);
  }
  if (out.length > 1 && dist(out[0], out[out.length - 1]) < step / 2) out.pop();
  return out;
}

interface Sample { c: number; i: number; p: Pt; t: Pt }
interface Pair { c: number; j: number; d: number }

/** For every outline point, the nearest facing point on another edge within MERGE x HOLD, if any. */
function pairUp(loops: Pt[][]): (Pair | null)[][] {
  const byLoop: Sample[][] = loops.map((pts, c) => pts.map((p, i) => {
    const n = pts.length;
    return { c, i, p, t: unit(sub(pts[(i + 3) % n], pts[(i - 3 + n) % n])) };
  }));
  const samples = byLoop.flat();
  const reach = MERGE * HOLD;
  const cell = (p: Pt) => `${Math.floor(p[0] / reach)},${Math.floor(p[1] / reach)}`;
  const grid = new Map<string, Sample[]>();
  for (const s of samples) grid.set(cell(s.p), [...(grid.get(cell(s.p)) ?? []), s]);
  const facing = -Math.cos((FACING_DEG * Math.PI) / 180);
  const selfGap = Math.round(SELF_GAP / STEP);
  return loops.map((pts, c) => pts.map((p, i) => {
    const me = byLoop[c][i];
    const [gx, gy] = cell(p).split(',').map(Number);
    let best: Pair | null = null, bestD = reach;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const q of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
        if (q.c === c) {
          const n = pts.length, k = Math.abs(q.i - i);
          if (Math.min(k, n - k) < selfGap) continue;
        }
        const d = dist(p, q.p);
        if (d >= bestD || dot(me.t, q.t) > facing) continue;
        // The partner must lie across the edge, not along it.
        if (Math.abs(dot(unit(sub(q.p, p)), me.t)) > 0.5) continue;
        best = { c: q.c, j: q.i, d }; bestD = d;
      }
    }
    return best;
  }));
}

/** Runs of consecutive indices on a closed outline where `on(i)` holds. */
function runs(n: number, on: (i: number) => boolean): { start: number; end: number }[] {
  if (Array.from({ length: n }, (_, i) => on(i)).every(Boolean)) return [{ start: 0, end: n - 1 }];
  let s0 = 0;
  while (on(s0)) s0++;
  const out: { start: number; end: number }[] = [];
  for (let k = 0; k < n; k++) {
    const i = (s0 + k) % n;
    if (!on(i)) continue;
    if (out.length && (out[out.length - 1].end + 1) % n === i) out[out.length - 1].end = i;
    else out.push({ start: i, end: i });
  }
  return out;
}

/** A stroke: `mid` marks a midline that replaced two facing edges. */
interface Line { pts: Pt[]; closed: boolean; mid: boolean }

/** Replace facing edge pairs by their midlines and keep the remaining edges, joined to those midlines. */
function strokes(loops: Pt[][], pairs: (Pair | null)[][]): Line[] {
  const runMin = Math.round(RUN_MIN / STEP), gapFill = Math.round(GAP_FILL / STEP);
  for (const pr of pairs) {
    const n = pr.length;
    // Merge where the edges are within MERGE, then let each merged run continue while they stay within MERGE x HOLD.
    const on = pr.map((q) => !!q && q.d < MERGE);
    for (let grew = true; grew;) {
      grew = false;
      for (let i = 0; i < n; i++) {
        if (on[i] || !pr[i]) continue;
        if (on[(i + 1) % n] || on[(i - 1 + n) % n]) { on[i] = true; grew = true; }
      }
    }
    // Close short breaks between runs that merge with the same outline.
    for (const r of runs(n, (i) => !on[i])) {
      const count = (r.end - r.start + n) % n + 1;
      const a = pr[(r.start - 1 + n) % n], b = pr[(r.end + 1) % n];
      if (count >= gapFill || count === n || !a || !b || a.c !== b.c) continue;
      for (let k = 0; k < count; k++) {
        const i = (r.start + k) % n, m = loops[a.c].length;
        const j = Math.round(a.j + ((b.j - a.j + (Math.abs(b.j - a.j) > m / 2 ? (b.j > a.j ? -m : m) : 0)) * (k + 1)) / (count + 1));
        pr[i] = pr[i] && pr[i]!.c === a.c ? pr[i] : { c: a.c, j: ((j % m) + m) % m, d: MERGE };
        on[i] = true;
      }
    }
    for (let i = 0; i < n; i++) if (!on[i]) pr[i] = null;
    // Drop merged runs too short to be a feature.
    for (const r of runs(n, (i) => !!pr[i])) {
      const count = (r.end - r.start + n) % n + 1;
      if (count < runMin) for (let k = 0; k < count; k++) pr[(r.start + k) % n] = null;
    }
  }
  const midpoint = (c: number, i: number): Pt => {
    const q = pairs[c][i]!;
    return mid(loops[c][i], loops[q.c][q.j]);
  };
  const lines: Line[] = [];
  loops.forEach((pts, c) => {
    const n = pts.length, pr = pairs[c];
    // Midlines, drawn once: from the side with the smaller (outline, index).
    const emit = (i: number) => !!pr[i] && (c < pr[i]!.c || (c === pr[i]!.c && i < pr[i]!.j));
    for (const r of runs(n, emit)) {
      const count = (r.end - r.start + n) % n + 1;
      const closed = count === n && pr.every((q) => q && q.c === pr[0]!.c);
      let seg: Pt[] = [];
      for (let k = 0; k < count; k++) {
        const i = (r.start + k) % n;
        const prev = seg.length ? pr[(i - 1 + n) % n] : null;
        // A jump in the partner index means a different facing edge: start a new midline.
        if (prev && (prev.c !== pr[i]!.c || Math.min(Math.abs(prev.j - pr[i]!.j), loops[prev.c].length - Math.abs(prev.j - pr[i]!.j)) > PARTNER_JUMP)) {
          if (seg.length > 1) lines.push({ pts: seg, closed: false, mid: true });
          seg = [];
        }
        seg.push(midpoint(c, i));
      }
      if (seg.length > 1) lines.push({ pts: seg, closed, mid: true });
    }
    // Edges that face nothing stay as outline, ending on the neighbouring midline.
    const free = runs(n, (i) => !pr[i]);
    if (free.length === 1 && free[0].start === 0 && free[0].end === n - 1) {
      lines.push({ pts: pts.slice(), closed: true, mid: false });
      return;
    }
    for (const r of free) {
      const count = (r.end - r.start + n) % n + 1;
      const seg = Array.from({ length: count }, (_, k) => pts[(r.start + k) % n]);
      const before = (r.start - 1 + n) % n, after = (r.end + 1) % n;
      const a = pr[before] ? midpoint(c, before) : null, b = pr[after] ? midpoint(c, after) : null;
      // The round end of a merged part: both sides return to the same midline end. The stroke cap draws it.
      if (a && b && dist(a, b) < MERGE / 2 && len(seg) < (Math.PI * MERGE) / 2) {
        lines.push({ pts: [a, b], closed: false, mid: true, cap: farthest(seg, mid(a, b)) } as Line & { cap: Pt });
        continue;
      }
      // Trim the edge back so it joins the midline as a Y, not a notch.
      let lo = 0, hi = seg.length - 1;
      if (a) for (let walked = 0, step = TAPER * dist(seg[0], a); lo < hi - 1 && walked < step; lo++) walked += dist(seg[lo], seg[lo + 1]);
      if (b) for (let walked = 0, step = TAPER * dist(seg[seg.length - 1], b); hi > lo + 1 && walked < step; hi--) walked += dist(seg[hi], seg[hi - 1]);
      lines.push({ pts: [...(a ? [a] : []), ...seg.slice(lo, hi + 1), ...(b ? [b] : [])], closed: false, mid: false });
    }
  });
  return lines;
}

function farthest(pts: Pt[], from: Pt): Pt {
  return pts.reduce((best, p) => (dist(p, from) > dist(best, from) ? p : best), pts[0]);
}

/** Join cap markers to their midlines, and snap line ends that nearly meet. */
function assemble(lines: (Line & { cap?: Pt })[]): Line[] {
  const real = lines.filter((l) => !l.cap);
  for (const capped of lines.filter((l) => l.cap)) {
    const at = mid(capped.pts[0], capped.pts[1]);
    let best: { l: Line; end: 0 | 1 } | null = null, bestD = 0.5;
    for (const l of real) {
      if (l.closed) continue;
      for (const end of [0, 1] as const) {
        const d = dist(l.pts[end ? l.pts.length - 1 : 0], at);
        if (d < bestD) { best = { l, end }; bestD = d; }
      }
    }
    if (!best) continue;
    // Pull the end out to the part's tip, less the stroke's round cap.
    const end = best.l.pts[best.end ? best.l.pts.length - 1 : 0];
    const out = sub(capped.cap!, end), reach = Math.hypot(...out) - 1;
    if (reach > 0) {
      const tip = add(end, mul(unit(out), reach));
      if (best.end) best.l.pts.push(tip); else best.l.pts.unshift(tip);
    }
  }
  // Snap ends that land within SNAP of each other to one point.
  const ends: { l: Line; k: number }[] = real.filter((l) => !l.closed).flatMap((l) => [{ l, k: 0 }, { l, k: l.pts.length - 1 }]);
  for (let a = 0; a < ends.length; a++) {
    const group = ends.filter((e) => dist(e.l.pts[e.k], ends[a].l.pts[ends[a].k]) < SNAP);
    if (group.length < 2) continue;
    const c: Pt = mul(group.reduce((s, e) => add(s, e.l.pts[e.k]), [0, 0] as Pt), 1 / group.length);
    for (const e of group) e.l.pts[e.k] = c;
  }
  // Join two lines that meet end to end with nothing else at the joint, so no cap dot shows there.
  let live = real.slice();
  for (let joined = true; joined;) {
    joined = false;
    const open = live.filter((l) => !l.closed && l.pts.length > 1);
    const at = (l: Line, k: 0 | 1) => l.pts[k ? l.pts.length - 1 : 0];
    outer: for (const l of open) for (const k of [0, 1] as const) {
      const here = at(l, k);
      const others = open.flatMap((m) => ([0, 1] as const).filter((j) => (m !== l || j !== k) && dist(at(m, j), here) < 1e-6).map((j) => ({ m, j })));
      if (others.length !== 1) continue;
      const { m, j } = others[0];
      if (m === l) { live = live.map((x) => (x === l ? { ...l, pts: l.pts.slice(0, -1), closed: true } : x)); joined = true; break outer; }
      const a = k ? l.pts : l.pts.slice().reverse();
      const b = j ? m.pts.slice().reverse() : m.pts;
      live = [...live.filter((x) => x !== l && x !== m), { pts: [...a, ...b.slice(1)], closed: false, mid: l.mid || m.mid }];
      joined = true;
      break outer;
    }
  }
  // A short loose piece of edge is a speck left by thresholding. Midlines stay: a small part, like a pupil, is a feature.
  const touches = (l: Line) => live.some((m) => m !== l && !m.closed && [m.pts[0], m.pts[m.pts.length - 1]].some((e) => [l.pts[0], l.pts[l.pts.length - 1]].some((f) => dist(e, f) < 1e-6)));
  const kept = live.filter((l) => l.closed || l.mid || len(l.pts) >= SPECK || touches(l));
  // Drop short branches that hang off a joint with a free far end.
  const shared = (p: Pt, self: Line) => kept.some((m) => m !== self && !m.closed && (dist(m.pts[0], p) < 1e-6 || dist(m.pts[m.pts.length - 1], p) < 1e-6));
  return kept.filter((l) => l.closed || len(l.pts) >= STUB || shared(l.pts[0], l) === shared(l.pts[l.pts.length - 1], l));
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

interface IconReport { id: number; name: string; unitsPerPx: number; origin: Pt; strokes: number; merged: number; segments: number }

function convert(id: number): { svg: string; report: IconReport } {
  const src = decode(readFileSync(`${SRC_DIR}/${id}.png`));
  const W = src.width * UP, H = src.height * UP;
  const v = upscale(whiteness(src), src.width, src.height);
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let i = 0; i < v.length; i++) {
    if (v[i] <= 0.5) continue;
    const x = i % W, y = (i / W) | 0;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const s = (GRID - 2 * PAD) / Math.max(maxX - minX + 1, maxY - minY + 1);
  const origin: Pt = [(minX + maxX + 1) / 2, (minY + maxY + 1) / 2];
  const toUnits = ([x, y]: Pt): Pt => [GRID / 2 + (x + 0.5 - origin[0]) * s, GRID / 2 + (y + 0.5 - origin[1]) * s];

  const all = outlines(v, W, H).map((l) => resample(l.map(toUnits), STEP)).filter((l) => len(l) > 0.5);
  // Parts too small to outline with a 2-unit stroke become a dot, or a dash if they are long and narrow,
  // the way lucide draws eyes and specks. Measured along the part's own axes.
  const small: Line[] = [];
  const loops = all.filter((l) => {
    const c = mul(l.reduce((a, p) => add(a, p), [0, 0] as Pt), 1 / l.length);
    let xx = 0, xy = 0, yy = 0;
    for (const p of l) { const d = sub(p, c); xx += d[0] * d[0]; xy += d[0] * d[1]; yy += d[1] * d[1]; }
    const angle = Math.atan2(2 * xy, xx - yy) / 2, axis: Pt = [Math.cos(angle), Math.sin(angle)], across: Pt = [-axis[1], axis[0]];
    const extent = (u: Pt) => Math.max(...l.map((p) => dot(sub(p, c), u))) - Math.min(...l.map((p) => dot(sub(p, c), u)));
    const long = extent(axis), wide = extent(across);
    if (Math.max(long, wide) < DOT) { small.push({ pts: [c, c], closed: false, mid: true }); return false; }
    if (long < DASH && wide < DOT) {
      const half = Math.max(0, long / 2 - 1); // the round caps add 1 unit at each end
      small.push({ pts: [sub(c, mul(axis, half)), add(c, mul(axis, half))], closed: false, mid: true });
      return false;
    }
    return true;
  });
  const pairs = pairUp(loops);
  const lines = [...assemble(strokes(loops, pairs)), ...small];
  const merged = pairs.flat().filter(Boolean).length;
  let segments = 0;
  const paths = lines
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
  return { svg, report: { id, name: NAMES[id - 1], unitsPerPx: s, origin, strokes: paths.length, merged, segments } };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const reports: IconReport[] = [];
  for (let id = 1; id <= 18; id++) {
    const { svg, report } = convert(id);
    writeFileSync(`${OUT_DIR}/${String(id).padStart(2, '0')}-${report.name}.svg`, svg);
    reports.push(report);
  }
  writeFileSync(`${OUT_DIR}/report.json`, `${JSON.stringify({ up: UP, merge: MERGE, facingDeg: FACING_DEG, fitTol: FIT_TOL, icons: reports }, null, 2)}\n`);
  console.log(`${OUT_DIR}/: 18 icons`);
  for (const r of reports) {
    console.log(`  ${String(r.id).padStart(2)} ${r.name.padEnd(9)} strokes ${String(r.strokes).padStart(2)}  merged points ${String(r.merged).padStart(4)}  curve segments ${String(r.segments).padStart(3)}`);
  }
}

main();
