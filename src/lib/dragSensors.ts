import { MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';

/**
 * The activation rule every drag surface in the app shares.
 *
 * Two sensors, not one, because a finger and a cursor mean different things by
 * the same movement:
 *
 * - **A cursor** is precise and carries no other meaning, so 8px of travel is
 *   already intent.
 * - **A finger** is how the page is scrolled, panned and pinched. Starting a
 *   drag on movement alone means any of those can pick a row up by accident,
 *   so a touch has to press and hold first. `tolerance` is what makes that
 *   test real: move more than 5px before the hold is up and the gesture is a
 *   scroll or a pinch, and the sensor stands down instead of claiming it.
 *
 * That second point is also why a pinch survives. A `PointerSensor` claims the
 * gesture after a few pixels and calls `preventDefault` on the moves that
 * follow, which is a two-finger zoom swallowed by whatever happened to be
 * under the fingers. A delayed `TouchSensor` cancels itself on that movement
 * and leaves the gesture to the browser.
 */
export const DRAG_HOLD_MS = 250;
const TOUCH_SLOP_PX = 5;
const MOUSE_DISTANCE_PX = 8;

export function useDragSensors() {
  const mouse = useSensor(MouseSensor, {
    activationConstraint: { distance: MOUSE_DISTANCE_PX },
  });
  const touch = useSensor(TouchSensor, {
    activationConstraint: { delay: DRAG_HOLD_MS, tolerance: TOUCH_SLOP_PX },
  });
  return useSensors(mouse, touch);
}
