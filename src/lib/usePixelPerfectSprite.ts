import { useSyncExternalStore } from 'react';

const SPRITE_SRC_PX = 96;

/**
 * Shared viewport state — a single pair of listeners for all hook consumers.
 * Recomputes on resize and DPR change, notifying all subscribers.
 */
let vpListeners = new Set<() => void>();
let vpVersion = 0;

if (typeof window !== 'undefined') {
  const notify = () => { vpVersion++; vpListeners.forEach((fn) => fn()); };
  window.addEventListener('resize', notify);
  // Track DPR changes (e.g. dragging window between monitors)
  const watchDpr = () => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => { notify(); watchDpr(); }, { once: true });
  };
  watchDpr();
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
    const vw = window.innerWidth / 100;
    const isDesktop = window.innerWidth >= 1024;
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
