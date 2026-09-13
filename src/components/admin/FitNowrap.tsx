import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Shrink a nowrap row until it fits the host. Zoom, not wrap.
 *  `contentsOnMd` lets children join a parent subgrid on desktop. */
export function FitNowrap({
  children,
  className,
  contentsOnMd,
}: {
  children: ReactNode;
  className?: string;
  contentsOnMd?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;
    const measure = () => {
      if (getComputedStyle(host).display === 'contents') {
        if (zoomRef.current === 1) return;
        zoomRef.current = 1;
        inner.style.zoom = '1';
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
    };
    measure();
    void document.fonts.ready.then(measure);
    const later = window.setTimeout(measure, 250);
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => {
      window.clearTimeout(later);
      ro.disconnect();
    };
  }, [children]);

  return (
    <div ref={hostRef} className={cn('min-w-0 overflow-x-clip', contentsOnMd && 'md:contents', className)}>
      <div
        ref={innerRef}
        className={cn('flex w-max flex-nowrap items-center gap-1.5', contentsOnMd && 'md:contents')}
        style={{ zoom }}
      >
        {children}
      </div>
    </div>
  );
}
