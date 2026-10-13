/**
 * The export preview's own tilt helpers: the idle orbit, the pose for a tilt,
 * the wake threshold, and hit tests.
 *
 * hover-tilt's code (https://github.com/simeydotme/hover-tilt) lives in
 * ./hover-tilt/, apart from this file, because its MPL-2.0 notice covers each
 * file that holds it. Keep it there: see THIRD_PARTY_NOTICES.md.
 */

import type { HoverTiltAxes, HoverTiltBox, HoverTiltPose } from './hover-tilt/hoverTilt';

/** Parked-cursor jitter below this keeps the idle orbit running on desktop. */
export const POINTER_WAKE_PX = 12;

/** True when the pointer left the seed by at least `slop` px. */
export function pointerMovedFrom(
  last: { x: number; y: number } | null,
  x: number,
  y: number,
  slop = POINTER_WAKE_PX,
): boolean {
  if (!last) return false;
  return Math.hypot(x - last.x, y - last.y) >= slop;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Inverse of `hoverTiltFromNormalized`: the pointer spot that gives this tilt. */
export function normalizedForTilt(
  rotateX: number,
  rotateY: number,
  axes: HoverTiltAxes,
): { nx: number; ny: number } {
  const fx = axes.tiltFactor ?? 1;
  const fy = axes.tiltFactorY ?? fx;
  const rotXMax = Math.max(0.001, axes.rotation * fy);
  const rotYMax = Math.max(0.001, axes.rotation * fx);
  return {
    nx: clamp(0.5 - rotateY / (2 * rotYMax), 0, 1),
    ny: clamp(0.5 + rotateX / (2 * rotXMax), 0, 1),
  };
}

/** True when the pointer is over the painted (transformed) card AABB. */
export function pointInBox(clientX: number, clientY: number, box: HoverTiltBox, pad = 0): boolean {
  return (
    clientX >= box.left - pad &&
    clientX <= box.left + box.width + pad &&
    clientY >= box.top - pad &&
    clientY <= box.top + box.height + pad
  );
}

/**
 * Idle orbit: 10° / 14s circle (sin on X, cos on Y).
 * In-phase sin/sin is a diagonal corner flip, not an orbit.
 */
export function idleOrbitPose(opts: {
  now: number;
  origin: number;
  idleMsX: number;
  idleMsY: number;
  idleTilt: number;
  /** The hover mapping, so the light sits where a pointer would for this tilt. */
  axes?: HoverTiltAxes;
}): HoverTiltPose {
  const t = opts.now - opts.origin;
  const rx = (t / Math.max(1, opts.idleMsX)) * Math.PI * 2;
  const ry = (t / Math.max(1, opts.idleMsY)) * Math.PI * 2;
  const rotateX = Math.sin(rx) * opts.idleTilt;
  const rotateY = Math.cos(ry) * opts.idleTilt;
  // The light sits where a pointer would for this tilt, so a hover or a
  // finger takes over without the pose or the glare jumping.
  const { nx, ny } = normalizedForTilt(rotateX, rotateY, opts.axes ?? { rotation: opts.idleTilt });
  return {
    rotateX,
    rotateY,
    pointerX: nx * 100,
    pointerY: ny * 100,
    nx,
    ny,
  };
}

export const REST_POSE: HoverTiltPose = {
  rotateX: 0,
  rotateY: 0,
  pointerX: 50,
  pointerY: 50,
  nx: 0.5,
  ny: 0.5,
};
