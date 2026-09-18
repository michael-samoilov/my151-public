/**
 * Pointer → tilt matching poke-holo / hover-tilt.
 *
 * poke-holo (https://github.com/simeydotme/pokemon-cards-css):
 *   percent from the untransformed box, center = percent - 50,
 *   --rotate-x = -(center.x / 3.5), --rotate-y = center.y / 3.5,
 *   transform: rotateY(var(--rotate-x)) rotateX(var(--rotate-y)).
 * hover-tilt (https://github.com/simeydotme/hover-tilt) is the same axes
 * with CSS custom properties; scaleFactor defaults to 1 (no bounce-zoom).
 */

export type HoverTiltBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type HoverTiltPose = {
  /** CSS rotateX amount in degrees (`--rotate-y` in poke-holo). */
  rotateX: number;
  /** CSS rotateY amount in degrees (`--rotate-x` in poke-holo). */
  rotateY: number;
  /** Glare X, 0–100. */
  pointerX: number;
  /** Glare Y, 0–100. */
  pointerY: number;
};

const POKE_HOLO_DIVISOR = 3.5;

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Pointer position as 0–100 percent of an untransformed hit box. */
export function pointerPercent(clientX: number, clientY: number, box: HoverTiltBox): { x: number; y: number } {
  const width = box.width || 1;
  const height = box.height || 1;
  return {
    x: clamp(((clientX - box.left) / width) * 100, 0, 100),
    y: clamp(((clientY - box.top) / height) * 100, 0, 100),
  };
}

/**
 * Live hover pose from a pointer on the untransformed hit box.
 * Right edge dips toward the user (rotateY negative). Bottom edge dips
 * toward the user (rotateX positive). Center stays facing the user.
 */
export function pokeHoloFromPointer(
  clientX: number,
  clientY: number,
  box: HoverTiltBox,
  maxTilt: number,
): HoverTiltPose {
  const percent = pointerPercent(clientX, clientY, box);
  const centerX = percent.x - 50;
  const centerY = percent.y - 50;
  return {
    rotateX: clamp(centerY / POKE_HOLO_DIVISOR, -maxTilt, maxTilt),
    rotateY: clamp(-(centerX / POKE_HOLO_DIVISOR), -maxTilt, maxTilt),
    pointerX: percent.x,
    pointerY: percent.y,
  };
}

/** Idle orbit that starts already tilted and moving, with no pointer. */
export function pokeHoloIdle(opts: {
  now: number;
  origin: number;
  idleMsX: number;
  idleMsY: number;
  idleTilt: number;
}): HoverTiltPose {
  const t = opts.now - opts.origin;
  const rx = (t / Math.max(1, opts.idleMsX)) * Math.PI * 2;
  const ry = (t / Math.max(1, opts.idleMsY)) * Math.PI * 2;
  const rotateY = Math.sin(rx) * opts.idleTilt;
  const rotateX = Math.cos(ry) * opts.idleTilt;
  return {
    rotateX,
    rotateY,
    pointerX: clamp(50 + Math.sin(rx) * 45, 0, 100),
    pointerY: clamp(50 + Math.cos(ry) * 45, 0, 100),
  };
}

export const REST_POSE: HoverTiltPose = {
  rotateX: 0,
  rotateY: 0,
  pointerX: 50,
  pointerY: 50,
};
