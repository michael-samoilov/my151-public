import { MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { HoldOrMoveTouchSensor } from './gridTouchSensor';

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
const DRAG_HOLD_MS = 250;
const TOUCH_SLOP_PX = 5;
const MOUSE_DISTANCE_PX = 8;

// Module constants rather than literals in the hook. `useSensor` memoizes on
// the options object, so a fresh literal gave every render of a drag surface a
// new sensor list. DndContext passes that list to every draggable through its
// context, so each parent render re-rendered every tile. A full build page has
// 151 tiles and renders several times during startup.
const MOUSE_OPTIONS = { activationConstraint: { distance: MOUSE_DISTANCE_PX } };
const TOUCH_OPTIONS = { activationConstraint: { delay: DRAG_HOLD_MS, tolerance: TOUCH_SLOP_PX } };

export function useDragSensors() {
  const mouse = useSensor(MouseSensor, MOUSE_OPTIONS);
  const touch = useSensor(TouchSensor, TOUCH_OPTIONS);
  return useSensors(mouse, touch);
}

/**
 * The gym card's rule: a press that lands on a cell is a drag, not a scroll,
 * and the drag begins on a hold or on movement, whichever comes first.
 *
 * The card is a grid whose whole purpose is dragging a line up, down and
 * across, and the page scrolls behind it. Under the shared rule the two
 * fought for the same finger: 5px of drift before the hold was up stood the
 * sensor down and handed the gesture to the page, so a drag begun with a
 * moving finger scrolled the card away instead of picking a line up. And a
 * hold alone lost the quick gestures: a flick that moved a Pokemon two rows
 * and lifted inside the hold never began a drag, and one that stopped
 * inside it began at the cell it started from. `HoldOrMoveTouchSensor`
 * begins on the hold for a still press and on movement for a moving one,
 * never stands down for movement, and the cell asks for
 * `touch-action: pinch-zoom` so there is no pan for the browser to start.
 *
 * A pinch still reaches the browser. `pinch-zoom` leaves the two-finger
 * gesture to it, and the sensor stands down the moment a second finger lands.
 * So the one gesture that takes the finger back is the one that should.
 */
export function useGridDragSensors() {
  const mouse = useSensor(MouseSensor, {
    activationConstraint: { distance: MOUSE_DISTANCE_PX },
  });
  const touch = useSensor(HoldOrMoveTouchSensor, { delay: DRAG_HOLD_MS, distance: 12 });
  return useSensors(mouse, touch);
}
