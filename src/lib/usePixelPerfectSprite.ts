import { useSyncExternalStore } from 'react';
import { getUnzoomedViewportWidth } from './viewport';

const SPRITE_SRC_PX = 96;

/**
 * Shared viewport state — a single set of listeners for all hook consumers.
 * Recomputes on any viewport-shape change, notifying all subscribers.
 *
 * We listen to FOUR signals because no single one is reliable across
 * browser/OS/zoom-type combos:
 *   • window.resize — standard layout resize + desktop browser zoom (Ctrl+=)
 *   • visualViewport.resize + scroll — trackpad pinch zoom on macOS
 *     Chrome/Safari and iOS/Android pinch zoom. These DO NOT fire
 *     window.resize. On iOS the `scroll` event also accompanies scale
 *     changes.
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
    window.visualViewport.addEventListener('scroll', notify);
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
 * Both browser zoom (desktop Ctrl+=) and iOS pinch-zoom are compensated
 * for via `getUnzoomedViewportWidth` — see src/lib/viewport.ts for the
 * full rationale. In short: the CSS-px sprite size stays constant across
 * zoom levels, so the browser's zoom transform magnifies the sprite in
 * lockstep with the rest of the UI.
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
    const unzoomedInnerWidth = getUnzoomedViewportWidth();
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

/**
 * Returns true when the (unzoomed) viewport width is at least `minPx`.
 * Shares the same viewport-change subscription as usePixelPerfectSprite.
 * Used to gate larger (2×) sprite rendering on viewports wide enough to
 * absorb the extra sprite width without heavy inter-tile overlap.
 */
export function useViewportAtLeast(minPx: number): boolean {
  return useSyncExternalStore(
    subscribeFn,
    () => {
      void vpVersion;
      return (typeof window === 'undefined' ? 1024 : getUnzoomedViewportWidth()) >= minPx;
    },
    () => true,
  );
}
