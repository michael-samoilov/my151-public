import { MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { HoldOrMoveTouchSensor } from './gridTouchSensor';

// platform: dnd-kit's PointerSensor calls preventDefault on later moves and swallows a pinch; a delayed TouchSensor cancels on movement instead.
const DRAG_HOLD_MS = 250;
const TOUCH_SLOP_PX = 5;
const MOUSE_DISTANCE_PX = 8;

// platform: dnd-kit's useSensor memoizes on the options object, so a fresh literal re-renders every draggable on each parent render.
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
 * `touch-action: none` so there is no pan for the browser to start.
 *
 * A pinch still zooms: the card zooms itself (`useCardZoom`), and the sensor
 * stands down the moment a second finger lands. So the one gesture that takes
 * the finger back is the one that should.
 */
export function useGridDragSensors() {
  const mouse = useSensor(MouseSensor, {
    activationConstraint: { distance: MOUSE_DISTANCE_PX },
  });
  const touch = useSensor(HoldOrMoveTouchSensor, { delay: DRAG_HOLD_MS, distance: 12 });
  return useSensors(mouse, touch);
}
