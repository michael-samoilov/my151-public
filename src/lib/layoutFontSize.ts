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
 * Listens to the same layout-viewport signals as useFluidSpritePx, and
 * deliberately NOT to visualViewport — for the same reasons. See that
 * file's comments: visualViewport events fire every frame of a pinch and
 * would make the root font-size (hence every rem utility) reflow during
 * the gesture. Freezing it lets the browser magnify uniformly instead.
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
 * The root font-size this module last applied, in px.
 *
 * Read this instead of `getComputedStyle(document.documentElement)` when a
 * component needs to convert rem to px during render — the computed-style
 * read forces a style recalculation on the interaction that triggered the
 * render. Falls back to a computed read only before the first `apply()`.
 */
export function getAppliedRootFontSizePx(): number {
  if (lastFontSize) return parseFloat(lastFontSize) || 16;
  if (typeof document === 'undefined') return 16;
  try {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  } catch {
    return 16;
  }
}

/**
 * Install listeners and set initial root font-size. Idempotent — safe to
 * call once at app bootstrap. Also safe no-op during SSR.
 */
export function installLayoutFontSize() {
  if (typeof window === 'undefined') return;
  apply();
  window.addEventListener('resize', apply);
  // NB: intentionally no visualViewport listeners — those fire every frame
  // of a pinch and would reflow the root font-size mid-gesture. The layout
  // viewport (resize + ResizeObserver below) is invariant under pinch, so
  // the font-size stays frozen and the browser magnifies it uniformly.
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
