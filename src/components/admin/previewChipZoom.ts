import { createContext, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export const PreviewChipZoom = createContext(1);

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

export function useHostZoom(hostRef: RefObject<HTMLElement | null>, innerRef: RefObject<HTMLElement | null>): number {
  const zoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;
    const measure = () => applyPreviewZoom(host, inner, zoomRef, setZoom);
    measure();
    void document.fonts.ready.then(measure);
    const later = window.setTimeout(measure, 250);
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    const mq = window.matchMedia(MD);
    mq.addEventListener('change', measure);
    return () => {
      window.clearTimeout(later);
      ro.disconnect();
      mq.removeEventListener('change', measure);
    };
  }, [hostRef, innerRef]);

  return zoom;
}

export const PREVIEW_CHIP_MD = MD;
