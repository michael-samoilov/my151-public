import { useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  applyPreviewZoom,
  PREVIEW_CHIP_MD,
  PreviewChipZoom,
  PreviewChipZoomReport,
  usePreviewChipZoom,
} from '@/components/admin/previewChipZoom';

export function PreviewChipZoomProvider({ zoom, children }: { zoom: number; children: ReactNode }) {
  return <PreviewChipZoom.Provider value={zoom}>{children}</PreviewChipZoom.Provider>;
}

export function FitNowrap({
  children,
  className,
  innerClassName,
  contentsOnMd,
  lockZoom,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  contentsOnMd?: boolean;
  lockZoom?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const [localZoom, setLocalZoom] = useState(1);
  const shared = usePreviewChipZoom();
  const sharedRef = useRef(shared);
  const report = useContext(PreviewChipZoomReport);
  const id = useId();

  useLayoutEffect(() => {
    sharedRef.current = shared;
  }, [shared]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;
    const measure = () => {
      applyPreviewZoom(host, inner, zoomRef, setLocalZoom);
      if (!lockZoom) return;
      report?.(id, zoomRef.current);
      inner.style.zoom = String(sharedRef.current);
    };
    measure();
    void document.fonts.ready.then(measure);
    const later = window.setTimeout(measure, 250);
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    const mq = window.matchMedia(PREVIEW_CHIP_MD);
    mq.addEventListener('change', measure);
    return () => {
      window.clearTimeout(later);
      ro.disconnect();
      mq.removeEventListener('change', measure);
      if (lockZoom) report?.(id, null);
    };
  }, [children, lockZoom, report, id]);

  const zoom = lockZoom ? shared : localZoom;

  return (
    <div ref={hostRef} className={cn('min-w-0 overflow-x-clip', contentsOnMd && 'md:contents', className)}>
      <div
        ref={innerRef}
        className={cn('flex w-max flex-nowrap items-center gap-1', innerClassName, contentsOnMd && 'md:contents')}
        style={{ zoom }}
      >
        {children}
      </div>
    </div>
  );
}
