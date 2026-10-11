// Round 2: outline egg icons in the AppIcons idiom (24 grid, 2-unit stroke,
// round caps and joins, outline only, currentColor).
//
// Everything is drawn in the sprite's coordinates first (trace.mjs) and mapped
// to the icon grid with one uniform scale, so any icon can be laid back over
// the sprite to check the match.
import { EGG, SPOTS, S, toIcon } from './trace.mjs';
import { eggFrame, pt, polyline, samplePolyline, ellipsePts, minDist } from './geom.mjs';

/** The egg outline on the icon grid: y 2-22, centred on x 12. */
export const ICON_EGG = eggFrame({ cx: 12, cy: 12, a: EGG.a * S, b: EGG.b * S });

// --- the icon crack -------------------------------------------------------
// The traced network at the sprite's own scale is 15 x 10 px, 11 x 7 icon
// units: its forks sit 1-2 px apart, under the 2-unit stroke, so they fill in.
// Each icon network below keeps the traced topology it has room for, and each
// run keeps its traced directions: A is diagonal, down, diagonal, down (37
// degrees, as (21,9.6)->(18.5,11.5) and (18.7,12.6)->(15.2,15.2)); B is
// diagonal (52 degrees), down; B1 goes steeply down then jogs left; B2 goes
// shallow right (21 degrees) then down-right (40); C leaves A's lower diagonal
// up-left (32 degrees) to the outline. Coordinates are icon-grid units.

/** Hammer size (2-unit stroke). Every point keeps 4 units of centre-line
 *  clearance from the outline (a 2-unit gap between stroke edges), which leaves
 *  an inner egg from y 6 to 18, at most 10 units wide. That fits the stem, A's
 *  full staircase and B with its B2 turn; B1 and C need room it does not have. */
export const CRACK_HAMMER = {
  stem: [[12, 2], [12, 6]],
  A: [[12, 6], [9.9, 7.6], [9.8, 8.6], [7.9, 10.1], [7.9, 11.2]],
  B: [[12, 6], [13.6, 8.1], [13.7, 9.1], [15.7, 10.7]],
};

/** Large size (drawn 1.35x; the stroke stays the hammer's on-screen width, so
 *  1.48 units here and 2.96 of centre-line clearance): the whole traced
 *  topology, stem, A with its fork C to the outline, B forking into B1 and B2. */
export const CRACK_LARGE = {
  stem: [[12, 2], [12, 5.2]],
  A: [[12, 5.2], [10.0, 6.7], [10.0, 7.9], [7.9, 9.5], [7.9, 10.7]],
  C: [[9.0, 8.66], [7.2, 7.5], 'outline'],
  B: [[12, 5.2], [13.3, 6.9], [13.3, 8.0]],
  B1: [[13.3, 8.0], [13.8, 10.2], [13.2, 11.3]],
  B2: [[13.3, 8.0], [15.3, 8.8], [16.8, 10.1]],
};

// --- spots ----------------------------------------------------------------
/** The part of an ellipse inside the egg, as an SVG elliptical arc (icon grid). */
function spotArc([cx, cy, rx, ry], egg) {
  const c = toIcon([cx, cy]);
  const R = [rx * S, ry * S];
  const N = 1440;
  const inside = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * 2 * Math.PI;
    const p = [c[0] + R[0] * Math.cos(a), c[1] + R[1] * Math.sin(a)];
    inside.push(egg.inside(p[0], p[1]));
  }
  if (inside.every(Boolean)) {
    return { d: `M${pt([c[0] - R[0], c[1]])}A${R[0]} ${R[1]} 0 1 0 ${pt([c[0] + R[0], c[1]])}A${R[0]} ${R[1]} 0 1 0 ${pt([c[0] - R[0], c[1]])}Z`, pts: ellipsePts([c[0], c[1], R[0], R[1]]), closed: true };
  }
  // Find the run of inside angles (the arc), wrapping round.
  let start = inside.findIndex((v, i) => v && !inside[(i - 1 + N) % N]);
  let end = start;
  while (inside[(end + 1) % N]) end = (end + 1) % N;
  const ang = (i) => (i / N) * 2 * Math.PI;
  const a0 = ang(start), a1 = ang(end);
  const P = (a) => [c[0] + R[0] * Math.cos(a), c[1] + R[1] * Math.sin(a)];
  // Snap the ends onto the outline curve so the join is exact.
  const snap = (p) => egg.P(egg.nearestT(p));
  const p0 = snap(P(a0)), p1 = snap(P(a1));
  let span = a1 - a0;
  if (span < 0) span += 2 * Math.PI;
  const large = span > Math.PI ? 1 : 0;
  const pts = [];
  for (let k = 0; k <= 200; k++) pts.push(P(a0 + (span * k) / 200));
  return { d: `M${pt(p0)}A${pt(R)} 0 ${large} 1 ${pt(p1)}`, pts, closed: false };
}

// --- Togepi triangles --------------------------------------------------------
/** A triangle outline, equilateral, side L, centred at c; up = apex on top. */
function tri(c, L, up) {
  const h = (L * Math.sqrt(3)) / 2;
  const s = up ? 1 : -1;
  const v = [[c[0], c[1] - s * (2 * h) / 3], [c[0] + L / 2, c[1] + s * h / 3], [c[0] - L / 2, c[1] + s * h / 3]];
  return { d: `M${v.map(pt).join('L')}Z`, pts: samplePolyline([...v, v[0]]) };
}

/** A triangle that wraps round the egg's edge, as the red one on Togepi's
 *  sprite wraps the left side: only its part inside the outline is drawn, an
 *  open path whose two ends land on the outline. */
function wrappedTri(t, egg) {
  const h = (t.L * Math.sqrt(3)) / 2;
  const s = t.up ? 1 : -1;
  const v = [[t.c[0], t.c[1] - s * (2 * h) / 3], [t.c[0] + t.L / 2, t.c[1] + s * h / 3], [t.c[0] - t.L / 2, t.c[1] + s * h / 3]];
  const ring = samplePolyline([...v, v[0]], 0.01);
  const ins = ring.map((p) => egg.inside(p[0], p[1]));
  const n = ring.length;
  const start = ins.findIndex((x, i) => x && !ins[(i - 1 + n) % n]);
  const run = [];
  for (let i = 0; i < n && ins[(start + i) % n]; i++) run.push(ring[(start + i) % n]);
  // Corners inside the run, plus the two ends snapped onto the outline.
  const snap = (p) => egg.P(egg.nearestT(p));
  const corners = v.filter((c) => egg.inside(c[0], c[1]));
  const a = snap(run[0]), b = snap(run[run.length - 1]);
  // Order: a, the inside corner(s) in ring order, b.
  const idx = (c) => run.findIndex((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 0.02);
  const mids = corners.filter((c) => idx(c) >= 0).sort((x, y) => idx(x) - idx(y));
  const path = [a, ...mids, b];
  return { d: polyline(path), pts: samplePolyline(path) };
}

// --- the chip ---------------------------------------------------------------
/** The crown with a piece gone, where the sprite's crown shows white light
 *  (rows 8-12, x 16-25): the outline breaks on the crown and runs in a jag
 *  between the two breaks. A and B start from the jag's two low points. */
function chipOutline(egg, net) {
  // A V notch: the outline breaks either side of the crown and dips to where
  // the stem forked. The sprite's crown is white between x 16 and 25 (icon
  // 8.6-14.8); the notch takes its middle.
  const fork = net.A[0];
  const tL = egg.nearestT([fork[0] - 1.9, 2.4]), tR = egg.nearestT([fork[0] + 1.9, 2.4]);
  const L = egg.P(tL), R = egg.P(tR);
  const jag = [L, fork, R];
  const d = `M${pt(R)}${egg.arc(tR, tL, 8)}L${pt(fork)}Z`;
  return { d, samples: [...egg.samples(720, tR, tL), ...samplePolyline(jag)], forkA: fork, forkB: fork };
}

// --- variants -----------------------------------------------------------------
/**
 * Build one icon on the 24 grid. opts:
 *   crack   - a network (CRACK_HAMMER or CRACK_LARGE)
 *   spots   - ids from SPOTS
 *   tris    - [{ c, L, up }] Togepi triangles
 *   chip    - break the crown (the stem goes with it)
 *   stroke  - stroke width in grid units (2, or 2 / pathScale)
 *   gap     - clear space required between parts that do not join, grid units
 * Cracks are cut cleanly where they would come closer than the gap to a spot,
 * a triangle, or the outline (except where a run is meant to join the outline:
 * the stem's top and C's end).
 */
export function buildIcon({ crack = CRACK_HAMMER, spots = [], tris = [], chip = false, stroke = 2, gap = 2 } = {}) {
  const egg = ICON_EGG;
  const need = stroke + gap; // centre-line distance
  const parts = [];
  let net = Object.fromEntries(Object.entries(crack).map(([k, v]) => [k, v.map((p) => (p === 'outline' ? p : p.slice()))]));
  // A run that ends on 'outline' continues its last direction until it meets the outline.
  for (const [k, run] of Object.entries(net)) {
    if (run[run.length - 1] !== 'outline') continue;
    const [p, q] = [run[run.length - 3], run[run.length - 2]];
    const dir = [q[0] - p[0], q[1] - p[1]];
    const n = Math.hypot(...dir);
    let e = q;
    for (let i = 1; i < 2000; i++) {
      const c = [q[0] + (dir[0] / n) * i * 0.005, q[1] + (dir[1] / n) * i * 0.005];
      if (!egg.inside(c[0], c[1])) break;
      e = c;
    }
    run[run.length - 1] = e;
  }
  let outlineD = egg.path();
  let outlineSamples = egg.samples();
  if (chip) {
    const ch = chipOutline(egg, net);
    outlineD = ch.d;
    outlineSamples = ch.samples;
    // The stem and the first diagonals go with the piece; A and B run on from the jag.
    delete net.stem;
  }
  const others = [];
  for (const id of spots) {
    const a = spotArc(SPOTS[id], egg);
    parts.push({ id: `spot-${id}`, d: a.d, pts: a.pts, spot: true, closed: a.closed });
    others.push(a.pts);
  }
  for (const t of tris) {
    const r = t.wrap ? wrappedTri(t, egg) : tri(t.c, t.L, t.up);
    parts.push({ id: `tri-${t.c.join(',')}`, d: r.d, pts: r.pts, tri: true, spot: !!t.wrap, closed: !t.wrap });
    others.push(r.pts);
  }
  // Cut each run where it first comes too close to a spot or triangle, or to
  // the outline away from its own joins.
  const cut = {};
  for (const [k, run] of Object.entries(net)) {
    const joinsOutline = k === 'stem' || k === 'C';
    if (k === 'stem') continue;
    const samples = samplePolyline(run, 0.02);
    // A run that starts on the outline (the chip's notch) joins it there:
    // its first stretch is near the outline by design.
    const startJoined = minDist([run[0]], outlineSamples) < 0.3;
    let keep = samples.length;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      const nearOther = others.some((o) => minDist([p], o) < need);
      const fromStart = Math.hypot(p[0] - run[0][0], p[1] - run[0][1]);
      const exempt = startJoined ? fromStart < 1.6 * need : i <= 0.25 * samples.length;
      const nearOutline = !joinsOutline && !exempt && minDist([p], outlineSamples) < need;
      if (nearOther || nearOutline) { keep = i; break; }
    }
    if (keep < samples.length) {
      cut[k] = +(Math.hypot(samples[samples.length - 1][0] - samples[keep][0], samples[samples.length - 1][1] - samples[keep][1])).toFixed(2);
      // Rebuild the run up to the cut point.
      const end = samples[Math.max(0, keep - 1)];
      const out = [run[0]];
      let acc = 0;
      for (let i = 1; i < run.length; i++) {
        const segPts = samplePolyline([run[i - 1], run[i]], 0.02);
        const idx = segPts.findIndex((q) => Math.hypot(q[0] - end[0], q[1] - end[1]) < 0.011);
        if (idx >= 0) { out.push(end); break; }
        out.push(run[i]);
        acc++;
      }
      const len = out.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) : 0), 0);
      net[k] = len >= 1.5 ? out : [];
    }
  }
  parts.unshift({ id: 'outline', d: outlineD, pts: outlineSamples });
  for (const [k, p] of Object.entries(net)) {
    if (p.length < 2) continue;
    parts.push({ id: `crack-${k}`, d: polyline(p), pts: samplePolyline(p), crack: true, ends: [p[0], p[p.length - 1]] });
  }
  const order = (x) => (x.id === 'outline' ? 0 : x.crack ? 1 : 2);
  parts.sort((x, y) => order(x) - order(y));
  const body = parts.map((p) => `<path d="${p.d}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${+stroke.toFixed(4)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  return { svg, parts, net, cut };
}

/**
 * Clearance report: for every pair of parts that do not join, the gap between
 * their stroke edges (centre-line distance minus one stroke), in grid units.
 * Parts that join on purpose: crack runs with each other (they meet at forks),
 * a crack end that lands on the outline, a spot arc and the outline it wraps.
 */
export function clearance(parts, stroke = 2) {
  const rows = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    if (a.crack && b.crack) continue;
    if ((a.id === 'crack-stem' && b.id === 'outline') || (b.id === 'crack-stem' && a.id === 'outline')) continue;
    if ((a.id === 'outline' && b.spot && !b.closed) || (b.id === 'outline' && a.spot && !a.closed)) continue;
    let A = a.pts, Bp = b.pts;
    // A crack that ends on the outline joins it there: ignore its last 1.5 units.
    const trimJoin = (crack, other) => {
      if (other.id !== 'outline') return crack.pts;
      const end = crack.ends[1];
      const onOutline = minDist([end], other.pts) < 0.3;
      const start = crack.ends[0];
      const startOn = minDist([start], other.pts) < 0.3;
      // Near a joint two strokes share a corner; measure from 2 x (stroke + gap) away.
      const r = 2 * (stroke + stroke);
      return crack.pts.filter((p) => (!onOutline || Math.hypot(p[0] - end[0], p[1] - end[1]) > r) && (!startOn || Math.hypot(p[0] - start[0], p[1] - start[1]) > r));
    };
    if (a.crack) A = trimJoin(a, b);
    if (b.crack) Bp = trimJoin(b, a);
    const d = minDist(A, Bp);
    rows.push({ a: a.id, b: b.id, gap: +(d - stroke).toFixed(2) });
  }
  return rows.sort((x, y) => x.gap - y.gap);
}
