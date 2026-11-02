import { useSyncExternalStore } from 'react';
import { getUnzoomedViewportWidth } from './viewport';

export const SPRITE_NATIVE = 96;

export function pixelPerfectCssPx(scale: number, dpr: number): number {
  const n = Math.max(1, Math.round(scale));
  return Math.round((n * SPRITE_NATIVE) / Math.max(dpr, 1));
}

export function isIntegerSpriteScale(devicePx: number, nativePx = SPRITE_NATIVE): boolean {
  if (!Number.isFinite(devicePx) || devicePx + 0.5 < nativePx) return false;
  const multiple = devicePx / nativePx;
  return Math.abs(multiple - Math.round(multiple)) < 0.06;
}

// platform: visualViewport resize and scroll fire on every pinch frame, and its width and scale update in separate ticks.
const vpListeners = new Set<() => void>();
let vpVersion = 0;

if (typeof window !== 'undefined') {
  const notify = () => { vpVersion++; vpListeners.forEach((fn) => fn()); };
  window.addEventListener('resize', notify);
  const watchDpr = () => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => { notify(); watchDpr(); }, { once: true });
  };
  watchDpr();
  // platform: Some Chromium zoom-out transitions fire no resize event, but a ResizeObserver on the document root sees them.
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(notify);
    ro.observe(document.documentElement);
  }
}

function subscribeFn(cb: () => void) {
  vpListeners.add(cb);
  return () => { vpListeners.delete(cb); };
}

export function fluidSpriteCssPx(
  viewportCssPx: number,
  mobileVw: number,
  desktopMin: number,
  desktopVw: number,
  desktopMax: number,
  divisor: number = 1,
): number {
  const effectiveWidth = viewportCssPx / divisor;
  const vw = effectiveWidth / 100;
  const isDesktop = effectiveWidth >= 1024;
  const cssPx = isDesktop
    ? Math.max(desktopMin, Math.min(desktopVw * vw, desktopMax))
    : mobileVw * vw;
  return Math.round(cssPx);
}

export function useFluidSpritePx(
  mobileVw: number,
  desktopMin: number,
  desktopVw: number,
  desktopMax: number,
  divisor: number = 1,
): number {
  const compute = (): number => {
    if (typeof window === 'undefined') return desktopMax;
    return fluidSpriteCssPx(
      getUnzoomedViewportWidth(),
      mobileVw,
      desktopMin,
      desktopVw,
      desktopMax,
      divisor,
    );
  };

  return useSyncExternalStore(
    subscribeFn,
    () => { void vpVersion; return compute(); },
    () => desktopMax,
  );
}

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

export function useLayoutViewportCssPx(): number {
  return useSyncExternalStore(
    subscribeFn,
    () => {
      void vpVersion;
      return typeof window === 'undefined' ? 1024 : getUnzoomedViewportWidth();
    },
    () => 1024,
  );
}

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

export function usePixelPerfectSprite(scale = 1): number {
  return pixelPerfectCssPx(scale, useDevicePixelRatio());
}

export function exportSurveySpriteScale(opts: {
  viewportWidth: number;
  dpr: number;
}): number {
  const dpr = Math.max(opts.dpr, 1);
  const room = Math.max(SPRITE_NATIVE, opts.viewportWidth - 48);
  const fits = (n: number) => pixelPerfectCssPx(n, dpr) <= room;
  if (opts.viewportWidth >= 1024) {
    if (pixelPerfectCssPx(1, dpr) >= SPRITE_NATIVE && fits(1)) return 1;
    if (fits(2)) return 2;
    return 1;
  }
  if (fits(2)) return 2;
  return 1;
}

export function useExportSurveySpriteScale(): number {
  return useSyncExternalStore(
    subscribeFn,
    () => {
      void vpVersion;
      if (typeof window === 'undefined') return 1;
      return exportSurveySpriteScale({
        viewportWidth: getUnzoomedViewportWidth(),
        dpr: window.devicePixelRatio || 1,
      });
    },
    () => 1,
  );
}
