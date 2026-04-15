/**
 * Returns the layout viewport width in CSS px, compensating for both:
 *
 * 1. **Desktop browser zoom** (Ctrl+= / Ctrl+-): shrinks `innerWidth` and
 *    raises `devicePixelRatio` proportionally. We undo this by multiplying
 *    `innerWidth` by `dpr / BASE_DPR` to reconstruct the pre-zoom width.
 *
 * 2. **iOS pinch-zoom**: `window.innerWidth` on iOS Chrome/Safari reflects
 *    the VISUAL viewport (it shrinks during pinch), while DPR stays constant.
 *    The DPR trick above gives a `zoomFactor` of 1 and leaves the shrunken
 *    width — sprite / font-size end up smaller in CSS px, which the browser
 *    then magnifies by the pinch factor to exactly the original physical
 *    size. The user experiences "zooming in makes sprites not grow" —
 *    in effect they shrink relative to the rest of the zoomed UI.
 *
 *    Fix: `visualViewport.width * visualViewport.scale` reconstructs the
 *    LAYOUT viewport width from the visual-viewport dimensions. This is
 *    invariant under pinch-zoom.
 *
 * Combining both compensations handles desktop+mobile zoom modes in a
 * single formula.
 *
 * BASE_DPR is captured at module load so that users who load the page
 * already zoomed get that as their baseline; further zooming scales
 * relative to it.
 */

export const BASE_DPR =
  typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

export function getUnzoomedViewportWidth(): number {
  if (typeof window === 'undefined') return 1024;
  const vv = window.visualViewport;
  // Prefer visualViewport — reconstructing layout viewport from it is
  // correct on both iOS pinch and desktop pinch. Fallback to innerWidth
  // for older browsers without the API.
  const layoutWidth = vv ? vv.width * vv.scale : window.innerWidth;
  const dpr = window.devicePixelRatio || 1;
  const zoomFactor = dpr / BASE_DPR;
  return layoutWidth * zoomFactor;
}
