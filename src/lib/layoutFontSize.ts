import { getUnzoomedViewportWidth } from './viewport';

/**
 * Sets document.documentElement.style.fontSize based on the *layout* viewport
 * width (not the visual viewport). JS counterpart to the CSS
 * `font-size: clamp(16px, 13px + 0.7vw, 20px)` rule, with zoom compensation.
 *
 * Why JS and not CSS: `vw` is tied to the visual viewport on iOS, so any
 * CSS clamp shrinks with pinch-zoom. `getUnzoomedViewportWidth` in
 * ./viewport.ts reconstructs the layout viewport invariantly under both
 * iOS pinch and desktop zoom.
 *
 * Listens to the same four viewport signals as useFluidSpritePx,
 * for the same reasons — see that file's comments.
 */

function computeFontSize(): number {
  const width = getUnzoomedViewportWidth();
  // clamp(16px, 13px + 0.7vw, 20px) equivalent — 13 + 0.7 * (width/100)
  const fluid = 13 + 0.7 * (width / 100);
  return Math.max(16, Math.min(fluid, 20));
}

let rafHandle: number | null = null;
let lastFontSize = '';

function apply() {
  if (rafHandle !== null) return;
  rafHandle = requestAnimationFrame(() => {
    rafHandle = null;
    const next = `${computeFontSize()}px`;
    if (next !== lastFontSize) {
      lastFontSize = next;
      document.documentElement.style.fontSize = next;
    }
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
    // Pinch-zoom fires 'resize' on visualViewport in most browsers, but
    // 'scroll' can also correspond to a scale change on iOS. Listening to
    // both is defensive and idempotent (the rAF dedupes).
    window.visualViewport.addEventListener('scroll', apply);
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
