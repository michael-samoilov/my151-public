import { normalizeSolution, scaleSolution, venn, type VennArea, type VennCircle } from 'venn.js';
import type { ToolDef } from '../../../../api/_crossTool';

const TOOL_COLOR: Record<string, string> = {
  dex: 'rgb(37, 99, 235)',
  league: 'rgb(217, 119, 6)',
  favorites: 'rgb(14, 116, 94)',
};
const FALLBACK = ['rgb(14, 116, 94)', 'rgb(109, 40, 217)', 'rgb(190, 18, 60)'] as const;

/** Smallest radius that can hold a 12px count without sitting on the rim. */
export const MIN_INSIDE_R = 14;
const LABEL_MARGIN = 12;

export function colorOf(id: string, index: number): string {
  return TOOL_COLOR[id] ?? FALLBACK[index % FALLBACK.length];
}

export function inclusive(id: string, regions: Record<string, number>): number {
  let n = 0;
  for (const [key, count] of Object.entries(regions)) {
    if (key.split('+').includes(id)) n += count;
  }
  return n;
}

export function intersection(ids: string[], regions: Record<string, number>): number {
  let n = 0;
  for (const [key, count] of Object.entries(regions)) {
    const parts = key.split('+');
    if (ids.every((id) => parts.includes(id))) n += count;
  }
  return n;
}

/** Exclusive regions → venn.js areas (inclusive set sizes + pairwise overlap). */
export function areasFromRegions(regions: Record<string, number>, catalog: ToolDef[]): VennArea[] {
  const present = catalog.filter((t) => inclusive(t.id, regions) > 0);
  const areas: VennArea[] = present.map((t) => ({
    sets: [t.short],
    size: inclusive(t.id, regions),
  }));
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      areas.push({
        sets: [present[i].short, present[j].short],
        size: intersection([present[i].id, present[j].id], regions),
      });
    }
  }
  if (present.length >= 3) {
    const size = intersection(present.map((t) => t.id), regions);
    if (size > 0) areas.push({ sets: present.map((t) => t.short), size });
  }
  return areas;
}

export function layoutCircles(
  areas: VennArea[],
  width: number,
  height: number,
  padding = 18,
): Record<string, VennCircle> {
  const singles = areas.filter((a) => a.sets.length === 1);
  if (singles.length === 0 || width < 8 || height < 8) return {};
  if (singles.length === 1) {
    const r = Math.max(8, Math.min(width, height) / 2 - padding);
    return { [singles[0].sets[0]]: { x: width / 2, y: height / 2, radius: r } };
  }
  const raw = venn(areas);
  const oriented = normalizeSolution(raw, Math.PI / 2);
  return scaleSolution(oriented, width, height, padding);
}

export type VennRegionLabel = {
  key: string;
  count: number;
  x: number;
  y: number;
  placement: 'inside' | 'outside';
  fromX: number;
  fromY: number;
  hitR: number;
};

export type VennCircleLabel = {
  id: string;
  short: string;
  count: number;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
};

/** Gap from the rim to the name+count so the label stays on the circle, not in the card. */
export const CIRCLE_LABEL_GAP = 8;

/**
 * Compact canvas for a 2-set Venn: height follows the card, width hugs the
 * circles so Dex/League sit on the rims instead of in a wide empty field.
 */
export function vennCanvas(containerWidth: number): {
  width: number;
  height: number;
  scale: number;
} {
  const scale = containerWidth > 0 ? Math.max(1, Math.min(containerWidth / 360, 2)) : 1;
  const height = Math.round(Math.min(320, 168 * scale));
  const width = Math.max(1, Math.min(containerWidth, Math.round(height * 2.15)));
  return { width, height, scale };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function toward(from: VennCircle, to: VennCircle): { x: number; y: number; d: number } {
  const d = dist(from, to);
  if (d < 1e-6) return { x: 1, y: 0, d: 0 };
  return { x: (to.x - from.x) / d, y: (to.y - from.y) / d, d };
}

function fullyInside(inner: VennCircle, outer: VennCircle): boolean {
  return dist(inner, outer) + inner.radius <= outer.radius + 0.5;
}

function inCircle(p: { x: number; y: number }, c: VennCircle, pad = 0): boolean {
  return dist(p, c) <= c.radius - pad;
}

function clamp(x: number, y: number, width: number, height: number): { x: number; y: number } {
  return {
    x: Math.min(width - LABEL_MARGIN, Math.max(LABEL_MARGIN, x)),
    y: Math.min(height - LABEL_MARGIN, Math.max(LABEL_MARGIN, y)),
  };
}

function centroid(cs: VennCircle[]): { x: number; y: number } {
  const n = Math.max(1, cs.length);
  return {
    x: cs.reduce((s, c) => s + c.x, 0) / n,
    y: cs.reduce((s, c) => s + c.y, 0) / n,
  };
}

function exclusivePoint(own: VennCircle, others: VennCircle[]): { x: number; y: number } | null {
  if (others.some((o) => fullyInside(own, o))) return null;
  if (others.length === 0) return { x: own.x, y: own.y };
  const other = others.length === 1 ? others[0] : { ...centroid(others), radius: 0 };
  const away = toward(other, own);
  if (away.d === 0) return { x: own.x, y: own.y - own.radius * 0.4 };
  const contained = others.length === 1 && fullyInside(others[0], own);
  const mag = contained
    ? Math.min(own.radius * 0.62, Math.max(own.radius * 0.42, own.radius - MIN_INSIDE_R))
    : own.radius * 0.42;
  let p = { x: own.x + away.x * mag, y: own.y + away.y * mag };
  if (others.some((o) => inCircle(p, o, 1))) {
    const far = Math.max(8, own.radius - 8);
    p = { x: own.x + away.x * far, y: own.y + away.y * far };
  }
  if (others.some((o) => inCircle(p, o, 1)) || !inCircle(p, own, 0)) return null;
  return p;
}

function overlapAnchor(a: VennCircle, b: VennCircle): { x: number; y: number } | null {
  const u = toward(a, b);
  if (fullyInside(b, a)) return { x: b.x, y: b.y };
  if (fullyInside(a, b)) return { x: a.x, y: a.y };
  if (u.d >= a.radius + b.radius - 0.5) return null;
  if (u.d <= Math.abs(a.radius - b.radius) + 0.5) {
    return a.radius <= b.radius ? { x: a.x, y: a.y } : { x: b.x, y: b.y };
  }
  const along = (a.radius * a.radius - b.radius * b.radius + u.d * u.d) / (2 * u.d);
  return { x: a.x + u.x * along, y: a.y + u.y * along };
}

function overlapClearance(a: VennCircle, b: VennCircle): number {
  if (fullyInside(b, a)) return b.radius;
  if (fullyInside(a, b)) return a.radius;
  const d = dist(a, b);
  return Math.max(0, (a.radius + b.radius - d) / 2);
}

function outsideNear(
  small: VennCircle,
  large: VennCircle,
  width: number,
  height: number,
): { x: number; y: number } {
  const u = toward(large, small);
  const reach = small.radius + 16;
  return clamp(small.x + u.x * reach, small.y + u.y * reach, width, height);
}

/**
 * Inclusive name + size, parked on the outer side of each circle.
 * Two tools sit left/right; three sit on the ray away from the others.
 * Do not clamp into the SVG box: that pulls the words into the corners.
 */
export function placeCircleLabels(
  regions: Record<string, number>,
  catalog: ToolDef[],
  circles: Record<string, VennCircle>,
): VennCircleLabel[] {
  const present = catalog.filter((t) => inclusive(t.id, regions) > 0);
  const labels: VennCircleLabel[] = [];
  for (const t of present) {
    const own = circles[t.short];
    if (!own) continue;
    const others = present
      .filter((o) => o.id !== t.id)
      .map((o) => circles[o.short])
      .filter((c): c is VennCircle => c !== undefined);
    let ux = 1;
    let uy = 0;
    if (others.length > 0) {
      const other = others.length === 1 ? others[0] : { ...centroid(others), radius: 0 };
      const away = toward(other, own);
      if (away.d > 0) {
        ux = away.x;
        uy = away.y;
      }
    }
    const reach = own.radius + CIRCLE_LABEL_GAP;
    const anchor: VennCircleLabel['anchor'] = ux < -0.35 ? 'end' : ux > 0.35 ? 'start' : 'middle';
    labels.push({
      id: t.id,
      short: t.short,
      count: inclusive(t.id, regions),
      x: own.x + ux * reach,
      y: own.y + uy * reach,
      anchor,
    });
  }
  return labels;
}

/**
 * Exclusive-region counts for the painted circles. Inclusive name and
 * size sit beside each circle. Tiny pairwise overlap gets an outside
 * count plus a leader. Three-set regions use exclusive / pairwise / triple keys.
 */
/** Find an interior point for an exclusive region, including three-set crescents.
 *  Pairwise midpoints can lie in the triple intersection and hide a real count. */
function regionInterior(inside:VennCircle[],outside:VennCircle[]):{x:number;y:number}|null {
  const left=Math.max(...inside.map(c=>c.x-c.radius));
  const right=Math.min(...inside.map(c=>c.x+c.radius));
  const top=Math.max(...inside.map(c=>c.y-c.radius));
  const bottom=Math.min(...inside.map(c=>c.y+c.radius));
  if(right<=left || bottom<=top)return null;
  let best:{x:number;y:number}|null=null;
  let clearance=0;
  for(let x=0;x<=30;x++)for(let y=0;y<=30;y++){
    const point={x:left+(right-left)*x/30,y:top+(bottom-top)*y/30};
    const space=Math.min(...inside.map(c=>c.radius-dist(point,c)),...outside.map(c=>dist(point,c)-c.radius));
    if(space>clearance){clearance=space;best=point;}
  }
  return best;
}

export function placeRegionLabels(
  regions: Record<string, number>,
  catalog: ToolDef[],
  circles: Record<string, VennCircle>,
  width: number,
  height: number,
): VennRegionLabel[] {
  const present = catalog.filter((t) => inclusive(t.id, regions) > 0);
  const labels: VennRegionLabel[] = [];

  for (const [key, count] of Object.entries(regions)) {
    if (count <= 0) continue;
    const ids = key.split('+').filter((id) => present.some((t) => t.id === id));
    if (ids.length === 0) continue;
    const interior = ids
      .map((id) => {
        const tool = present.find((t) => t.id === id);
        return tool ? circles[tool.short] : undefined;
      })
      .filter((c): c is VennCircle => c !== undefined);
    if (interior.length !== ids.length) continue;
    const exterior = present
      .filter((t) => !ids.includes(t.id))
      .map((t) => circles[t.short])
      .filter((c): c is VennCircle => c !== undefined);

    if(present.length>=3){
      const point=regionInterior(interior,exterior);
      if(point){labels.push({key,count,x:point.x,y:point.y,placement:'inside',fromX:point.x,fromY:point.y,hitR:12});continue;}
    }

    let placed: { x: number; y: number } | null = null;
    let from = { x: 0, y: 0 };
    let placement: 'inside' | 'outside' = 'inside';
    let hitR = 12;

    if (interior.length === 1) {
      placed = exclusivePoint(interior[0], exterior);
      if (placed) from = placed;
    } else if (interior.length === 2) {
      const [a, b] = interior;
      const anchor = overlapAnchor(a, b);
      if (!anchor) continue;
      from = anchor;
      const inThird = exterior.some((e) => inCircle(anchor, e, 0));
      if (inThird) {
        const third = exterior[0];
        const away = toward(third, { ...anchor, radius: 0 });
        const stepped = { x: anchor.x + away.x * 10, y: anchor.y + away.y * 10 };
        if (exterior.some((e) => inCircle(stepped, e, 0))) continue;
        placed = stepped;
      } else {
        const clearance = overlapClearance(a, b);
        const tiny = clearance < MIN_INSIDE_R;
        const small = a.radius <= b.radius ? a : b;
        const large = a.radius <= b.radius ? b : a;
        placed = tiny ? outsideNear(small, large, width, height) : anchor;
        placement = tiny ? 'outside' : 'inside';
        hitR = Math.max(12, Math.min(clearance, 16));
      }
    } else {
      const c = centroid(interior);
      if (interior.every((i) => inCircle(c, i)) && exterior.every((e) => !inCircle(c, e, 0))) {
        placed = c;
        from = c;
      }
    }

    if (!placed) continue;
    labels.push({
      key,
      count,
      x: placed.x,
      y: placed.y,
      placement,
      fromX: from.x,
      fromY: from.y,
      hitR,
    });
  }

  const outs = labels.filter((l) => l.placement === 'outside');
  if (outs.length === 2 && dist(outs[0], outs[1]) < 16) {
    outs[1].y = clamp(outs[1].x, outs[1].y + 16, width, height).y;
  }
  return labels;
}
