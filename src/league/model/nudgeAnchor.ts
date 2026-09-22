/**
 * Which toolbar Export button the funnel popup may point at.
 *
 * On mobile the league home and the trainer card sit on one 200%-wide track
 * that pans with a 280ms transform. Measuring during that pan gives a rect
 * still off to the left — often a 2px sliver, which is where the league name
 * will sit once the pan finishes. The arrow then points at the title. Only a
 * control that has fully entered the viewport is a valid anchor.
 */

export function visibleArea(
  r: { left: number; right: number; top: number; bottom: number },
  vw: number,
  vh: number,
): number {
  const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  return w * h;
}

export function isOnScreenAnchor(
  r: { left: number; right: number; top: number; bottom: number },
  vw: number,
  vh: number,
): boolean {
  return visibleArea(r, vw, vh) > 0 && r.left >= 0 && r.top >= 0;
}

export function pickVisibleAnchor(nodes: readonly Element[], vw: number, vh: number): Element | null {
  let best: Element | null = null;
  let bestArea = 0;
  for (const el of nodes) {
    const rect = el.getBoundingClientRect();
    if (!isOnScreenAnchor(rect, vw, vh)) continue;
    const area = visibleArea(rect, vw, vh);
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }
  return best;
}
