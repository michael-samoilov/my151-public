/**
 * Area-exact Euler diagram for up to three tools, after Chow and Ruskey's
 * rectilinear construction. Every region is one rectangle whose area is its
 * count, so a region with no browsers draws nothing.
 *
 * The first two tools share a band: first-only | both | second-only. The
 * third tool is a block under the band. Its top row is first+third |
 * all three | second+third (the first two outlines dip into it), and its
 * bottom row is third-only. Tools past the third are not drawn.
 */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Cell extends Box {
  /** Region key: sorted tool ids joined by `+`. */
  key: string;
}

interface EulerTool {
  id: string;
  short: string;
}

const TOOL_COLOR: Record<string, string> = {
  dex: 'rgb(37, 99, 235)',
  league: 'rgb(217, 119, 6)',
  favorites: 'rgb(14, 116, 94)',
};
const FALLBACK = ['rgb(14, 116, 94)', 'rgb(109, 40, 217)', 'rgb(190, 18, 60)'] as const;

export function colorOf(id: string, index: number): string {
  return TOOL_COLOR[id] ?? FALLBACK[index % FALLBACK.length];
}

export function regionKey(ids: string[]): string {
  return [...ids].sort().join('+');
}

export function inclusive(id: string, regions: Record<string, number>): number {
  let n = 0;
  for (const [key, count] of Object.entries(regions)) if (key.split('+').includes(id)) n += count;
  return n;
}

/** Region name in catalog order: `Dex + League + Picker`. */
export function regionName(key: string, tools: readonly EulerTool[]): string {
  const ids = key.split('+');
  const known = tools.filter((t) => ids.includes(t.id)).map((t) => t.short);
  const unknown = ids.filter((id) => !tools.some((t) => t.id === id));
  return [...known, ...unknown].join(' + ');
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Width : height of the third tool's block while it fits under the band. */
const BLOCK_ASPECT = 1.4;

interface Units {
  cells: Cell[];
  band: Box;
  block: Box | null;
}

function layoutUnits(regions: Record<string, number>, ids: readonly string[], rho: number): Units {
  const [A, B, C] = ids;
  const n = (...roles: (string | undefined)[]) => {
    const present = roles.filter((r): r is string => r !== undefined);
    return present.length === roles.length ? regions[regionKey(present)] ?? 0 : 0;
  };
  const a = n(A);
  const b = n(B);
  const c = n(C);
  const ab = n(A, B);
  const ac = n(A, C);
  const bc = n(B, C);
  const abc = n(A, B, C);
  const T = a + ab + b;
  const R1 = ac + abc + bc;
  const Ct = R1 + c;
  const Ht = T > 0 ? Math.sqrt(T / rho) : 0;
  const Wt = T > 0 ? T / Ht : 0;
  const Wc = Ct > 0 ? Math.min(Wt > 0 ? Wt : Infinity, Math.sqrt(Ct * BLOCK_ASPECT)) : 0;
  const h1 = R1 > 0 ? R1 / Wc : 0;
  const h2 = c > 0 ? c / Wc : 0;
  // A third tool that shares no browser with the band must not touch it.
  const gap = R1 === 0 && Ct > 0 && T > 0 ? 0.12 * Ht : 0;
  const xBl = T > 0 ? a / Ht : 0;
  const xAr = T > 0 ? (a + ab) / Ht : 0;
  const hasA = a + ab > 0;
  const hasB = b + ab > 0;
  const anchor = hasA && hasB ? (xBl + xAr) / 2 : hasA ? xAr / 2 : (xBl + Wt) / 2;
  let x0 = Ct === 0 ? 0 : R1 > 0 ? anchor - (ac + abc / 2) / h1 : anchor - Wc / 2;
  // Keep each tab under its own tool, so every outline stays one piece.
  const tabsAttach = (x: number) => {
    const okA = ac + abc === 0 || (x < xAr - 1e-9 && x + (ac + abc) / h1 > 1e-9);
    const okB = abc + bc === 0 || (x + ac / h1 < Wt - 1e-9 && x + Wc > xBl + 1e-9);
    return okA && okB;
  };
  if (Ct > 0 && Wt >= Wc) {
    const clamped = Math.min(Math.max(x0, 0), Wt - Wc);
    if (tabsAttach(clamped)) x0 = clamped;
  }
  const cells: Cell[] = [];
  const push = (key: string, x: number, y: number, w: number, h: number) => {
    if (w > 0 && h > 0) cells.push({ key, x, y, w, h });
  };
  if (A) push(regionKey([A]), 0, 0, xBl, Ht);
  if (A && B) push(regionKey([A, B]), xBl, 0, xAr - xBl, Ht);
  if (B) push(regionKey([B]), xAr, 0, Wt - xAr, Ht);
  const y1 = Ht + gap;
  let x = x0;
  for (const [roles, count] of [
    [[A, C], ac],
    [[A, B, C], abc],
    [[B, C], bc],
  ] as const) {
    if (count > 0) {
      push(regionKey(roles.filter((r): r is string => r !== undefined)), x, y1, count / h1, h1);
      x += count / h1;
    }
  }
  if (C) push(regionKey([C]), x0, y1 + h1, Wc, h2);
  return {
    cells,
    band: { x: 0, y: 0, w: Wt, h: Ht },
    block: Ct > 0 ? { x: x0, y: y1, w: Wc, h: h1 + h2 } : null,
  };
}

function bboxOf(cells: readonly Box[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cells) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + c.w);
    y1 = Math.max(y1, c.y + c.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

interface EulerLayout extends Units {
  bbox: Box;
}

/** Pick the band's aspect so the whole drawing matches `box`, then fit it in. */
function eulerLayout(regions: Record<string, number>, ids: readonly string[], box: Box): EulerLayout | null {
  const probe = layoutUnits(regions, ids, 1);
  if (probe.cells.length === 0) return null;
  const target = box.w / box.h;
  let lo = Math.log(0.4);
  let hi = Math.log(12);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const bb = bboxOf(layoutUnits(regions, ids, Math.exp(mid)).cells);
    if (bb.w / bb.h < target) lo = mid;
    else hi = mid;
  }
  const units = layoutUnits(regions, ids, Math.exp((lo + hi) / 2));
  const bb = bboxOf(units.cells);
  const s = Math.min(box.w / bb.w, box.h / bb.h);
  const ox = box.x + (box.w - bb.w * s) / 2 - bb.x * s;
  const oy = box.y + (box.h - bb.h * s) / 2 - bb.y * s;
  const fit = <T extends Box>(c: T): T => ({ ...c, x: ox + c.x * s, y: oy + c.y * s, w: c.w * s, h: c.h * s });
  const cells = units.cells.map(fit);
  return { cells, band: fit(units.band), block: units.block ? fit(units.block) : null, bbox: bboxOf(cells) };
}

// ---------------------------------------------------------------------------
// Outlines. Two tools that share an edge draw it as two parallel lines, each
// inset into its own tool, so neither outline hides the other.
// ---------------------------------------------------------------------------

function uniq(values: number[]): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((p, q) => p - q)) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) > 1e-6) out.push(v);
  }
  return out;
}

interface Edge {
  a: [number, number];
  b: [number, number];
  /** Grid line plus the side the tool lies on. */
  slot: string;
  depth: number;
}

interface Outline {
  /** The tool's area, for the translucent fill. */
  fill: string;
  /** The tool's edge, inset by its rank among tools that share that edge. */
  stroke: string;
}

function outlines(cells: readonly Cell[], ids: readonly string[], strokeW: number): Record<string, Outline> {
  const xs = uniq(cells.flatMap((c) => [c.x, c.x + c.w]));
  const ys = uniq(cells.flatMap((c) => [c.y, c.y + c.h]));
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const owner: string[][][] = [];
  for (let i = 0; i < nx; i++) {
    owner.push([]);
    for (let j = 0; j < ny; j++) {
      const px = (xs[i] + xs[i + 1]) / 2;
      const py = (ys[j] + ys[j + 1]) / 2;
      const hit = cells.find((c) => px > c.x && px < c.x + c.w && py > c.y && py < c.y + c.h);
      owner[i].push(hit ? hit.key.split('+') : []);
    }
  }
  const inside = (id: string, i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && owner[i][j].includes(id);
  // Unit edges, directed so the tool lies on the left (y grows down).
  const edgesOf = (id: string): Edge[] => {
    const out: Edge[] = [];
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j < ny; j++) {
        const L = inside(id, i - 1, j);
        const R = inside(id, i, j);
        if (R && !L) out.push({ a: [i, j], b: [i, j + 1], slot: `v${i}:${j}R`, depth: 0 });
        if (L && !R) out.push({ a: [i, j + 1], b: [i, j], slot: `v${i}:${j}L`, depth: 0 });
      }
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i < nx; i++) {
        const above = inside(id, i, j - 1);
        const below = inside(id, i, j);
        if (below && !above) out.push({ a: [i + 1, j], b: [i, j], slot: `h${i}:${j}B`, depth: 0 });
        if (above && !below) out.push({ a: [i, j], b: [i + 1, j], slot: `h${i}:${j}A`, depth: 0 });
      }
    return out;
  };
  const all = ids.map((id) => ({ id, edges: edgesOf(id), slots: new Set<string>() }));
  for (const t of all) for (const e of t.edges) t.slots.add(e.slot);
  const P = ([i, j]: [number, number]): [number, number] => [xs[i], ys[j]];
  const fmt = ([x, y]: [number, number]) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const result: Record<string, Outline> = {};
  all.forEach((t, k) => {
    if (t.edges.length === 0) return;
    for (const e of t.edges) {
      const rank = all.slice(0, k).filter((o) => o.slots.has(e.slot)).length;
      e.depth = (rank + 0.5) * strokeW;
    }
    const byStart = new Map<string, Edge[]>();
    for (const e of t.edges) {
      const key = e.a.join(',');
      byStart.set(key, [...(byStart.get(key) ?? []), e]);
    }
    const used = new Set<Edge>();
    let fill = '';
    let stroke = '';
    for (const first of t.edges) {
      if (used.has(first)) continue;
      const loop: Edge[] = [];
      let e: Edge | undefined = first;
      while (e && !used.has(e)) {
        used.add(e);
        loop.push(e);
        e = (byStart.get(e.b.join(',')) ?? []).find((n) => !used.has(n));
      }
      // Merge straight runs that share a depth.
      type Run = { a: [number, number]; b: [number, number]; d: [number, number]; depth: number };
      const runs: Run[] = [];
      for (const u of loop) {
        const d: [number, number] = [Math.sign(u.b[0] - u.a[0]), Math.sign(u.b[1] - u.a[1])];
        const last = runs[runs.length - 1];
        if (last && last.d[0] === d[0] && last.d[1] === d[1] && last.depth === u.depth) last.b = u.b;
        else runs.push({ a: u.a, b: u.b, d, depth: u.depth });
      }
      const head = runs[0];
      const tail = runs[runs.length - 1];
      if (runs.length > 1 && head.d[0] === tail.d[0] && head.d[1] === tail.d[1] && head.depth === tail.depth) {
        head.a = tail.a;
        runs.pop();
      }
      fill += `M${runs.map((r) => fmt(P(r.a))).join('L')}Z`;
      const pts: [number, number][] = [];
      runs.forEach((r1, i) => {
        const r2 = runs[(i + 1) % runs.length];
        const [px, py] = P(r1.b);
        const n1 = [r1.d[1], -r1.d[0]];
        const n2 = [r2.d[1], -r2.d[0]];
        if (r1.d[0] === r2.d[0] && r1.d[1] === r2.d[1]) {
          pts.push([px + n1[0] * r1.depth, py + n1[1] * r1.depth]);
          pts.push([px + n2[0] * r2.depth, py + n2[1] * r2.depth]);
        } else {
          pts.push([px + n1[0] * r1.depth + n2[0] * r2.depth, py + n1[1] * r1.depth + n2[1] * r2.depth]);
        }
      });
      stroke += `M${pts.map(fmt).join('L')}Z`;
    }
    result[t.id] = { fill, stroke };
  });
  return result;
}

// ---------------------------------------------------------------------------
// Labels. Each label is a box first: it is checked against the boxes already
// placed and the painted cells, and only then drawn.
// ---------------------------------------------------------------------------

export type Measure = (text: string, fontSize: number) => number;

interface TextBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface PlacedText {
  key: string;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

interface Leader extends PlacedText {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface EulerScene {
  width: number;
  height: number;
  font: number;
  strokeW: number;
  layout: EulerLayout;
  outlines: Record<string, Outline>;
  inside: PlacedText[];
  leaders: Leader[];
  totals: PlacedText[];
}

const LINE = 1.25;

function boxAt(x: number, y: number, w: number, h: number, anchor: PlacedText['anchor']): TextBox {
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return { left, right: left + w, top: y - h / 2, bottom: y + h / 2 };
}

function hits(a: TextBox, b: TextBox, m: number): boolean {
  return a.left < b.right + m && b.left < a.right + m && a.top < b.bottom + m && b.top < a.bottom + m;
}

function onCells(b: TextBox, cells: readonly Cell[], m: number): boolean {
  return cells.some((c) => b.left - m < c.x + c.w && c.x < b.right + m && b.top - m < c.y + c.h && c.y < b.bottom + m);
}

/** Liang-Barsky: does the segment pass through the box? */
function segmentHits(x1: number, y1: number, x2: number, y2: number, r: TextBox): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (const [p, q] of [
    [-dx, x1 - r.left],
    [dx, r.right - x1],
    [-dy, y1 - r.top],
    [dy, r.bottom - y1],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t0 < t1;
}

function segmentsCross(a: Leader, b: Leader): boolean {
  const o = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a.from, a.to, b.from) * o(a.from, a.to, b.to) < 0 && o(b.from, b.to, a.from) * o(b.from, b.to, a.to) < 0;
}

interface Pending {
  key: string;
  text: string;
  w: number;
  cell: Cell;
}

/** Stack the labels of small regions in one column; keep the clean option with the shortest leaders. */
function placeLeaders(
  items: Pending[],
  placed: TextBox[],
  cells: readonly Cell[],
  width: number,
  height: number,
  font: number,
): { leaders: Leader[]; height: number; bad: number } {
  if (items.length === 0) return { leaders: [], height, bad: 0 };
  const h = font * LINE;
  const row = font * 1.4;
  const gap = font * 1.3;
  const cx = (i: Pending) => i.cell.x + i.cell.w / 2;
  const cy = (i: Pending) => i.cell.y + i.cell.h / 2;
  const cl = {
    left: Math.min(...items.map((i) => i.cell.x)),
    right: Math.max(...items.map((i) => i.cell.x + i.cell.w)),
    mid: (Math.min(...items.map(cy)) + Math.max(...items.map(cy))) / 2,
  };
  const drawBottom = bboxOf(cells).y + bboxOf(cells).h;
  const byY = [...items].sort((p, q) => cy(p) - cy(q) || cx(p) - cx(q));
  const byX = [...items].sort((p, q) => cx(p) - cx(q) || cy(p) - cy(q));
  // Shortest label on top lets the lower leaders pass beside the upper labels.
  const byWidth = [...items].sort((p, q) => p.w - q.w);
  const orders = [byY, byX, [...byX].reverse(), byWidth, [...byWidth].reverse()];
  const n = items.length;
  // The dot sits at the point of the cell nearest its label.
  const start = (c: Cell, tx: number, ty: number) => {
    const m = Math.min(8, c.w / 3, c.h / 3);
    return { x: Math.min(Math.max(tx, c.x + m), c.x + c.w - m), y: Math.min(Math.max(ty, c.y + m), c.y + c.h - m) };
  };
  const entry = (it: Pending, x: number, anchor: 'start' | 'end', y: number) => {
    const b = boxAt(x, y, it.w, h, anchor);
    // The line meets the end of the label that faces its cell.
    const to = { x: cx(it) > (b.left + b.right) / 2 ? b.right + 3 : b.left - 3, y };
    return { leader: { key: it.key, text: it.text, x, y, anchor, from: start(it.cell, to.x, to.y), to } as Leader, b };
  };
  const column = (x: number, anchor: 'start' | 'end', firstY: number, order: Pending[]) =>
    order.map((it, i) => entry(it, x, anchor, firstY + i * row));
  const fit = (y: number) => Math.max(2 + h / 2, Math.min(height - 2 - h / 2 - (n - 1) * row, y));
  const starts = [fit(cl.mid - ((n - 1) * row) / 2), fit(cl.mid - (n - 1) * row - row / 2), fit(cl.mid + row / 2)];
  const below = drawBottom + font * 1.2;
  const options: { col: ReturnType<typeof column>; grows: boolean }[] = [];
  // Split: cells left of the cluster's middle label to the left, the rest to the right.
  const split = (cl.left + cl.right) / 2;
  const leftGroup = byY.filter((i) => cx(i) <= split);
  const rightGroup = byY.filter((i) => cx(i) > split);
  if (leftGroup.length > 0 && rightGroup.length > 0) {
    const firstOf = (g: Pending[]) => {
      const m = (Math.min(...g.map(cy)) + Math.max(...g.map(cy))) / 2;
      return Math.max(2 + h / 2, Math.min(height - 2 - h / 2 - (g.length - 1) * row, m - ((g.length - 1) * row) / 2));
    };
    options.push({
      col: [...column(cl.left - gap, 'end', firstOf(leftGroup), leftGroup), ...column(cl.right + gap, 'start', firstOf(rightGroup), rightGroup)],
      grows: false,
    });
  }
  for (const order of orders) {
    for (const y of starts) {
      options.push({ col: column(cl.left - gap, 'end', y, order), grows: false });
      options.push({ col: column(cl.right + gap, 'start', y, order), grows: false });
    }
    const mid = (cl.left + cl.right) / 2;
    options.push({ col: column(Math.min(cl.left, mid) - gap / 2, 'end', below, order), grows: true });
    options.push({ col: column(Math.max(cl.right, mid) + gap / 2, 'start', below, order), grows: true });
    options.push({ col: column(width - 2, 'end', below, order), grows: true });
    options.push({ col: column(2, 'start', below, order), grows: true });
  }
  // Under the drawing, each label may sit at either card edge, in any order.
  if (n <= 4) {
    const perms = (list: Pending[]): Pending[][] =>
      list.length <= 1 ? [list] : list.flatMap((it, i) => perms([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [it, ...p]));
    for (const perm of perms(items))
      for (let mask = 0; mask < 1 << n; mask++)
        options.push({
          col: perm.map((it, k) => (mask & (1 << k) ? entry(it, width - 2, 'end', below + k * row) : entry(it, 2, 'start', below + k * row))),
          grows: true,
        });
  }
  let best: { col: ReturnType<typeof column>; bad: number; cost: number } | null = null;
  for (const { col, grows } of options) {
    let bad = 0;
    for (const { leader: l, b } of col) {
      if (b.left < 1 || b.right > width - 1 || b.top < 1) bad++;
      if (!grows && b.bottom > height - 1) bad++;
      if (onCells(b, cells, 2)) bad++;
      if (placed.some((p) => hits(p, b, 2))) bad++;
      for (const p of placed) if (segmentHits(l.from.x, l.from.y, l.to.x, l.to.y, p)) bad++;
      for (const o of col) {
        if (o.leader === l) continue;
        if (segmentHits(l.from.x, l.from.y, l.to.x, l.to.y, o.b)) bad++;
        if (segmentsCross(l, o.leader)) bad++;
      }
    }
    // A column below makes the card taller, so it has to be clearly better.
    const len = col.reduce((s, { leader: l }) => s + Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y), 0);
    const cost = grows ? len * 1.3 + font * 4 : len;
    if (!best || bad < best.bad || (bad === best.bad && cost < best.cost)) best = { col, bad, cost };
  }
  const chosen = best!;
  for (const { b } of chosen.col) placed.push(b);
  const bottom = Math.max(...chosen.col.map(({ b }) => b.bottom));
  return { leaders: chosen.col.map(({ leader }) => leader), height: Math.max(height, Math.ceil(bottom + 4)), bad: chosen.bad };
}

function attempt(
  regions: Record<string, number>,
  tools: readonly EulerTool[],
  width: number,
  measure: Measure,
  shrink: number,
): (EulerScene & { bad: number }) | null {
  const scale = Math.max(1, Math.min(width / 360, 2));
  const font = Math.round(12 * scale);
  const strokeW = 1.5 * Math.min(scale, 1.5);
  const baseH = Math.round(Math.min(400, 236 * scale));
  const top = Math.round(font * 1.9);
  const bottom = Math.round(font * 3.4);
  const plotH = baseH - top - bottom;
  const plotW = Math.min(width - 2 * Math.round(4 * scale), Math.round(plotH * 2.7));
  const full: Box = { x: (width - plotW) / 2, y: top, w: plotW, h: plotH };
  // Shrinking pulls the drawing to the left middle, which frees room for labels.
  const box: Box = { x: full.x, y: full.y + (full.h * (1 - shrink)) / 2, w: full.w * shrink, h: full.h * shrink };
  const ids = tools.slice(0, 3).map((t) => t.id);
  const layout = eulerLayout(regions, ids, box);
  if (!layout) return null;
  const h = font * LINE;
  const pad = Math.round(2 * scale);
  const placed: TextBox[] = [];
  const inside: PlacedText[] = [];
  const pending: Pending[] = [];
  for (const cell of layout.cells) {
    const count = regions[cell.key] ?? 0;
    const text = String(count);
    const w = measure(text, font);
    // Padding includes the thin label halo.
    const room = pad;
    if (w + 2 * room <= cell.w && font + 2 * room <= cell.h) {
      const x = cell.x + cell.w / 2;
      const y = cell.y + cell.h / 2;
      inside.push({ key: cell.key, text, x, y, anchor: 'middle' });
      placed.push(boxAt(x, y, w, h, 'middle'));
    } else {
      const label = `${regionName(cell.key, tools)} ${text}`;
      pending.push({ key: cell.key, text: label, w: measure(label, font), cell });
    }
  }
  // Inclusive totals: first tool over the band's left end, second over its
  // right end, third beside its block. The first spot that is clear wins.
  const totals: PlacedText[] = [];
  const gap = Math.round(font * 0.45);
  const band = layout.band;
  const block = layout.block;
  let missing = 0;
  tools.slice(0, 3).forEach((t, i) => {
    const total = inclusive(t.id, regions);
    if (total === 0) return;
    const text = `${t.short} ${total}`;
    const w = measure(text, font);
    const above = band.y - gap - font / 2;
    const spots: Omit<PlacedText, 'key' | 'text'>[] = [];
    if (i === 0 && band.w > 0) spots.push({ x: band.x, y: above, anchor: 'start' }, { x: band.x - gap, y: band.y + band.h / 2, anchor: 'end' });
    if (i === 1 && band.w > 0) spots.push({ x: band.x + band.w, y: above, anchor: 'end' }, { x: band.x + band.w + gap, y: band.y + band.h / 2, anchor: 'start' });
    if (block) {
      const mid = block.y + block.h / 2;
      spots.push(
        { x: block.x + block.w + gap, y: mid, anchor: 'start' },
        { x: block.x - gap, y: mid, anchor: 'end' },
        { x: block.x + block.w / 2, y: block.y + block.h + gap + font / 2, anchor: 'middle' },
      );
    }
    const clear = (p: Omit<PlacedText, 'key' | 'text'>) => {
      const b = boxAt(p.x, p.y, w, h, p.anchor);
      return b.left >= 1 && b.right <= width - 1 && b.top >= 1 && !placed.some((q) => hits(q, b, 2)) && !onCells(b, layout.cells, 1);
    };
    const spot = spots.find(clear) ?? spots[0];
    if (!spot) return;
    if (!clear(spot)) missing++;
    placed.push(boxAt(spot.x, spot.y, w, h, spot.anchor));
    totals.push({ key: t.id, text, ...spot });
  });
  const { leaders, height, bad } = placeLeaders(pending, placed, layout.cells, width, baseH, font);
  return {
    width,
    height,
    font,
    strokeW,
    layout,
    outlines: outlines(layout.cells, ids, strokeW),
    inside,
    leaders,
    totals,
    bad: bad + missing * 10,
  };
}

/** The whole picture for one card width. Shrinks the drawing only when labels need the room. */
export function eulerScene(
  regions: Record<string, number>,
  tools: readonly EulerTool[],
  width: number,
  measure: Measure,
): EulerScene | null {
  let best: (EulerScene & { bad: number }) | null = null;
  for (const shrink of [1, 0.9, 0.8, 0.7, 0.6]) {
    const scene = attempt(regions, tools, width, measure, shrink);
    if (!scene) return null;
    if (!best || scene.bad < best.bad) best = scene;
    if (scene.bad === 0) break;
  }
  return best;
}
