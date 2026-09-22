/** Geometry for keeping a tilted export card inside its preview box. */

export const PREVIEW_PERSPECTIVE_PX = 600;
export const PREVIEW_REST_PAD = 8;
/** Live tilt must keep this many CSS px between the painted AABB and the pane. */
export const PREVIEW_TILT_INSET = 24;
/**
 * hover-tilt ROTATION is 10° on one axis. A corner is ~14°. Cap the vector
 * at 10° so an edge matches the library and a corner does not become a diamond.
 * clampTiltToBox still keeps the painted card inside the pane.
 */
export const PREVIEW_DESKTOP_MAX_HYPOT = 10;
export const PREVIEW_MOBILE_MAX_HYPOT = 10;
export const PREVIEW_DESKTOP_MIN_PX = 1024;
/** Transparent gutter on the tilt hit so a raised-edge shadow can paint past the paper. */
export const PREVIEW_SHADOW_PAD_PX = 40;
export const PREVIEW_SHADOW_REST = 0.14;
export const PREVIEW_SHADOW_PEAK = 0.44;
export const PREVIEW_SHADOW_BASE = 0.18;
export const PREVIEW_SHADOW_HYPOT_DIV = 18;

export function previewMaxHypot(widthPx: number): number {
  return widthPx >= PREVIEW_DESKTOP_MIN_PX ? PREVIEW_DESKTOP_MAX_HYPOT : PREVIEW_MOBILE_MAX_HYPOT;
}

/** Raised-edge drop-shadow opacity. Stronger than the 0.36 mild cap, below the old 0.50 slab. */
export function previewShadowOpacity(hypot: number): number {
  if (hypot < 0.4) return PREVIEW_SHADOW_REST;
  return Math.min(PREVIEW_SHADOW_PEAK, PREVIEW_SHADOW_BASE + hypot / PREVIEW_SHADOW_HYPOT_DIV);
}

export type ProjectedCardAabb = {
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
 * under a perspective camera sitting `perspectivePx` in front of the card.
 * Origin is the card centre. No translateZ — the rotator does not lift.
 */
export function projectedCardAabb(opts: {
  width: number;
  height: number;
  tiltXDeg: number;
  tiltYDeg: number;
  perspectivePx?: number;
}): ProjectedCardAabb {
  const width = Math.max(0, opts.width);
  const height = Math.max(0, opts.height);
  const perspectivePx = opts.perspectivePx ?? PREVIEW_PERSPECTIVE_PX;
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
export function aabbFitsCentered(
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

/**
 * Screen-space size of a plane after rotateX/rotateY,
 * under a perspective camera sitting `perspectivePx` in front of the card.
 */
export function projectedCardSize(opts: {
  width: number;
  height: number;
  tiltXDeg: number;
  tiltYDeg: number;
  perspectivePx?: number;
}): { width: number; height: number } {
  const aabb = projectedCardAabb(opts);
  return { width: aabb.width, height: aabb.height };
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
  if (opts.cardWidth <= 0 || opts.cardHeight <= 0) return 1;
  const fits = (scale: number) =>
    aabbFitsCentered(
      projectedCardAabb({
        width: opts.cardWidth * scale,
        height: opts.cardHeight * scale,
        tiltXDeg: opts.tiltXDeg,
        tiltYDeg: opts.tiltYDeg,
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

/**
 * How far a painted card AABB spills past `inset` inside `box`.
 * 0 means every edge keeps at least `inset` px of pane.
 */
/** Keep the 24px target when rest has room; leave ~20px for idle AABB growth. */
export function tiltInsetForRestGap(restGap: number, want = PREVIEW_TILT_INSET): number {
  return Math.min(want, Math.max(8, restGap - 20));
}

export function paintedBoxOverflow(
  card: { left: number; top: number; right: number; bottom: number },
  box: { left: number; top: number; right: number; bottom: number },
  inset = PREVIEW_TILT_INSET,
): number {
  return Math.max(
    0,
    box.left + inset - card.left,
    card.right - (box.right - inset),
    box.top + inset - card.top,
    card.bottom - (box.bottom - inset),
  );
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
