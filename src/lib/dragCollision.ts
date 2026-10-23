import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type Modifier,
} from '@dnd-kit/core';

export const dragInputIsTouch = { current: false };

export function isTouchDrag(activatorEvent: Event | null): boolean {
  if (!activatorEvent) return false;
  if (typeof TouchEvent !== 'undefined' && activatorEvent instanceof TouchEvent) return true;
  if (typeof PointerEvent !== 'undefined' && activatorEvent instanceof PointerEvent) {
    return activatorEvent.pointerType !== 'mouse';
  }
  return false;
}

export const dragPointerRef: { current: { x: number; y: number } | null } = {
  current: null,
};

export function createEffectiveCursorCollision(
  touchHitLiftPx: number,
): CollisionDetection {
  return (args) => {
    const raw = args.pointerCoordinates;
    dragPointerRef.current = raw ? { x: raw.x, y: raw.y } : null;

    const effective = raw && dragInputIsTouch.current
      ? { x: raw.x, y: raw.y - touchHitLiftPx }
      : raw;
    const adjusted = effective === raw ? args : { ...args, pointerCoordinates: effective };

    const hits = pointerWithin(adjusted);
    if (hits.length > 0) return hits;

    if (!effective) return closestCenter(adjusted);

    let bestId: string | number | null = null;
    let bestD2 = Infinity;
    args.droppableContainers.forEach((c) => {
      const r = args.droppableRects.get(c.id);
      if (!r) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d2 = (cx - effective.x) ** 2 + (cy - effective.y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestId = c.id;
      }
    });
    return bestId !== null ? [{ id: bestId, data: { value: bestD2 } }] : [];
  };
}

export function createSnapCenterToPointer(overlayLiftPx: number): Modifier {
  return ({ draggingNodeRect, transform }) => {
    const ptr = dragPointerRef.current;
    if (!draggingNodeRect || !ptr) return transform;
    const lift = dragInputIsTouch.current ? -overlayLiftPx : overlayLiftPx;
    return {
      ...transform,
      x: ptr.x - draggingNodeRect.left - draggingNodeRect.width / 2,
      y: ptr.y - draggingNodeRect.top - draggingNodeRect.height / 2 + lift,
    };
  };
}

