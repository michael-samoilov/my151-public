import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  applyPreviewZoom,
  PREVIEW_CHIP_MD,
  PreviewChipZoom,
  usePreviewChipZoom,
} from '@/components/admin/previewChipZoom';

export function PreviewChipZoomProvider({ zoom, children }: { zoom: number; children: ReactNode }) {
  return <PreviewChipZoom.Provider value={zoom}>{children}</PreviewChipZoom.Provider>;
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
    const measure = () => applyPreviewZoom(host, inner, zoomRef, setLocalZoom);
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
