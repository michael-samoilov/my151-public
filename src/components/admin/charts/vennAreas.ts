import { normalizeSolution, scaleSolution, venn, type VennArea, type VennCircle } from 'venn.js';
import type { ToolDef } from '../../../../api/_crossTool';

const TOOL_COLOR: Record<string, string> = {
  dex: 'rgb(37, 99, 235)',
  league: 'rgb(217, 119, 6)',
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

function exclusivePoint(own: VennCircle, other: VennCircle | undefined): { x: number; y: number } | null {
  if (!other) return { x: own.x, y: own.y };
  if (fullyInside(own, other)) return null;
  const away = toward(other, own);
  if (away.d === 0) return { x: own.x, y: own.y - own.radius * 0.4 };
  const mag = fullyInside(other, own)
    ? Math.min(own.radius * 0.62, Math.max(own.radius * 0.42, own.radius - MIN_INSIDE_R))
    : own.radius * 0.42;
  let p = { x: own.x + away.x * mag, y: own.y + away.y * mag };
  if (inCircle(p, other, 1)) {
    const far = Math.max(8, own.radius - 8);
    p = { x: own.x + away.x * far, y: own.y + away.y * far };
  }
  if (inCircle(p, other, 1) || !inCircle(p, own, 0)) return null;
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
 * Exclusive-region counts for the painted circles. Tiny overlap gets an
 * outside count plus a leader, so a 3-browser speck still has a number.
 */
export function placeRegionLabels(
  regions: Record<string, number>,
  catalog: ToolDef[],
  circles: Record<string, VennCircle>,
  width: number,
  height: number,
): VennRegionLabel[] {
  const present = catalog.filter((t) => inclusive(t.id, regions) > 0);
  const labels: VennRegionLabel[] = [];

  if (present.length === 1) {
    const t = present[0];
    const c = circles[t.short];
    const count = regions[t.id] ?? inclusive(t.id, regions);
    if (!c || count <= 0) return [];
    return [{
      key: t.id,
      count,
      x: c.x,
      y: c.y,
      placement: 'inside',
      fromX: c.x,
      fromY: c.y,
      hitR: Math.max(12, Math.min(c.radius, 18)),
    }];
  }

  if (present.length !== 2) {
    return present.flatMap((t) => {
      const c = circles[t.short];
      const count = inclusive(t.id, regions);
      if (!c || count <= 0) return [];
      return [{
        key: t.id,
        count,
        x: c.x,
        y: c.y,
        placement: 'inside' as const,
        fromX: c.x,
        fromY: c.y,
        hitR: 12,
      }];
    });
  }

  const [a, b] = present;
  const ca = circles[a.short];
  const cb = circles[b.short];
  if (!ca || !cb) return [];
  const small = ca.radius <= cb.radius ? ca : cb;
  const large = ca.radius <= cb.radius ? cb : ca;

  const pushExclusive = (tool: ToolDef, own: VennCircle, other: VennCircle) => {
    const count = regions[tool.id] ?? 0;
    if (count <= 0) return;
    const p = exclusivePoint(own, other);
    if (!p) return;
    labels.push({
      key: tool.id,
      count,
      x: p.x,
      y: p.y,
      placement: 'inside',
      fromX: p.x,
      fromY: p.y,
      hitR: 12,
    });
  };
  pushExclusive(a, ca, cb);
  pushExclusive(b, cb, ca);

  const bothKey = [a.id, b.id].sort().join('+');
  const both = regions[bothKey] ?? 0;
  if (both > 0) {
    const anchor = overlapAnchor(ca, cb);
    if (anchor) {
      const clearance = overlapClearance(ca, cb);
      const tiny = clearance < MIN_INSIDE_R;
      const outside = tiny ? outsideNear(small, large, width, height) : anchor;
      labels.push({
        key: bothKey,
        count: both,
        x: outside.x,
        y: outside.y,
        placement: tiny ? 'outside' : 'inside',
        fromX: anchor.x,
        fromY: anchor.y,
        hitR: Math.max(12, Math.min(clearance, 16)),
      });
    }
  }

  const outs = labels.filter((l) => l.placement === 'outside');
  if (outs.length === 2 && dist(outs[0], outs[1]) < 16) {
    outs[1].y = clamp(outs[1].x, outs[1].y + 16, width, height).y;
  }
  return labels;
}
