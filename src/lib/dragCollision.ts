import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type Modifier,
} from '@dnd-kit/core';

/**
 * Drag-overlay visual stack (zones should sit flush against each other —
 * no empty space between the pointer and the overlay, or between the
 * overlay and the hit-test target):
 *   • Desktop (mouse): mouse cursor = hit-test target. Overlay floats
 *     OVERLAY_LIFT_PX above the mouse — just enough clearance for the
 *     held sprite's bottom edge to sit above the cursor.
 *   • Touch (thumb): thumb at bottom, held overlay OVERLAY_LIFT_PX above
 *     thumb, hit-test target TOUCH_HIT_LIFT_PX above thumb. Target sits
 *     directly above the overlay so the drop indicator is visible.
 *
 * Values assume an approximate tile height of ~60-80px. They're sized so
 * the bottom of the overlay is ~10-20px above the thumb, and the target
 * tile is ~10-20px above the top of the overlay — tight enough that the
 * user doesn't see dead space between their finger and what they're
 * holding.
 */
export const OVERLAY_LIFT_PX = 50;
export const TOUCH_HIT_LIFT_PX = 140;

/**
 * Shared mutable flag for the current drag's input modality. Set in each
 * page's handleDragStart based on whether the activator event is a
 * TouchEvent; cleared on end / cancel. A ref-like object rather than
 * React state because the collision detector runs outside the render
 * cycle.
 */
export const dragInputIsTouch = { current: false };

/**
 * Last raw pointer coordinates observed by the collision detector. Set
 * on every collision check (which is every pointer move), cleared on
 * drag end. Drag-move handlers read from this as the authoritative
 * pointer position — the same coordinate dnd-kit uses to resolve
 * `event.over` — rather than reconstructing from activatorEvent +
 * delta, which can drift subtly and produce inverted dropSide on
 * multi-tile bundles.
 */
export const dragPointerRef: { current: { x: number; y: number } | null } = {
  current: null,
};

/**
 * Seamless-grid collision detection with a touch-aware hit-test lift.
 *
 * 1. On touch drag, lift the pointer by TOUCH_HIT_LIFT_PX so the hit-test
 *    lands on the tile ABOVE the overlay the user is holding — not the
 *    tile under the overlay (which would be covered) or under the thumb
 *    (also covered). On desktop, use the raw mouse pointer.
 * 2. Try pointerWithin against the adjusted pointer. In a gapless grid
 *    this covers every pixel inside a droppable.
 * 3. Seamless fallback: snap to the droppable whose CENTER is closest to
 *    the adjusted pointer. This closes every dead zone (container
 *    padding, empty placeholder slots, section gaps) — every point in
 *    2D maps to exactly one droppable. We deliberately do NOT fall
 *    through to rectIntersection, which uses the dragged rect (offset
 *    differently from the adjusted pointer) and would re-introduce a
 *    row-jump bug.
 */
export const effectiveCursorCollision: CollisionDetection = (args) => {
  const raw = args.pointerCoordinates;
  // Stash for drag-move handlers so they can read the authoritative
  // pointer X directly instead of reconstructing from activator+delta.
  dragPointerRef.current = raw ? { x: raw.x, y: raw.y } : null;

  const effective = raw && dragInputIsTouch.current
    ? { x: raw.x, y: raw.y - TOUCH_HIT_LIFT_PX }
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

/**
 * Center the DragOverlay horizontally and vertically on the pointer,
 * independent of where on the grabbed tile the user first touched.
 * Without this, dnd-kit's default behavior preserves the initial
 * finger-to-tile offset — grab the left edge of a 5-tile bundle and
 * the overlay sticks to your finger's left; grab the right edge and
 * it sticks to the right. That breaks the mental model the user
 * expects: "wherever my thumb is, that's where the bundle is."
 *
 * Returns a transform that places the overlay's center at the current
 * pointer. The vertical lift (OVERLAY_LIFT_PX) is applied separately
 * via CSS translateY on the overlay's inner div.
 */
export const snapCenterToPointer: Modifier = ({
  activatorEvent,
  draggingNodeRect,
  transform,
}) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const e = activatorEvent as MouseEvent | TouchEvent;
  const p =
    'touches' in e && e.touches.length > 0
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : 'clientX' in e
        ? { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY }
        : null;
  if (!p) return transform;
  const offsetX = p.x - draggingNodeRect.left;
  const offsetY = p.y - draggingNodeRect.top;
  return {
    ...transform,
    x: transform.x + offsetX - draggingNodeRect.width / 2,
    y: transform.y + offsetY - draggingNodeRect.height / 2,
  };
};
