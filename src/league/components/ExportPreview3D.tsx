import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import './ExportPreview3D.css';

const MAX_TILT = 20;
const IDLE_TILT = 1.55;
const IDLE_MS_X = 5400;
const IDLE_MS_Y = 7800;
const RELEASE_MS = 420;

/**
 * Live export preview with a pointer-driven tilt, like a foil card on a desk.
 *
 * Tilt lives on this wrapper, not on the image, so a new blob URL does not
 * reset the path. A small idle orbit runs with no input so the card is
 * obviously tiltable; pointer motion takes over, then idle continues from
 * the same phase.
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
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const originRef = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const pointerTiltRef = useRef({ x: 0, y: 0 });
  const releaseRef = useRef<{ from: { x: number; y: number }; t0: number } | null>(null);
  const reducedMotionRef = useRef(false);

  const paint = useCallback((x: number, y: number) => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = `rotateX(${x}deg) rotateY(${y}deg) translateZ(16px)`;
    const px = 50 + (y / MAX_TILT) * 50;
    const py = 50 - (x / MAX_TILT) * 50;
    el.style.setProperty('--pointer-x', `${px}%`);
    el.style.setProperty('--pointer-y', `${py}%`);
    el.dataset.tiltX = x.toFixed(1);
    el.dataset.tiltY = y.toFixed(1);
  }, []);

  const idleAt = useCallback((now: number) => {
    if (reducedMotionRef.current) return { x: 0, y: 0 };
    if (originRef.current === null) originRef.current = now;
    const t = now - originRef.current;
    return {
      x: Math.sin((t / IDLE_MS_X) * Math.PI * 2) * IDLE_TILT,
      y: Math.cos((t / IDLE_MS_Y) * Math.PI * 2) * IDLE_TILT,
    };
  }, []);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const tick = (now: number) => {
      if (interactingRef.current) {
        paint(pointerTiltRef.current.x, pointerTiltRef.current.y);
      } else {
        const idle = idleAt(now);
        const release = releaseRef.current;
        if (release) {
          const u = Math.min(1, (now - release.t0) / RELEASE_MS);
          const ease = 1 - (1 - u) * (1 - u);
          paint(
            release.from.x + (idle.x - release.from.x) * ease,
            release.from.y + (idle.y - release.from.y) * ease,
          );
          if (u >= 1) releaseRef.current = null;
        } else {
          paint(idle.x, idle.y);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idleAt, paint]);

  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const el = imgRef.current ?? cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const px = (clientX - r.left) / r.width - 0.5;
    const py = (clientY - r.top) / r.height - 0.5;
    pointerTiltRef.current = {
      x: clamp(-py * MAX_TILT * 2, -MAX_TILT, MAX_TILT),
      y: clamp(px * MAX_TILT * 2, -MAX_TILT, MAX_TILT),
    };
    interactingRef.current = true;
    releaseRef.current = null;
    paint(pointerTiltRef.current.x, pointerTiltRef.current.y);
  }, [paint]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' || e.buttons > 0 || e.currentTarget.hasPointerCapture(e.pointerId)) {
        applyPointer(e.clientX, e.clientY);
      }
    },
    [applyPointer],
  );

  const onPointerUp = useCallback(() => {
    if (!interactingRef.current) return;
    interactingRef.current = false;
    releaseRef.current = { from: { ...pointerTiltRef.current }, t0: performance.now() };
  }, []);

  return (
    <div
      className={cn('relative flex h-full w-full items-center justify-center', className)}
      style={{ perspective: '900px' }}
    >
      {src ? (
        <div
          ref={cardRef}
          className="export-foil max-h-full max-w-full min-h-0 min-w-0 touch-none rounded-lg bg-white ring-1 ring-white/20 select-none"
          style={{
            transformOrigin: 'center center',
            boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
            maxHeight: '100%',
            maxWidth: '100%',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          data-export-preview
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className="pointer-events-none block h-auto w-auto rounded-lg object-contain"
            style={{ maxHeight: '100%', maxWidth: '100%' }}
            draggable={false}
          />
          <div className="export-foil-glare" aria-hidden />
          <div className="export-foil-shine" aria-hidden />
        </div>
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
