import { useSyncExternalStore } from 'react';
import { getUnzoomedViewportWidth } from './viewport';

/** Native sprite resolution (px). Pair sprites snap to 1× or 2× of this. */
export const SPRITE_NATIVE = 96;

/**
 * CSS px that paints `scale` copies of the native sprite on this device.
 *
 * `image-rendering: pixelated` stays crisp when the CSS size is `n * 96 / dpr`
 * (integer device pixels). A pane fraction such as `min(42cqw, 32cqh)` is not
 * an integer scale and is the source of pair-sprite pixelation.
 * `scale` is an integer ≥ 1 (1×, 2×, 3×…). Values below 1 snap up to 1.
 */
export function pixelPerfectCssPx(scale: number, dpr: number): number {
  const n = Math.max(1, Math.round(scale));
  return Math.round((n * SPRITE_NATIVE) / Math.max(dpr, 1));
}

/** True when device pixels are an integer multiple of the native sprite, ≥ 1×. */
export function isIntegerSpriteScale(devicePx: number, nativePx = SPRITE_NATIVE): boolean {
  if (!Number.isFinite(devicePx) || devicePx + 0.5 < nativePx) return false;
  const multiple = devicePx / nativePx;
  return Math.abs(multiple - Math.round(multiple)) < 0.06;
}

/**
 * Shared viewport state — a single set of listeners for all hook consumers.
 * Recomputes on any *layout*-viewport change, notifying all subscribers.
 *
 * We deliberately track ONLY the layout viewport and NOT the visual
 * viewport, so a pinch-zoom is a pure browser magnification with zero JS
 * recompute (see the note on visualViewport below). The signals:
 *   • window.resize — standard layout resize + desktop browser zoom (Ctrl+=)
 *     + orientation change. Fires when the layout viewport actually changes.
 *   • matchMedia(resolution) — DPR changes (moving window between monitors,
 *     some browser-zoom levels that snap to new DPR buckets).
 *   • ResizeObserver on documentElement — catch-all for any layout-shape
 *     change a browser doesn't dispatch one of the above events for
 *     (observed: some Chromium zoom-out transitions that leave sprites
 *     stuck at their zoomed-in size because no resize event fires). The
 *     document root is the LAYOUT viewport, so this does NOT fire during a
 *     pinch (the layout viewport is invariant under pinch-zoom).
 *
 * Why NOT visualViewport.resize/scroll: those fire on every frame of a
 * pinch-zoom gesture, and vv.width / vv.scale update in separate ticks —
 * so mid-gesture `vv.width * vv.scale` is transiently wrong (e.g. width
 * already halved but scale still 1), driving the font-size and every sprite
 * to a garbage value for a frame and back. That is the "layout reflows while
 * I pinch" bug. Now that root font-size is JS-driven and no sizing uses CSS
 * `vw` (both were the original reasons for the visualViewport listeners),
 * freezing all JS sizes during a pinch is exactly right: the browser
 * magnifies the frozen layout uniformly, text and sprites grow together,
 * and nothing reflows.
 *
 * Any signal firing triggers a recompute; the useSyncExternalStore
 * comparison handles the common case where the computed value is
 * unchanged (no-op re-render).
 */
const vpListeners = new Set<() => void>();
let vpVersion = 0;

if (typeof window !== 'undefined') {
  const notify = () => { vpVersion++; vpListeners.forEach((fn) => fn()); };
  window.addEventListener('resize', notify);
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

/** Device pixel ratio, on the same viewport subscription as the sprite hooks. */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(
    subscribeFn,
    () => {
      void vpVersion;
      return typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    },
    () => 1,
  );
}

/**
 * CSS px for an integer sprite scale on this device. Default 1× (almost always
 * what a single portrait sprite wants). Never fractional, never below native.
 */
export function usePixelPerfectSprite(scale = 1): number {
  return pixelPerfectCssPx(scale, useDevicePixelRatio());
}
