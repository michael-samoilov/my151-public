import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

function useFitZoom(
  hostRef: RefObject<HTMLDivElement | null>,
  innerRef: RefObject<HTMLDivElement | null>,
  children: ReactNode,
) {
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;
    const measure = () => {
      if (getComputedStyle(host).display === 'contents') {
        inner.style.zoom = '1';
        setZoom((z) => (z === 1 ? z : 1));
        return;
      }
      inner.style.zoom = '1';
      const avail = host.clientWidth;
      const need = inner.scrollWidth;
      const next = need > 0 && avail > 0 ? Math.min(1, avail / need) : 1;
      inner.style.zoom = String(next);
      setZoom((z) => (Math.abs(z - next) < 0.005 ? z : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [children, hostRef, innerRef]);

  return zoom;
}

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
  const zoom = useFitZoom(hostRef, innerRef, children);

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

/** Shrink a block (a card list, a subgrid) until it fits the host. */
export function FitScale({ children, className }: { children: ReactNode; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const zoom = useFitZoom(hostRef, innerRef, children);

  return (
    <div ref={hostRef} className={cn('min-w-0 overflow-x-clip', className)}>
      <div ref={innerRef} className="w-max min-w-full" style={{ zoom }}>
        {children}
      </div>
    </div>
  );
}
