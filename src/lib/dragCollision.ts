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
 *     overlayLiftPx BELOW the mouse so the cursor stays visible above
 *     the held sprite.
 *   • Touch (thumb): thumb at bottom, held overlay overlayLiftPx above
 *     thumb, hit-test target touchHitLiftPx above thumb. Target sits
 *     directly above the overlay so the drop indicator is visible.
 *
 * Values are tile-height-dependent. The build page (Pokedex, 6-col grid,
 * ~60-80px tiles) uses lifts around 90 / 180. The view page (10-col
 * grid, ~40px tiles) uses roughly half those values. Each page
 * constructs its own collision detector and modifier via the factories
 * below so the lifts match the page's tile size.
 */

/**
 * Shared mutable flag for the current drag's input modality. Set in each
 * page's handleDragStart based on whether the activator event is a
 * TouchEvent; cleared on end / cancel. A ref-like object rather than
 * React state because the collision detector runs outside the render
 * cycle.
 */
export const dragInputIsTouch = { current: false };

/**
 * Whether a drag was started by a finger.
 *
 * Which event a sensor hands over depends on the sensor: `TouchSensor` gives
 * a `TouchEvent`, `PointerSensor` gives a `PointerEvent` whose `pointerType`
 * is the only thing that says finger or mouse. Checking for `TouchEvent`
 * alone is silently false on every PointerSensor surface.
 */
export function isTouchDrag(activatorEvent: Event | null): boolean {
  if (!activatorEvent) return false;
  if (typeof TouchEvent !== 'undefined' && activatorEvent instanceof TouchEvent) return true;
  if (typeof PointerEvent !== 'undefined' && activatorEvent instanceof PointerEvent) {
    return activatorEvent.pointerType !== 'mouse';
  }
  return false;
}

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
 * Factory for a seamless-grid collision detector with a touch-aware
 * hit-test lift.
 *
 * 1. On touch drag, lift the pointer by `touchHitLiftPx` so the hit-test
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
export function createEffectiveCursorCollision(
  touchHitLiftPx: number,
): CollisionDetection {
  return (args) => {
    const raw = args.pointerCoordinates;
    // Stash for drag-move handlers so they can read the authoritative
    // pointer X directly instead of reconstructing from activator+delta.
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

/**
 * Factory for a modifier that centers the DragOverlay on the CURRENT
 * pointer (not the activator event's initial point) and lifts it by
 * `overlayLiftPx` — all in one transform. Three things matter:
 *
 * 1. Centering independent of grab point. Without this, dnd-kit's
 *    default preserves the initial finger-to-tile offset — grab the
 *    left edge of a 5-tile bundle and it pins to the thumb's left;
 *    grab the right and it pins right. We want the bundle always
 *    centered on the finger/mouse.
 *
 * 2. Use live pointer, not activator. The standard snapCenterToCursor
 *    derives the current pointer indirectly (activator + transform
 *    delta). That breaks if anything between drag-start and the
 *    current frame drifts — e.g. an auto-scroll shifts the page
 *    without generating a pointer-move event, so the overlay ends up
 *    at a different visual position than the faint cursor and snap
 *    indicator (which both read from dragPointerRef directly). Using
 *    dragPointerRef for the overlay too keeps all three aligned on
 *    the same viewport-coord source of truth.
 *
 * 3. The lift MUST be in this transform, not a child translateY.
 *    draggingNodeRect is getBoundingClientRect — it includes any CSS
 *    transforms on descendants — so a nested translateY shifts the
 *    rect, and the centering math below compensates it back out
 *    (they cancel).
 */
export function createSnapCenterToPointer(overlayLiftPx: number): Modifier {
  return ({ draggingNodeRect, transform }) => {
    const ptr = dragPointerRef.current;
    if (!draggingNodeRect || !ptr) return transform;
    // Touch: lift overlay ABOVE the thumb (−). Desktop: drop it BELOW the cursor (+).
    const lift = dragInputIsTouch.current ? -overlayLiftPx : overlayLiftPx;
    return {
      ...transform,
      x: ptr.x - draggingNodeRect.left - draggingNodeRect.width / 2,
      y: ptr.y - draggingNodeRect.top - draggingNodeRect.height / 2 + lift,
    };
  };
}

