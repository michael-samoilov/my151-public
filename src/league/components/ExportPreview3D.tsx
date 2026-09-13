import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const MAX_TILT = 14;

/**
 * Live export preview with a gentle pointer-driven tilt, like a card on a desk.
 */
export function ExportPreview3D({
  src,
  alt,
  busy,
  className,
}: {
  src: string | null;
  alt: string;
  busy?: boolean;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * MAX_TILT, y: px * MAX_TILT });
  }, []);

  const resetTilt = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  return (
    <div
      ref={rootRef}
      className={cn('relative max-h-full max-w-full touch-none', className)}
      style={{ perspective: '1200px' }}
      onPointerMove={onPointerMove}
      onPointerLeave={resetTilt}
      onPointerUp={resetTilt}
      data-export-preview
    >
      <div
        className="transition-transform duration-150 ease-out will-change-transform"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          className="overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-white/20"
          style={{ boxShadow: '0 24px 48px rgba(0,0,0,0.35)' }}
        >
          {src ? (
            <img
              src={src}
              alt={alt}
              className="block max-h-[min(52vh,28rem)] w-auto max-w-[min(92vw,26rem)] object-contain md:max-h-[min(70vh,32rem)] md:max-w-[min(42vw,28rem)]"
              draggable={false}
            />
          ) : (
            <div
              className="flex h-48 w-64 items-center justify-center bg-muted text-sm text-muted-foreground md:h-64 md:w-80"
              aria-busy={busy}
            >
              {busy ? 'Rendering preview…' : 'Preview unavailable'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
