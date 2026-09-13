import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const MAX_TILT = 20;

/**
 * Live export preview with a pointer-driven tilt, like a card on a desk.
 * Tilt is measured against the image box, not the leftover viewport, so
 * the centre of the picture is rest and the edges hit MAX_TILT.
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
  const cardRef = useRef<HTMLImageElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const px = (clientX - r.left) / r.width - 0.5;
    const py = (clientY - r.top) / r.height - 0.5;
    setTilt({
      x: clamp(-py * MAX_TILT * 2, -MAX_TILT, MAX_TILT),
      y: clamp(px * MAX_TILT * 2, -MAX_TILT, MAX_TILT),
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (e.pointerType === 'mouse' || e.buttons > 0 || e.currentTarget.hasPointerCapture(e.pointerId)) {
        applyPointer(e.clientX, e.clientY);
      }
    },
    [applyPointer],
  );

  const resetTilt = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  return (
    <div
      className={cn('relative flex h-full w-full items-center justify-center', className)}
      style={{ perspective: '900px' }}
    >
      {src ? (
        <img
          ref={cardRef}
          src={src}
          alt={alt}
          className="block touch-none rounded-lg bg-white object-contain ring-1 ring-white/20 select-none"
          style={{
            maxHeight: '100%',
            maxWidth: '100%',
            width: 'auto',
            height: 'auto',
            transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(16px)`,
            transformOrigin: 'center center',
            boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
          }}
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={resetTilt}
          onPointerCancel={resetTilt}
          data-export-preview
          data-tilt-x={tilt.x.toFixed(1)}
          data-tilt-y={tilt.y.toFixed(1)}
        />
      ) : (
        <div
          className="flex h-48 w-64 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground md:h-64 md:w-80"
          aria-busy={busy}
          data-export-preview
        >
          {busy ? 'Rendering preview…' : 'Preview unavailable'}
        </div>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
