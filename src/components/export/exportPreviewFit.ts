/** Geometry for keeping a tilted export card inside its preview box. */

export const PREVIEW_PERSPECTIVE_PX = 900;
export const PREVIEW_LIFT_Z = 16;

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Screen-space size of a plane after rotateX/rotateY plus a small lift,
 * under a perspective camera sitting `perspectivePx` in front of the card.
 */
export function projectedCardSize(opts: {
  width: number;
  height: number;
  tiltXDeg: number;
  tiltYDeg: number;
  perspectivePx?: number;
  liftZ?: number;
}): { width: number; height: number } {
  const width = Math.max(0, opts.width);
  const height = Math.max(0, opts.height);
  const perspectivePx = opts.perspectivePx ?? PREVIEW_PERSPECTIVE_PX;
  const liftZ = opts.liftZ ?? PREVIEW_LIFT_Z;
  const ax = Math.abs(rad(opts.tiltXDeg));
  const ay = Math.abs(rad(opts.tiltYDeg));
  const zNear = liftZ + (width / 2) * Math.sin(ay) + (height / 2) * Math.sin(ax);
  const persp = perspectivePx / Math.max(1, perspectivePx - zNear);
  return {
    width: width * Math.cos(ay) * persp,
    height: height * Math.cos(ax) * persp,
  };
}

/** Scale that keeps the projected card inside the box at this tilt. */
export function fitScaleForTilt(opts: {
  cardWidth: number;
  cardHeight: number;
  boxWidth: number;
  boxHeight: number;
  tiltXDeg: number;
  tiltYDeg: number;
  pad?: number;
}): number {
  const pad = opts.pad ?? 0;
  const boxW = Math.max(1, opts.boxWidth - pad * 2);
  const boxH = Math.max(1, opts.boxHeight - pad * 2);
  if (opts.cardWidth <= 0 || opts.cardHeight <= 0) return 1;
  const projected = projectedCardSize({
    width: opts.cardWidth,
    height: opts.cardHeight,
    tiltXDeg: opts.tiltXDeg,
    tiltYDeg: opts.tiltYDeg,
  });
  return Math.min(1, boxW / Math.max(1, projected.width), boxH / Math.max(1, projected.height));
}

/**
 * Unrotated contain size of a card with `aspect` (width/height) inside the box.
 */
export function containUnrotatedSize(opts: {
  boxWidth: number;
  boxHeight: number;
  aspect: number;
  pad?: number;
}): { width: number; height: number } {
  const pad = opts.pad ?? 0;
  const innerW = Math.max(1, opts.boxWidth - pad * 2);
  const innerH = Math.max(1, opts.boxHeight - pad * 2);
  const aspect = opts.aspect > 0 ? opts.aspect : 1;
  if (innerW / innerH > aspect) {
    return { width: innerH * aspect, height: innerH };
  }
  return { width: innerW, height: innerW / aspect };
}

/** How much of the layer the card covers on its longer axis (0–1). */
export function previewCoverRatio(
  card: { width: number; height: number },
  layer: { width: number; height: number },
): number {
  const layerW = Math.max(1, layer.width);
  const layerH = Math.max(1, layer.height);
  return Math.max(card.width / layerW, card.height / layerH);
}

/**
 * Pixel size that fills the box at rest as much as possible while the AABB
 * at `tiltDeg` (idle orbit) still stays inside. Pointer tilt past that is
 * clamped; do not size for max tilt or the rest card looks zoomed out.
 */
export function fitCardInPreviewBox(opts: {
  boxWidth: number;
  boxHeight: number;
  aspect: number;
  tiltDeg: number;
  pad?: number;
}): { width: number; height: number } {
  const contained = containUnrotatedSize(opts);
  const scale = fitScaleForTilt({
    cardWidth: contained.width,
    cardHeight: contained.height,
    boxWidth: opts.boxWidth,
    boxHeight: opts.boxHeight,
    tiltXDeg: opts.tiltDeg,
    tiltYDeg: opts.tiltDeg,
    pad: opts.pad,
  });
  return { width: contained.width * scale, height: contained.height * scale };
}

/**
 * Scale the unrotated card so its AABB at `maxTiltDeg` still fits the box.
 * Prefer `fitCardInPreviewBox` for the live preview rest size.
 */
export function stableFitScale(opts: {
  boxWidth: number;
  boxHeight: number;
  maxTiltDeg: number;
  pad?: number;
}): number {
  return fitScaleForTilt({
    cardWidth: opts.boxWidth,
    cardHeight: opts.boxHeight,
    boxWidth: opts.boxWidth,
    boxHeight: opts.boxHeight,
    tiltXDeg: opts.maxTiltDeg,
    tiltYDeg: opts.maxTiltDeg,
    pad: opts.pad,
  });
}

/** Shrink a tilt vector until the projected AABB fits the box. */
export function clampTiltToBox(opts: {
  tiltX: number;
  tiltY: number;
  cardWidth: number;
  cardHeight: number;
  boxWidth: number;
  boxHeight: number;
  pad?: number;
}): { x: number; y: number } {
  const { tiltX, tiltY } = opts;
  const pad = opts.pad ?? 0;
  const fits = (x: number, y: number) => {
    const projected = projectedCardSize({
      width: opts.cardWidth,
      height: opts.cardHeight,
      tiltXDeg: x,
      tiltYDeg: y,
    });
    return (
      projected.width <= opts.boxWidth - pad * 2 + 0.5 &&
      projected.height <= opts.boxHeight - pad * 2 + 0.5
    );
  };
  if (fits(tiltX, tiltY)) return { x: tiltX, y: tiltY };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (fits(tiltX * mid, tiltY * mid)) lo = mid;
    else hi = mid;
  }
  return { x: tiltX * lo, y: tiltY * lo };
}

/** Pointer is near the card when it sits inside the card rect plus a halo. */
export function pointerNearPreview(
  clientX: number,
  clientY: number,
  card: { left: number; top: number; right: number; bottom: number; width: number; height: number },
  haloPx = 64,
): boolean {
  const halo = Math.max(24, Math.min(haloPx, Math.min(card.width, card.height) * 0.18));
  return (
    clientX >= card.left - halo &&
    clientX <= card.right + halo &&
    clientY >= card.top - halo &&
    clientY <= card.bottom + halo
  );
}
