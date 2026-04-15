import { useSyncExternalStore } from 'react';

const SPRITE_SRC_PX = 96;

/**
 * Baseline DPR captured at module load. Browser zoom raises DPR above this
 * baseline (e.g. 100% zoom on a 1x display is 1.0; zooming to 150% raises
 * it to 1.5). We use `devicePixelRatio / BASE_DPR` as a proxy for the
 * user's current browser-zoom factor — the only signal that reliably
 * distinguishes "user zoomed the browser" from "device just has a hi-DPI
 * screen." Users who load the page already zoomed get that level as their
 * baseline; further zooming scales relative to it, which is the sensible
 * UX since they already saw the page at their preferred size.
 */
const BASE_DPR =
  typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

/**
 * Shared viewport state — a single set of listeners for all hook consumers.
 * Recomputes on any viewport-shape change, notifying all subscribers.
 *
 * We listen to FOUR signals because no single one is reliable across
 * browser/OS/zoom-type combos:
 *   • window.resize — standard layout resize + desktop browser zoom (Ctrl+=)
 *   • visualViewport.resize — trackpad pinch zoom on macOS Chrome/Safari
 *     and iOS/Android pinch zoom. These DO NOT fire window.resize.
 *   • matchMedia(resolution) — DPR changes (moving window between monitors,
 *     some browser-zoom levels that snap to new DPR buckets).
 *   • ResizeObserver on documentElement — catch-all for any layout-shape
 *     change a browser doesn't dispatch one of the above events for
 *     (observed: some Chromium zoom-out transitions that leave sprites
 *     stuck at their zoomed-in size because no resize event fires).
 *
 * Any of these firing triggers a recompute; the useSyncExternalStore
 * comparison handles the common case where the computed value is
 * unchanged (no-op re-render).
 */
let vpListeners = new Set<() => void>();
let vpVersion = 0;

if (typeof window !== 'undefined') {
  const notify = () => { vpVersion++; vpListeners.forEach((fn) => fn()); };
  window.addEventListener('resize', notify);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', notify);
  }
  // Track DPR changes (e.g. dragging window between monitors, zoom bucket snaps)
  const watchDpr = () => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => { notify(); watchDpr(); }, { once: true });
  };
  watchDpr();
  // Catch-all: ResizeObserver fires on any layout-affecting change to the
  // document root, including zoom transitions that miss resize events.
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(notify);
    ro.observe(document.documentElement);
  }
}

function subscribeFn(cb: () => void) {
  vpListeners.add(cb);
  return () => { vpListeners.delete(cb); };
}

/**
 * Returns the optimal pixel-perfect sprite size (CSS px) for a container
 * whose size follows CSS clamp(desktopMin, desktopVw * vw, desktopMax) on
 * desktop and mobileVw * vw on mobile.
 *
 * The returned size is the largest integer multiple of (96 / devicePixelRatio)
 * that fits within the CSS container, ensuring every source pixel maps to a
 * uniform NxN block of device pixels — no sub-pixel aliasing.
 *
 * Browser zoom is explicitly compensated for: when the user zooms in, the
 * viewport's CSS-px width shrinks and devicePixelRatio grows proportionally
 * (their product = physical screen width is invariant). Naively feeding the
 * shrunken innerWidth into the vw/clamp calc makes sprites get SMALLER
 * relative to the rest of the (zoom-magnified) UI. We multiply innerWidth
 * by the zoom factor to reconstruct the pre-zoom viewport width, so the
 * CSS-px sprite size stays constant across zoom levels — and the browser's
 * zoom transform then magnifies the sprite in lockstep with everything else.
 *
 * When no clean multiple fits (container < one unit), falls back to the raw
 * CSS container size.
 */
export function usePixelPerfectSprite(
  mobileVw: number,
  desktopMin: number,
  desktopVw: number,
  desktopMax: number,
): number {
  const compute = (): number => {
    if (typeof window === 'undefined') return desktopMax;
    const dpr = window.devicePixelRatio || 1;
    // Zoom factor relative to page load. At baseline zoom this is 1.
    const zoomFactor = dpr / BASE_DPR;
    // Un-zoom the viewport width so responsive sizing is based on the
    // underlying layout viewport, not the zoom-shrunken one.
    const unzoomedInnerWidth = window.innerWidth * zoomFactor;
    const vw = unzoomedInnerWidth / 100;
    const isDesktop = unzoomedInnerWidth >= 1024;
    const cssPx = isDesktop
      ? Math.max(desktopMin, Math.min(desktopVw * vw, desktopMax))
      : mobileVw * vw;
    const unit = SPRITE_SRC_PX / dpr;
    const multiples = Math.floor(cssPx / unit);
    if (multiples < 1) return Math.round(cssPx);
    return Math.round(unit * multiples);
  };

  return useSyncExternalStore(
    subscribeFn,
    () => { void vpVersion; return compute(); },
    () => desktopMax,
  );
}
