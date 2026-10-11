/** Geometry for keeping a tilted export card inside its preview box. */

/**
 * Camera distance as a multiple of the card's long edge. A fixed distance
 * leans a big desktop card harder than a phone card at the same angle: at
 * 600 px and full tilt, a 1090 px card drew its near edge 1.25 times its far
 * edge, and a 342 px phone card 1.06 times. 1.75 is the phone card's ratio,
 * so every card leans like the phone card did.
 */
export const PREVIEW_PERSPECTIVE_RATIO = 1.75;

/** Camera distance in px for a card of this size. The workshop swaps in others. */
export type PreviewCamera = (width: number, height: number) => number;

export const previewPerspectivePx: PreviewCamera = (width, height) =>
  PREVIEW_PERSPECTIVE_RATIO * Math.max(1, width, height);
export const PREVIEW_REST_PAD = 8;
/** Transparent gutter on the tilt hit so a raised-edge shadow can paint past the paper. */
export const PREVIEW_SHADOW_PAD_PX = 40;

type ProjectedCardAabb = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
};

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Screen-space AABB of a plane after CSS `rotateY() rotateX()` (rotateX first)
 * under a perspective camera sitting `perspectivePx` in front of the card,
 * by default `camera` (`previewPerspectivePx`) of the card's own size.
 * Origin is the card centre. No translateZ — the rotator does not lift.
 */
function projectedCardAabb(opts: {
  width: number;
  height: number;
  tiltXDeg: number;
  tiltYDeg: number;
  perspectivePx?: number;
  camera?: PreviewCamera;
}): ProjectedCardAabb {
  const width = Math.max(0, opts.width);
  const height = Math.max(0, opts.height);
  const perspectivePx = opts.perspectivePx ?? (opts.camera ?? previewPerspectivePx)(width, height);
  const ax = rad(opts.tiltXDeg);
  const ay = rad(opts.tiltYDeg);
  const cosX = Math.cos(ax);
  const sinX = Math.sin(ax);
  const cosY = Math.cos(ay);
  const sinY = Math.sin(ay);
  const hw = width / 2;
  const hh = height / 2;
  const corners: Array<readonly [number, number]> = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x0, y0] of corners) {
    const y1 = y0 * cosX;
    const z1 = y0 * sinX;
    const x2 = x0 * cosY + z1 * sinY;
    const y2 = y1;
    const z2 = -x0 * sinY + z1 * cosY;
    const persp = perspectivePx / Math.max(1, perspectivePx - z2);
    const sx = x2 * persp;
    const sy = y2 * persp;
    minX = Math.min(minX, sx);
    maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy);
    maxY = Math.max(maxY, sy);
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

/** True when a centred AABB sits inside the box with `pad` on each side. */
function aabbFitsCentered(
  aabb: ProjectedCardAabb,
  boxWidth: number,
  boxHeight: number,
  pad = 0,
): boolean {
  const halfW = boxWidth / 2 - pad;
  const halfH = boxHeight / 2 - pad;
  return (
    aabb.minX >= -halfW - 0.5 &&
    aabb.maxX <= halfW + 0.5 &&
    aabb.minY >= -halfH - 0.5 &&
    aabb.maxY <= halfH + 0.5
  );
}

/** Scale that keeps the projected card inside the box at this tilt. */
function fitScaleForTilt(opts: {
  cardWidth: number;
  cardHeight: number;
  boxWidth: number;
  boxHeight: number;
  tiltXDeg: number;
  tiltYDeg: number;
  pad?: number;
  camera?: PreviewCamera;
}): number {
  const pad = opts.pad ?? 0;
  if (opts.cardWidth <= 0 || opts.cardHeight <= 0) return 1;
  const fits = (scale: number) =>
    aabbFitsCentered(
      projectedCardAabb({
        width: opts.cardWidth * scale,
        height: opts.cardHeight * scale,
        tiltXDeg: opts.tiltXDeg,
        tiltYDeg: opts.tiltYDeg,
        camera: opts.camera,
      }),
      opts.boxWidth,
      opts.boxHeight,
      pad,
    );
  if (fits(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Unrotated contain size of a card with `aspect` (width/height) inside the box.
 */
function containUnrotatedSize(opts: {
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

/**
 * Pixel size that fills the box at rest as much as possible while the AABB
 * at `tiltDeg` (idle orbit) still stays inside. Pointer tilt past that is
 * clamped live; do not size for max tilt or the rest card looks zoomed out.
 *
 * `pad` is the gutter around the tilted AABB. Apply it once.
 */
export function fitCardInPreviewBox(opts: {
  boxWidth: number;
  boxHeight: number;
  aspect: number;
  tiltDeg: number;
  pad?: number;
  camera?: PreviewCamera;
}): { width: number; height: number } {
  const pad = opts.pad ?? PREVIEW_REST_PAD;
  const contained = containUnrotatedSize({ ...opts, pad });
  const scale = fitScaleForTilt({
    cardWidth: contained.width,
    cardHeight: contained.height,
    boxWidth: opts.boxWidth,
    boxHeight: opts.boxHeight,
    tiltXDeg: opts.tiltDeg,
    tiltYDeg: opts.tiltDeg,
    pad,
    camera: opts.camera,
  });
  return { width: contained.width * scale, height: contained.height * scale };
}

/** Scale a tilt vector so hypot(x, y) never exceeds `maxHypot`. */
export function clampHypot(
  x: number,
  y: number,
  maxHypot: number,
): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag <= maxHypot || mag === 0) return { x, y };
  const scale = maxHypot / mag;
  return { x: x * scale, y: y * scale };
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
  camera?: PreviewCamera;
}): { x: number; y: number } {
  const { tiltX, tiltY } = opts;
  const pad = opts.pad ?? 0;
  const fits = (x: number, y: number) =>
    aabbFitsCentered(
      projectedCardAabb({
        width: opts.cardWidth,
        height: opts.cardHeight,
        tiltXDeg: x,
        tiltYDeg: y,
        camera: opts.camera,
      }),
      opts.boxWidth,
      opts.boxHeight,
      pad,
    );
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

