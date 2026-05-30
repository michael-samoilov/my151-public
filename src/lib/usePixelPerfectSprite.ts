import { useSyncExternalStore } from 'react';
import { getUnzoomedViewportWidth } from './viewport';

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
 * Returns a fluid sprite size (CSS px) for a container whose size follows
 * CSS clamp(desktopMin, desktopVw * vw, desktopMax) on desktop and
 * mobileVw * vw on mobile. The value interpolates continuously with the
 * viewport width — resizing grows/shrinks the sprite smoothly rather than
 * jumping between discrete sizes.
 *
 * (Earlier this snapped to integer multiples of 96 / devicePixelRatio for
 * pixel-perfect rendering. That's pointless once sprites render at a
 * non-integer scale like 1.95×, and it produced visible size "steps" while
 * resizing — every tile jumped at once because the chrome is sized off this
 * value. Continuous interpolation trades a touch of pixel-art crispness for
 * smooth scaling; `image-rendering: pixelated` keeps edges hard.)
 *
 * Being independent of devicePixelRatio also means a given CSS viewport
 * width renders at the same size on every device — a desktop window shrunk
 * below the md: breakpoint matches what a phone shows at that width.
 *
 * Both browser zoom (desktop Ctrl+=) and iOS pinch-zoom are compensated
 * for via `getUnzoomedViewportWidth` — see src/lib/viewport.ts for the
 * full rationale. In short: the CSS-px sprite size stays constant across
 * zoom levels, so the browser's zoom transform magnifies the sprite in
 * lockstep with the rest of the UI.
 *
 * `divisor` (default 1) shrinks the effective viewport — pass 2 when the
 * tile lives inside a half-pane (desktop side-panel layout) so the
 * formula sizes for the pane width rather than the full window.
 */
export function useFluidSpritePx(
  mobileVw: number,
  desktopMin: number,
  desktopVw: number,
  desktopMax: number,
  divisor: number = 1,
): number {
  const compute = (): number => {
    if (typeof window === 'undefined') return desktopMax;
    const effectiveWidth = getUnzoomedViewportWidth() / divisor;
    const vw = effectiveWidth / 100;
    const isDesktop = effectiveWidth >= 1024;
    const cssPx = isDesktop
      ? Math.max(desktopMin, Math.min(desktopVw * vw, desktopMax))
      : mobileVw * vw;
    return Math.round(cssPx);
  };

  return useSyncExternalStore(
    subscribeFn,
    () => { void vpVersion; return compute(); },
    () => desktopMax,
  );
}

/**
 * Returns true when the (unzoomed) viewport width is at least `minPx`.
 * Shares the same viewport-change subscription as useFluidSpritePx.
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
