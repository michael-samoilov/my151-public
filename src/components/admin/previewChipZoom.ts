import { createContext, useContext } from 'react';

export const PreviewChipZoom = createContext(1);

export const PreviewChipZoomReport = createContext<((id: string, fit: number | null) => void) | null>(null);

export function usePreviewChipZoom(): number {
  return useContext(PreviewChipZoom);
}

const MD = '(min-width: 1024px)';

export function applyPreviewZoom(
  host: HTMLElement,
  inner: HTMLElement,
  zoomRef: { current: number },
  setZoom: (n: number) => void,
) {
  if (window.matchMedia(MD).matches || getComputedStyle(host).display === 'contents') {
    inner.style.zoom = '1';
    if (zoomRef.current === 1) return;
    zoomRef.current = 1;
    setZoom(1);
    return;
  }
  inner.style.zoom = '1';
  const avail = host.clientWidth;
  const need = inner.scrollWidth;
  const next = need > 0 && avail > 0 ? Math.min(1, avail / need) : 1;
  inner.style.zoom = String(next);
  if (Math.abs(zoomRef.current - next) < 0.005) return;
  zoomRef.current = next;
  setZoom(next);
}

export const PREVIEW_CHIP_MD = MD;
