import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from '@dnd-kit/core';

/**
 * How far above the finger the touch DragOverlay is translated. This is
 * purely a VISUAL offset so the held sprite isn't obscured by the user's
 * finger — hit-testing deliberately uses the raw finger position (see
 * `effectiveCursorCollision`). Decoupling visual lift from hit-test keeps
 * the drop indicator visible on the target tile, which otherwise would
 * sit directly under the overlay.
 */
export const TOUCH_OVERLAY_LIFT_PX = 140;

/**
 * Shared mutable flag for the current drag's input modality. Kept for
 * callers that still want to know whether the active drag is touch (used
 * for the overlay's CSS transform). The collision detector itself no
 * longer reads this — hit-testing always uses the raw pointer.
 */
export const dragInputIsTouch = { current: false };

/**
 * Seamless-grid collision detection using the RAW pointer position.
 *
 * Design intent: the user's finger (or mouse) is the source of truth for
 * where they want to drop. The touch DragOverlay floats 140px above the
 * finger as a visible reminder of what's being held, but the target tile
 * the user is pointing at is the one directly under their finger. This
 * keeps the drop indicator visible on that target — if the hit-test were
 * lifted to match the overlay, the overlay would sit on top of the target
 * and obscure the indicator.
 *
 * 1. Try pointerWithin against the raw pointer. In a gapless grid this
 *    covers every pixel inside a droppable.
 * 2. Seamless fallback: snap to the droppable whose CENTER is closest to
 *    the raw pointer. This closes every dead zone (container padding,
 *    empty placeholder slots, section gaps) — every point in 2D maps to
 *    exactly one droppable. We do NOT fall back to rectIntersection
 *    because it uses the dragged rect (which is offset differently from
 *    the pointer in a lifted overlay) and can produce a row-jump.
 */
export const effectiveCursorCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length > 0) return hits;

  const p = args.pointerCoordinates;
  if (!p) return closestCenter(args);

  let bestId: string | number | null = null;
  let bestD2 = Infinity;
  args.droppableContainers.forEach((c) => {
    const r = args.droppableRects.get(c.id);
    if (!r) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d2 = (cx - p.x) ** 2 + (cy - p.y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestId = c.id;
    }
  });
  return bestId !== null ? [{ id: bestId, data: { value: bestD2 } }] : [];
};
