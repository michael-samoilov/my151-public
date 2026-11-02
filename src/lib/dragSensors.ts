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

export function useGridDragSensors() {
  const mouse = useSensor(MouseSensor, {
    activationConstraint: { distance: MOUSE_DISTANCE_PX },
  });
  const touch = useSensor(HoldOrMoveTouchSensor, { delay: DRAG_HOLD_MS, distance: 12 });
  return useSensors(mouse, touch);
}
