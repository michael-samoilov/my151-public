import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import './ExportPreview3D.css';

const MAX_TILT = 20;
const IDLE_TILT = 1.55;
const IDLE_MS_X = 5400;
const IDLE_MS_Y = 7800;
const RELEASE_MS = 420;
const TAP_MS = 320;
const TAP_PX = 10;
/** Shine stays off inside this many degrees of straight-on. */
const SHINE_DEAD_DEG = 3.5;

/**
 * Live export preview with a pointer-driven tilt, like a foil card on a desk.
 *
 * Tilt lives on this wrapper, not on the image, so a new blob URL does not
 * reset the path. A small idle orbit runs with no input so the card is
 * obviously tiltable. A tap parks it straight-on; a second tap resumes.
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
  const pausedRef = useRef(false);
  const pointerTiltRef = useRef({ x: 0, y: 0 });
  const lastTiltRef = useRef({ x: 0, y: 0 });
  const releaseRef = useRef<{ from: { x: number; y: number }; to: { x: number; y: number }; t0: number } | null>(null);
  const reducedMotionRef = useRef(false);
  const downRef = useRef<{ t: number; x: number; y: number; dragged: boolean } | null>(null);
  const hoverArmedRef = useRef(true);

  const paint = useCallback((x: number, y: number) => {
    const el = cardRef.current;
    if (!el) return;
    lastTiltRef.current = { x, y };
    el.style.transform = `rotateX(${x}deg) rotateY(${y}deg) translateZ(16px)`;
    const px = 50 + (y / MAX_TILT) * 50;
    const py = 50 - (x / MAX_TILT) * 50;
    el.style.setProperty('--pointer-x', `${px}%`);
    el.style.setProperty('--pointer-y', `${py}%`);
    const mag = Math.hypot(x, y);
    const foil =
      mag <= SHINE_DEAD_DEG ? 0 : Math.min(1, (mag - SHINE_DEAD_DEG) / (MAX_TILT - SHINE_DEAD_DEG));
    el.style.setProperty('--foil-opacity', foil.toFixed(3));
    el.dataset.tiltX = x.toFixed(1);
    el.dataset.tiltY = y.toFixed(1);
    el.dataset.paused = pausedRef.current ? '1' : '0';
  }, []);

  const idleAt = useCallback((now: number) => {
    if (reducedMotionRef.current) return { x: 0, y: 0 };
    if (originRef.current === null) originRef.current = now;
    const t = now - originRef.current;
    return {
      x: Math.sin((t / IDLE_MS_X) * Math.PI * 2) * IDLE_TILT,
      y: Math.sin((t / IDLE_MS_Y) * Math.PI * 2) * IDLE_TILT,
    };
  }, []);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const tick = (now: number) => {
      if (interactingRef.current) {
        paint(pointerTiltRef.current.x, pointerTiltRef.current.y);
      } else if (pausedRef.current) {
        const release = releaseRef.current;
        if (release) {
          const u = Math.min(1, (now - release.t0) / RELEASE_MS);
          const ease = 1 - (1 - u) * (1 - u);
          paint(
            release.from.x + (release.to.x - release.from.x) * ease,
            release.from.y + (release.to.y - release.from.y) * ease,
          );
          if (u >= 1) releaseRef.current = null;
        } else {
          paint(0, 0);
        }
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

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    downRef.current = { t: performance.now(), x: e.clientX, y: e.clientY, dragged: false };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pausedRef.current) return;
      const down = downRef.current;
      if (down && !down.dragged) {
        const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        if (dist > TAP_PX) down.dragged = true;
      }
      const dragging = Boolean(down?.dragged || (down && e.buttons > 0 && e.pointerType !== 'mouse'));
      if (dragging) {
        applyPointer(e.clientX, e.clientY);
        return;
      }
      if (!down && e.pointerType === 'mouse' && hoverArmedRef.current) applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const down = downRef.current;
    downRef.current = null;
    const tap =
      !!down &&
      !down.dragged &&
      performance.now() - down.t < TAP_MS &&
      Math.hypot(e.clientX - down.x, e.clientY - down.y) <= TAP_PX;

    if (tap) {
      interactingRef.current = false;
      pausedRef.current = !pausedRef.current;
      hoverArmedRef.current = false;
      if (pausedRef.current) {
        releaseRef.current = { from: { ...lastTiltRef.current }, to: { x: 0, y: 0 }, t0: performance.now() };
      } else {
        originRef.current = performance.now();
        releaseRef.current = null;
      }
      return;
    }

    if (!interactingRef.current) return;
    interactingRef.current = false;
    if (pausedRef.current) {
      releaseRef.current = { from: { ...pointerTiltRef.current }, to: { x: 0, y: 0 }, t0: performance.now() };
      return;
    }
    releaseRef.current = {
      from: { ...pointerTiltRef.current },
      to: { x: 0, y: 0 },
      t0: performance.now(),
    };
  }, []);

  const onPointerLeave = useCallback(() => {
    downRef.current = null;
    hoverArmedRef.current = true;
    if (pausedRef.current) {
      interactingRef.current = false;
      releaseRef.current = { from: { ...lastTiltRef.current }, to: { x: 0, y: 0 }, t0: performance.now() };
      return;
    }
    if (!interactingRef.current) return;
    interactingRef.current = false;
    releaseRef.current = {
      from: { ...pointerTiltRef.current },
      to: { x: 0, y: 0 },
      t0: performance.now(),
    };
  }, []);

  return (
    <div
      className={cn('relative flex h-full w-full items-center justify-center', className)}
      style={{ perspective: '900px' }}
    >
      {src ? (
        <div
          ref={cardRef}
          className="export-foil max-h-full max-w-full min-h-0 min-w-0 cursor-pointer touch-none rounded-lg bg-white ring-1 ring-white/20 select-none"
          style={{
            transformOrigin: 'center center',
            boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
            maxHeight: '100%',
            maxWidth: '100%',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerLeave}
          onPointerLeave={onPointerLeave}
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
