// platform: Desktop browser zoom shrinks innerWidth and raises devicePixelRatio by the same factor.

const BASE_DPR =
  typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

export function getUnzoomedViewportWidth(): number {
  if (typeof window === 'undefined') return 1024;
  const vv = window.visualViewport;
  // platform: During an iOS pinch, innerWidth follows the visual viewport, and visualViewport.width * scale drifts by fractions of a CSS px.
  const layoutWidth = vv ? Math.round(vv.width * vv.scale) : window.innerWidth;
  const dpr = window.devicePixelRatio || 1;
  const zoomFactor = dpr / BASE_DPR;
  return Math.round(layoutWidth * zoomFactor);
}
