/**
 * Sets document.documentElement.style.fontSize based on the *layout* viewport
 * width (not the visual viewport). This is the JS counterpart to the CSS
 * `font-size: clamp(16px, 13px + 0.7vw, 20px)` rule — but with iOS pinch-zoom
 * compensation.
 *
 * WHY JS AND NOT CSS:
 *   On iOS Safari/Chrome, `vw` is tied to the visual viewport, not the
 *   layout viewport (spec-violating but long-standing behavior). When the
 *   user pinch-zooms, the visual viewport shrinks → `vw` shrinks → any
 *   CSS `vw`-based sizing shrinks as the user zooms in. The result: sprites,
 *   badges, and chrome all get *smaller* during pinch-zoom instead of staying
 *   visually fixed while the whole page magnifies (which is what the user
 *   expects from pinch-zoom).
 *
 *   We compensate the same way `usePixelPerfectSprite` does: multiply
 *   innerWidth by `devicePixelRatio / BASE_DPR` (the zoom factor) to
 *   reconstruct the pre-zoom layout width, then clamp against that.
 *
 * LISTENS TO the same four viewport signals as usePixelPerfectSprite, for
 * the same reasons — see that file's comments for the full rationale.
 */

const BASE_DPR =
  typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

function computeFontSize(): number {
  if (typeof window === 'undefined') return 16;
  const dpr = window.devicePixelRatio || 1;
  const zoomFactor = dpr / BASE_DPR;
  const unzoomedWidth = window.innerWidth * zoomFactor;
  // clamp(16px, 13px + 0.7vw, 20px) equivalent — 13 + 0.7 * (width/100)
  const fluid = 13 + 0.7 * (unzoomedWidth / 100);
  return Math.max(16, Math.min(fluid, 20));
}

let rafHandle: number | null = null;

function apply() {
  if (rafHandle !== null) return;
  rafHandle = requestAnimationFrame(() => {
    rafHandle = null;
    document.documentElement.style.fontSize = `${computeFontSize()}px`;
  });
}

/**
 * Install listeners and set initial root font-size. Idempotent — safe to
 * call once at app bootstrap. Also safe no-op during SSR.
 */
export function installLayoutFontSize() {
  if (typeof window === 'undefined') return;
  apply();
  window.addEventListener('resize', apply);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', apply);
  }
  const watchDpr = () => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => { apply(); watchDpr(); }, { once: true });
  };
  watchDpr();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(apply);
    ro.observe(document.documentElement);
  }
}
