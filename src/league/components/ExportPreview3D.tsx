import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  DEFAULT_FOIL_RECIPE,
  activeFoilLayerIds,
  foilLayerClassName,
  foilMapsNeeded,
  foilRecipeCssVars,
  type FoilRecipe,
} from '../export/foilRecipe';
import { foilMaskCss, foilMaskUrlsFromImage } from '../export/foilMaps';
import './ExportPreview3D.css';

const RELEASE_MS = 420;
const TAP_MS = 320;
const TAP_PX = 10;

/**
 * Live export preview with a pointer-driven tilt, like a foil card on a desk.
 *
 * Tilt lives on this wrapper, not on the image, so a new blob URL does not
 * reset the path. A slow idle orbit runs with no input. A tap parks the card
 * straight-on and stops that orbit; pointer and hover still tilt it. A second
 * tap starts the orbit again. Lighting follows a FoilRecipe; the overlay uses
 * the default, and the workshop page passes a live one.
 */
export function ExportPreview3D({
  src,
  alt,
  busy,
  className,
  recipe = DEFAULT_FOIL_RECIPE,
}: {
  src: string | null;
  alt: string;
  busy?: boolean;
  className?: string;
  recipe?: FoilRecipe;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const originRef = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const pausedRef = useRef(false);
  const pointerTiltRef = useRef({ x: 0, y: 0 });
  const lastTiltRef = useRef({ x: 0, y: 0 });
  const releaseRef = useRef<{ from: { x: number; y: number }; to: { x: number; y: number }; t0: number } | null>(
    null,
  );
  const reducedMotionRef = useRef(false);
  const downRef = useRef<{ t: number; x: number; y: number; dragged: boolean } | null>(null);
  const hoverArmedRef = useRef(true);
  const recipeRef = useRef(recipe);
  const layerIds = activeFoilLayerIds(recipe);
  const { sat: needSat, edge: needEdge, gloss: needGloss } = foilMapsNeeded(recipe);

  const applyRecipeVars = useCallback((el: HTMLDivElement) => {
    const vars = foilRecipeCssVars(recipeRef.current);
    for (const [key, value] of Object.entries(vars)) {
      el.style.setProperty(key, value);
    }
  }, []);

  const paint = useCallback(
    (x: number, y: number) => {
      const el = cardRef.current;
      if (!el) return;
      const recipeNow = recipeRef.current;
      lastTiltRef.current = { x, y };
      el.style.transform = `rotateX(${x}deg) rotateY(${y}deg) translateZ(16px)`;
      const px = 50 + (y / recipeNow.maxTilt) * 50;
      const py = 50 - (x / recipeNow.maxTilt) * 50;
      const fromCenter = Math.min(1, Math.hypot(px - 50, py - 50) / 50);
      el.style.setProperty('--pointer-x', `${px}%`);
      el.style.setProperty('--pointer-y', `${py}%`);
      el.style.setProperty('--pointer-from-center', fromCenter.toFixed(3));
      el.style.setProperty('--pointer-from-top', (py / 100).toFixed(3));
      el.style.setProperty('--pointer-from-left', (px / 100).toFixed(3));
      const mag = Math.hypot(x, y);
      const span = Math.max(0.001, recipeNow.maxTilt - recipeNow.deadDeg);
      const foil = mag <= recipeNow.deadDeg ? 0 : Math.min(1, (mag - recipeNow.deadDeg) / span);
      el.style.setProperty('--foil-opacity', foil.toFixed(3));
      applyRecipeVars(el);
      el.dataset.tiltX = x.toFixed(1);
      el.dataset.tiltY = y.toFixed(1);
      el.dataset.foilOpacity = foil.toFixed(3);
      el.dataset.paused = pausedRef.current ? '1' : '0';
    },
    [applyRecipeVars],
  );

  const idleAt = useCallback((now: number) => {
    if (reducedMotionRef.current) return { x: 0, y: 0 };
    if (originRef.current === null) originRef.current = now;
    const t = now - originRef.current;
    const recipeNow = recipeRef.current;
    return {
      x: Math.sin((t / recipeNow.idleMsX) * Math.PI * 2) * recipeNow.idleTilt,
      y: Math.sin((t / recipeNow.idleMsY) * Math.PI * 2) * recipeNow.idleTilt,
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

  useEffect(() => {
    recipeRef.current = recipe;
    const el = cardRef.current;
    if (!el) return;
    applyRecipeVars(el);
  }, [applyRecipeVars, recipe]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !src) return;
    el.style.setProperty('--foil-sat-mask', 'none');
    el.style.setProperty('--foil-edge-mask', 'none');
    el.style.setProperty('--foil-gloss-mask', 'none');
    if (!needSat && !needEdge && !needGloss) {
      el.dataset.foilMaps = '1';
      return;
    }
    el.dataset.foilMaps = '0';
    let cancelled = false;
    void foilMaskUrlsFromImage(src, { sat: needSat, edge: needEdge, gloss: needGloss })
      .then((maps) => {
        if (cancelled) return;
        const card = cardRef.current;
        if (!card) return;
        card.style.setProperty('--foil-sat-mask', foilMaskCss(maps.sat));
        card.style.setProperty('--foil-edge-mask', foilMaskCss(maps.edge));
        card.style.setProperty('--foil-gloss-mask', foilMaskCss(maps.gloss));
        card.dataset.foilMaps = '1';
      })
      .catch(() => {
        /* Point light still runs without maps. Masked layers stay hidden. */
      });
    return () => {
      cancelled = true;
    };
  }, [src, needSat, needEdge, needGloss]);

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = imgRef.current ?? cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const maxTilt = recipeRef.current.maxTilt;
      const px = (clientX - r.left) / r.width - 0.5;
      const py = (clientY - r.top) / r.height - 0.5;
      pointerTiltRef.current = {
        x: clamp(-py * maxTilt * 2, -maxTilt, maxTilt),
        y: clamp(px * maxTilt * 2, -maxTilt, maxTilt),
      };
      interactingRef.current = true;
      releaseRef.current = null;
      paint(pointerTiltRef.current.x, pointerTiltRef.current.y);
    },
    [paint],
  );

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    downRef.current = { t: performance.now(), x: e.clientX, y: e.clientY, dragged: false };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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
    releaseRef.current = {
      from: { ...pointerTiltRef.current },
      to: { x: 0, y: 0 },
      t0: performance.now(),
    };
  }, []);

  const onPointerLeave = useCallback(() => {
    downRef.current = null;
    hoverArmedRef.current = true;
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
      className={cn(
        'relative flex h-full w-full min-h-0 min-w-0 cursor-pointer items-center justify-center touch-none',
        className,
      )}
      style={{ perspective: '900px', containerType: 'size' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerLeave}
      onPointerLeave={onPointerLeave}
      data-export-tilt-hit
    >
      {src ? (
        <div
          ref={cardRef}
          className="export-foil pointer-events-none min-h-0 min-w-0 cursor-pointer rounded-lg bg-white ring-1 ring-white/20 select-none"
          style={{
            transformOrigin: 'center center',
            boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
            maxHeight: '100cqh',
            maxWidth: '100cqw',
            width: 'auto',
            height: 'auto',
          }}
          data-export-preview
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className="pointer-events-none block h-auto w-auto rounded-lg object-contain"
            style={{ maxHeight: '100cqh', maxWidth: '100cqw', width: 'auto', height: 'auto' }}
            draggable={false}
          />
          {layerIds.map((id) => (
            <div
              key={id}
              className={cn('export-foil-layer', foilLayerClassName(id))}
              aria-hidden
              data-foil-layer={id}
            />
          ))}
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
