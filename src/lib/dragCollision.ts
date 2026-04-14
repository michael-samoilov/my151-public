import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from '@dnd-kit/core';

/**
 * On touch drag, the DragOverlay is translated up by this many pixels so
 * the user's finger doesn't occlude the sprite. The collision detector
 * must apply the same offset to the pointer when hit-testing, so the
 * "effective cursor" matches what the user visually sees under the
 * overlay — not the raw finger position, which sits this many px below.
 */
export const TOUCH_OVERLAY_LIFT_PX = 80;

/**
 * Shared mutable flag so the module-scope collision detector can read the
 * current drag's input modality. Set in handleDragStart, cleared on end /
 * cancel. A ref-like object rather than React state because the collision
 * detector runs outside the render cycle.
 */
export const dragInputIsTouch = { current: false };

/**
 * "Effective cursor" collision detection with a seamless-grid fallback.
 *
 * 1. Adjust the pointer coordinate to match the VISUAL overlay: on touch
 *    drag, lift the pointer by TOUCH_OVERLAY_LIFT_PX so the hit-test
 *    aligns with what the user actually sees above their finger. Without
 *    this, dragging downward can snap the indicator to the row the finger
 *    is over — a row below where the overlay visually sits, or vice
 *    versa when falling back to rectIntersection.
 *
 * 2. Try pointerWithin against the adjusted cursor. In a gapless grid
 *    this covers every pixel.
 *
 * 3. Seamless fallback: snap to the droppable whose center is closest to
 *    the adjusted cursor. This closes every dead zone (container
 *    padding, empty placeholders, section gaps on the build page) —
 *    every point in 2D now maps to exactly one droppable. We
 *    deliberately do NOT fall through to rectIntersection, which would
 *    re-introduce the row-jump bug because the dragged rect is
 *    translated differently than the adjusted cursor.
 */
export const effectiveCursorCollision: CollisionDetection = (args) => {
  const raw = args.pointerCoordinates;
  const effective = raw && dragInputIsTouch.current
    ? { x: raw.x, y: raw.y - TOUCH_OVERLAY_LIFT_PX }
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
