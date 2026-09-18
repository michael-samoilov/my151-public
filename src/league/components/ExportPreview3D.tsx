import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  fitCardInPreviewBox,
  fitScaleForTilt,
  pointerNearPreview,
  PREVIEW_LIFT_Z,
  PREVIEW_PERSPECTIVE_PX,
} from '@/components/export/exportPreviewFit';
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
 * straight-on and stops that orbit; a second tap starts the orbit again.
 * Desktop hover tilts only when the pointer is near the card, not anywhere
 * in the viewport. Rest size fills the box. Tilt applies a uniform scale so
 * the AABB stays in view; pointer tilt is capped at the recipe max.
 */
export function ExportPreview3D({
  src,
  alt,
  busy,
  className,
  recipe = DEFAULT_FOIL_RECIPE,
  frames,
}: {
  src: string | null;
  alt: string;
  busy?: boolean;
  className?: string;
  recipe?: FoilRecipe;
  frames?: { activeKey: string; urls: Record<string, string> };
}) {
  const stageRef = useRef<HTMLDivElement>(null);
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
  const hoverOriginRef = useRef<{ x: number; y: number } | null>(null);
  const hoverArmedRef = useRef(false);
  const recipeRef = useRef(recipe);
  const boxRef = useRef({ w: 0, h: 0 });
  const [cardMax, setCardMax] = useState({ w: 0, h: 0 });
  const layerIds = activeFoilLayerIds(recipe);
  const { sat: needSat, edge: needEdge, gloss: needGloss } = foilMapsNeeded(recipe);
  const activeSrc = (frames ? frames.urls[frames.activeKey] : null) ?? src;

  const applyRecipeVars = useCallback((el: HTMLDivElement) => {
    const vars = foilRecipeCssVars(recipeRef.current);
    for (const [key, value] of Object.entries(vars)) {
      el.style.setProperty(key, value);
    }
  }, []);

  const confine = useCallback((x: number, y: number) => {
    const maxTilt = recipeRef.current.maxTilt;
    return {
      x: clamp(x, -maxTilt, maxTilt),
      y: clamp(y, -maxTilt, maxTilt),
    };
  }, []);

  const paint = useCallback(
    (rawX: number, rawY: number) => {
      const el = cardRef.current;
      if (!el) return;
      const confined = confine(rawX, rawY);
      const x = confined.x;
      const y = confined.y;
      const recipeNow = recipeRef.current;
      lastTiltRef.current = { x, y };
      const card = imgRef.current ?? cardRef.current;
      const box = boxRef.current;
      const cardW = card?.offsetWidth ?? 0;
      const cardH = card?.offsetHeight ?? 0;
      const tiltScale =
        cardW > 8 && cardH > 8 && box.w > 0 && box.h > 0
          ? fitScaleForTilt({
              cardWidth: cardW,
              cardHeight: cardH,
              boxWidth: box.w,
              boxHeight: box.h,
              tiltXDeg: x,
              tiltYDeg: y,
              pad: 8,
            })
          : 1;
      el.style.transform = `scale(${tiltScale}) rotateX(${x}deg) rotateY(${y}deg) translateZ(${PREVIEW_LIFT_Z}px)`;
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
      el.dataset.exportOrbit = interactingRef.current ? 'pointer' : pausedRef.current ? 'paused' : 'idle';
    },
    [applyRecipeVars, confine],
  );

  const idleAt = useCallback((now: number) => {
    if (reducedMotionRef.current) return { x: 0, y: 0 };
    if (originRef.current === null) originRef.current = now;
    const t = now - originRef.current;
    const recipeNow = recipeRef.current;
    return {
      x: Math.sin((t / recipeNow.idleMsX) * Math.PI * 2 + Math.PI / 2) * recipeNow.idleTilt,
      y: Math.sin((t / recipeNow.idleMsY) * Math.PI * 2 + Math.PI / 4) * recipeNow.idleTilt,
    };
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const apply = () => {
      const r = stage.getBoundingClientRect();
      boxRef.current = { w: r.width, h: r.height };
      const img = imgRef.current;
      const aspect = img && img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 1;
      const size = fitCardInPreviewBox({
          boxWidth: r.width,
          boxHeight: r.height,
          aspect,
          tiltDeg: 0,
          pad: 16,
        });
      setCardMax({ w: size.width, h: size.height });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [activeSrc]);

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
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (!hoverOriginRef.current) {
        hoverOriginRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      const moved = Math.hypot(e.clientX - hoverOriginRef.current.x, e.clientY - hoverOriginRef.current.y);
      if (moved >= TAP_PX) hoverArmedRef.current = true;
    };
    window.addEventListener('pointermove', onMove, { passive: true, capture: true });
    return () => window.removeEventListener('pointermove', onMove, { capture: true });
  }, []);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !activeSrc) return;
    el.style.setProperty('--foil-sat-mask', 'none');
    el.style.setProperty('--foil-edge-mask', 'none');
    el.style.setProperty('--foil-gloss-mask', 'none');
    if (!needSat && !needEdge && !needGloss) {
      el.dataset.foilMaps = '1';
      return;
    }
    el.dataset.foilMaps = '0';
    let cancelled = false;
    void foilMaskUrlsFromImage(activeSrc, { sat: needSat, edge: needEdge, gloss: needGloss })
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
  }, [activeSrc, needSat, needEdge, needGloss]);

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = imgRef.current ?? cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const maxTilt = recipeRef.current.maxTilt;
      const px = (clientX - r.left) / r.width - 0.5;
      const py = (clientY - r.top) / r.height - 0.5;
      pointerTiltRef.current = confine(
        clamp(-py * maxTilt * 2, -maxTilt, maxTilt),
        clamp(px * maxTilt * 2, -maxTilt, maxTilt),
      );
      interactingRef.current = true;
      releaseRef.current = null;
      paint(pointerTiltRef.current.x, pointerTiltRef.current.y);
    },
    [confine, paint],
  );

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
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
      if (down) return;
      if (e.pointerType !== 'mouse') return;
      if (pausedRef.current) return;
      if (!hoverArmedRef.current) return;
      const card = imgRef.current ?? cardRef.current;
      if (!card) return;
      if (!pointerNearPreview(e.clientX, e.clientY, card.getBoundingClientRect())) return;
      applyPointer(e.clientX, e.clientY);
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
      hoverOriginRef.current = { x: e.clientX, y: e.clientY };
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
    releaseRef.current = {
      from: { ...pointerTiltRef.current },
      to: { x: 0, y: 0 },
      t0: performance.now(),
    };
  }, []);

  const onPointerLeave = useCallback(() => {
    downRef.current = null;
    if (!interactingRef.current) return;
    interactingRef.current = false;
    releaseRef.current = {
      from: { ...pointerTiltRef.current },
      to: pausedRef.current ? { x: 0, y: 0 } : { x: 0, y: 0 },
      t0: performance.now(),
    };
  }, []);

  const maxW = cardMax.w > 0 ? `${Math.round(cardMax.w)}px` : '100%';
  const maxH = cardMax.h > 0 ? `${Math.round(cardMax.h)}px` : '100%';

  return (
    <div
      ref={stageRef}
      className={cn(
        'relative flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-visible',
        className,
      )}
      style={{ perspective: `${PREVIEW_PERSPECTIVE_PX}px`, containerType: 'size' }}
    >
      {activeSrc ? (
        <div
          className="pointer-events-auto cursor-pointer touch-none overflow-visible p-[8px]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerLeave}
          onPointerLeave={onPointerLeave}
          data-export-tilt-hit
        >
          <div
            ref={cardRef}
            className="export-foil pointer-events-none min-h-0 min-w-0 cursor-pointer overflow-visible rounded-lg bg-white ring-1 ring-white/20 select-none"
            style={{
              transformOrigin: 'center center',
              boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
              maxHeight: maxH,
              maxWidth: maxW,
              width: 'auto',
              height: 'auto',
            }}
            data-export-preview
            data-export-orbit="idle"
          >
            <img
              ref={imgRef}
              src={activeSrc}
              alt={alt}
              className="pointer-events-none block h-auto w-auto rounded-lg object-contain"
              style={{ maxHeight: maxH, maxWidth: maxW, width: 'auto', height: 'auto' }}
              draggable={false}
              data-export-frame={frames?.activeKey}
              data-export-frame-active="1"
              onLoad={() => {
                const stage = stageRef.current;
                const img = imgRef.current;
                if (!stage || !img || img.naturalWidth <= 0) return;
                const r = stage.getBoundingClientRect();
                boxRef.current = { w: r.width, h: r.height };
                const size = fitCardInPreviewBox({
                    boxWidth: r.width,
                    boxHeight: r.height,
                    aspect: img.naturalWidth / img.naturalHeight,
                    tiltDeg: 0,
                    pad: 16,
                  });
                setCardMax({ w: size.width, h: size.height });
              }}
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
