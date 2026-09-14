import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

const PreviewChipZoom = createContext(1);

export function PreviewChipZoomProvider({ zoom, children }: { zoom: number; children: ReactNode }) {
  return <PreviewChipZoom.Provider value={zoom}>{children}</PreviewChipZoom.Provider>;
}

export function usePreviewChipZoom(): number {
  return useContext(PreviewChipZoom);
}

const MD = '(min-width: 1024px)';

function applyZoom(
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
    const measure = () => applyZoom(host, inner, zoomRef, setZoom);
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

/** Shrink a nowrap row until it fits the host. Zoom, not wrap.
 *  `contentsOnMd` lets children join a parent subgrid on desktop.
 *  `lockZoom` uses the list-wide preview chip zoom instead of measuring this row. */
export function FitNowrap({
  children,
  className,
  contentsOnMd,
  lockZoom,
}: {
  children: ReactNode;
  className?: string;
  contentsOnMd?: boolean;
  lockZoom?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const [localZoom, setLocalZoom] = useState(1);
  const shared = usePreviewChipZoom();

  useLayoutEffect(() => {
    if (lockZoom) return;
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;
    const measure = () => applyZoom(host, inner, zoomRef, setLocalZoom);
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
  }, [children, lockZoom]);

  const zoom = lockZoom ? shared : localZoom;

  return (
    <div ref={hostRef} className={cn('min-w-0 overflow-x-clip', contentsOnMd && 'md:contents', className)}>
      <div
        ref={innerRef}
        className={cn('flex w-max flex-nowrap items-center gap-1', contentsOnMd && 'md:contents')}
        style={{ zoom }}
      >
        {children}
      </div>
    </div>
  );
}
