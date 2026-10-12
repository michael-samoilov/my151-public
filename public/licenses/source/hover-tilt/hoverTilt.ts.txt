/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/*
 * hover-tilt's pointer tilt, springs, enter, and leave, ported to TypeScript.
 *
 * Source: hover-tilt by Simon Goellner, https://github.com/simeydotme/hover-tilt
 *   at commit 5db58f38cbbfa20054ca2c21a144d866d304b34a:
 *   packages/hover-tilt/src/lib/components/HoverTilt.svelte
 *   packages/hover-tilt/src/lib/utils.ts
 * Copyright (c) 2026 Simeydotme
 *
 * The package states MPL-2.0 and the repository states MIT. my151 meets both:
 * this file carries the MPL notice above, and the MIT notice ships in
 * public/licenses/hover-tilt-MIT.txt (https://my151.app/licenses/hover-tilt-MIT.txt).
 * See THIRD_PARTY_NOTICES.md.
 *
 * my151 modified it:
 * - Ported from a Svelte 5 component to plain functions. In place of
 *   svelte/motion's Spring, a small spring here imitates it, and the caller
 *   ticks it each frame.
 * - The edge tilt is `rotation` times the tilt factor. The export preview
 *   passes its own rotation cap; `HOVER_TILT_ROTATION` is hover-tilt's.
 * - A pointer move also holds the activation target at 1.
 * - The scale takes one more factor, which the preview uses to ease it in.
 * - The shadow's offset and alpha are values, so a CSS layer can use them.
 *
 * Only code that comes from hover-tilt belongs in this folder. Its source is
 * published as https://my151.app/licenses/source/hover-tilt/hoverTilt.ts.txt,
 * and scripts/check-published-source.mjs keeps that copy equal to this file.
 */

/** The box hover-tilt `readElementBox` reads: the untransformed card. */
export type HoverTiltBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** One frame of hover-tilt's tilt and glare variables. */
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

/** Edge tilt is `rotation` times the axis factor. */
export type HoverTiltAxes = {
  rotation: number;
  tiltFactor?: number;
  tiltFactorY?: number;
};

/** A svelte/motion `Spring`, the kind hover-tilt animates `activation` and `position` with. */
export type HoverTiltSpring = {
  value: number;
  velocity: number;
  target: number;
  stiffness: number;
  damping: number;
  precision: number;
};

/** hover-tilt `ROTATION`: the edge tilt in degrees at a tilt factor of 1. */
export const HOVER_TILT_ROTATION = 10;

/** hover-tilt `defaultSpringOptions`. */
export const HOVER_TILT_SPRING = {
  stiffness: 0.2,
  damping: 0.8,
  precision: 0.001,
} as const;

/** hover-tilt `setExitSpringOptions`: stiffness * 0.2, damping * 0.5. */
export const HOVER_TILT_EXIT_SPRING = {
  stiffness: HOVER_TILT_SPRING.stiffness * 0.2,
  damping: HOVER_TILT_SPRING.damping * 0.5,
  precision: HOVER_TILT_SPRING.precision,
} as const;

/** hover-tilt `exitDelay` default. */
export const HOVER_TILT_EXIT_DELAY_MS = 200;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** hover-tilt `new Spring(value, defaultSpringOptions)`. */
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

/** hover-tilt `resetSpringOptions` and `setExitSpringOptions`, for one spring. */
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

/** True when the spring sits at its target, as svelte/motion settles it. */
export function springSettled(spring: HoverTiltSpring): boolean {
  return (
    Math.abs(spring.target - spring.value) < spring.precision &&
    Math.abs(spring.velocity) < spring.precision
  );
}

/** hover-tilt `readElementBox` + `pointerPositionFromEvent`. */
function pointerNormalized(clientX: number, clientY: number, box: HoverTiltBox): {
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

/** The pose for a pointer over `box`. */
export function hoverTiltFromPointer(
  clientX: number,
  clientY: number,
  box: HoverTiltBox,
  axes: HoverTiltAxes,
): HoverTiltPose {
  const n = pointerNormalized(clientX, clientY, box);
  return hoverTiltFromNormalized(n.x, n.y, axes);
}

/** hover-tilt `schedulePointerUpdate`'s write: `position.set` to the pointer. */
export function hoverTiltPointerMove(
  x: HoverTiltSpring,
  y: HoverTiltSpring,
  activation: HoverTiltSpring,
  to: { nx: number; ny: number },
): void {
  x.target = to.nx;
  y.target = to.ny;
  activation.target = 1;
}

/** hover-tilt `interactEnter`: `resetSpringOptions`, `activation.set(1)`, and the pointer. */
export function hoverTiltEnter(
  x: HoverTiltSpring,
  y: HoverTiltSpring,
  activation: HoverTiltSpring,
  to: { nx: number; ny: number },
): void {
  hoverTiltPointerMove(x, y, activation, to);
  applySpringOpts(x, HOVER_TILT_SPRING);
  applySpringOpts(y, HOVER_TILT_SPRING);
  applySpringOpts(activation, HOVER_TILT_SPRING);
}

/**
 * hover-tilt `interactLeave` once `exitDelay` passes: `setExitSpringOptions`,
 * then the position back to the center and the activation to 0.
 */
export function hoverTiltLeave(x: HoverTiltSpring, y: HoverTiltSpring, activation: HoverTiltSpring): void {
  applySpringOpts(x, HOVER_TILT_EXIT_SPRING);
  applySpringOpts(y, HOVER_TILT_EXIT_SPRING);
  applySpringOpts(activation, HOVER_TILT_EXIT_SPRING);
  x.target = 0.5;
  y.target = 0.5;
  activation.target = 0;
}

/** hover-tilt `scaleValue`, times `ease`. */
export function hoverTiltScale(scaleFactor: number, activation: number, ease: number): number {
  return 1 + (scaleFactor - 1) * activation * ease;
}

/** hover-tilt's shadow: `--shadow-x`, `--shadow-y`, and the alpha of its color. */
export function hoverTiltShadow(
  nx: number,
  ny: number,
  activation: number,
): { x: number; y: number; alpha: number } {
  return { x: nx * 2 - 1, y: ny * 2 - 1, alpha: activation * 0.125 };
}

/** hover-tilt `schedulePointerUpdate`: at most one write per animation frame. */
export function scheduleHoverTiltFrame(frame: { current: number | null }, write: () => void): void {
  if (frame.current !== null) return;
  frame.current = requestAnimationFrame(() => {
    frame.current = null;
    write();
  });
}

/** hover-tilt `interactLeave`: drop a write that has not run yet. */
export function cancelHoverTiltFrame(frame: { current: number | null }): void {
  if (frame.current !== null) {
    cancelAnimationFrame(frame.current);
    frame.current = null;
  }
}
