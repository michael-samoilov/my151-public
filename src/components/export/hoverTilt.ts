/**
 * Pointer → tilt copied from hover-tilt's web component.
 *
 * Source: https://github.com/simeydotme/hover-tilt
 *   packages/hover-tilt/src/lib/components/HoverTilt.svelte
 *   packages/hover-tilt/src/lib/utils.ts
 * License: MIT, copyright (c) 2026 Simeydotme. Full text in
 *   public/licenses/hover-tilt-MIT.txt; see THIRD_PARTY_NOTICES.md.
 *
 * Do not invent a parallel orbit. Write their CSS custom properties.
 */

export type HoverTiltBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type HoverTiltPose = {
  /** CSS rotateX (`--rotation-x`). */
  rotateX: number;
  /** CSS rotateY (`--rotation-y`). */
  rotateY: number;
  /** Glare X, 0–100. */
  pointerX: number;
  /** Glare Y, 0–100. */
  pointerY: number;
  /** hover-tilt `--hover-tilt-x`, 0–1. */
  nx: number;
  /** hover-tilt `--hover-tilt-y`, 0–1. */
  ny: number;
};

/**
 * Edge tilt is `rotation` times the axis factor. hover-tilt's `ROTATION` is
 * 10; the preview passes the foil recipe's `maxTilt`.
 */
export type HoverTiltAxes = {
  rotation: number;
  tiltFactor?: number;
  tiltFactorY?: number;
};

/** hover-tilt `defaultSpringOptions`. */
export const HOVER_TILT_SPRING = {
  stiffness: 0.2,
  damping: 0.8,
  precision: 0.001,
} as const;

/** Leave: stiffness * 0.2, damping * 0.5. */
export const HOVER_TILT_EXIT_SPRING = {
  stiffness: HOVER_TILT_SPRING.stiffness * 0.2,
  damping: HOVER_TILT_SPRING.damping * 0.5,
  precision: HOVER_TILT_SPRING.precision,
} as const;

export const HOVER_TILT_EXIT_DELAY_MS = 200;

/** Parked-cursor jitter below this keeps poke-holo idle on desktop. */
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

export type HoverTiltSpring = {
  value: number;
  velocity: number;
  target: number;
  stiffness: number;
  damping: number;
  precision: number;
};

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function createSpring(value: number, opts = HOVER_TILT_SPRING): HoverTiltSpring {
  return {
    value,
    velocity: 0,
    target: value,
    stiffness: opts.stiffness,
    damping: opts.damping,
    precision: opts.precision,
  };
}

export function applySpringOpts(
  spring: HoverTiltSpring,
  opts: { stiffness: number; damping: number },
): void {
  spring.stiffness = opts.stiffness;
  spring.damping = opts.damping;
}

/**
 * One svelte/motion-style integration step. hover-tilt coalesces pointer
 * writes onto rAF, then this spring ticks every frame.
 */
export function tickSpring(spring: HoverTiltSpring, dtMs: number): number {
  const capped = Math.min(Math.max(dtMs, 0), 64);
  const steps = Math.max(1, Math.round(capped / 16.67));
  const frames = capped / 16.67 / steps;
  for (let i = 0; i < steps; i++) {
    const delta = spring.target - spring.value;
    if (Math.abs(delta) < spring.precision && Math.abs(spring.velocity) < spring.precision) {
      spring.value = spring.target;
      spring.velocity = 0;
      return spring.value;
    }
    spring.velocity += (spring.stiffness * delta - spring.damping * spring.velocity) * frames;
    spring.value += spring.velocity * frames;
  }
  return spring.value;
}

export function springSettled(spring: HoverTiltSpring): boolean {
  return (
    Math.abs(spring.target - spring.value) < spring.precision &&
    Math.abs(spring.velocity) < spring.precision
  );
}

/** hover-tilt `readElementBox` + `pointerPositionFromEvent`. */
export function pointerNormalized(clientX: number, clientY: number, box: HoverTiltBox): {
  x: number;
  y: number;
} {
  const width = box.width || 1;
  const height = box.height || 1;
  return {
    x: clamp((clientX - box.left) / width, 0, 1),
    y: clamp((clientY - box.top) / height, 0, 1),
  };
}

/** Pointer position as 0–100 percent of the given box. */
export function pointerPercent(clientX: number, clientY: number, box: HoverTiltBox): { x: number; y: number } {
  const n = pointerNormalized(clientX, clientY, box);
  return { x: n.x * 100, y: n.y * 100 };
}

/**
 * hover-tilt CSS:
 *   --rotation-x: y * rotY * 2 - rotY
 *   --rotation-y: (1 - x) * rotX * 2 - rotX
 *   transform: scale() rotateX(--rotation-x) rotateY(--rotation-y)
 */
export function hoverTiltFromNormalized(
  nx: number,
  ny: number,
  axes: HoverTiltAxes,
): HoverTiltPose {
  const x = clamp(nx, 0, 1);
  const y = clamp(ny, 0, 1);
  const fx = axes.tiltFactor ?? 1;
  const fy = axes.tiltFactorY ?? fx;
  const rotXMax = axes.rotation * fy;
  const rotYMax = axes.rotation * fx;
  return {
    rotateX: y * rotXMax * 2 - rotXMax,
    rotateY: (1 - x) * rotYMax * 2 - rotYMax,
    pointerX: x * 100,
    pointerY: y * 100,
    nx: x,
    ny: y,
  };
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

/**
 * Live hover pose. `box` is hover-tilt `readElementBox`: the untransformed
 * container. The rotated card AABB inverts opposite corners.
 */
export function hoverTiltFromPointer(
  clientX: number,
  clientY: number,
  box: HoverTiltBox,
  axes: HoverTiltAxes,
): HoverTiltPose {
  const n = pointerNormalized(clientX, clientY, box);
  return hoverTiltFromNormalized(n.x, n.y, axes);
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
export function pokeHoloIdle(opts: {
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
