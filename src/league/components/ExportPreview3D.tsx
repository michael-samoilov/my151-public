import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { fitCardInPreviewBox, PREVIEW_PERSPECTIVE_PX } from '@/components/export/exportPreviewFit';
import {
  pokeHoloFromPointer,
  pokeHoloIdle,
  REST_POSE,
  type HoverTiltPose,
} from '@/components/export/hoverTilt';
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

function lerpPose(from: HoverTiltPose, to: HoverTiltPose, u: number): HoverTiltPose {
  return {
    rotateX: from.rotateX + (to.rotateX - from.rotateX) * u,
    rotateY: from.rotateY + (to.rotateY - from.rotateY) * u,
    pointerX: from.pointerX + (to.pointerX - from.pointerX) * u,
    pointerY: from.pointerY + (to.pointerY - from.pointerY) * u,
  };
}

/**
 * Live export preview with poke-holo / hover-tilt.
 *
 * Pointer writes CSS custom properties on the untransformed hit box.
 * The card transform is rotateY(var(--rotate-x)) rotateX(var(--rotate-y))
 * with no scale. Idle orbit runs with no input. A press parks the card
 * straight-on; a second press resumes the orbit.
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
  const hitRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const originRef = useRef<number | null>(null);
  const interactingRef = useRef(false);
  const pausedRef = useRef(false);
  const pointerPoseRef = useRef<HoverTiltPose>(REST_POSE);
  const lastPoseRef = useRef<HoverTiltPose>(REST_POSE);
  const releaseRef = useRef<{ from: HoverTiltPose; t0: number } | null>(null);
  const reducedMotionRef = useRef(false);
  const downRef = useRef<{ t: number; x: number; y: number; dragged: boolean } | null>(null);
  const recipeRef = useRef(recipe);
  const [cardMax, setCardMax] = useState({ w: 0, h: 0 });
  const layerIds = activeFoilLayerIds(recipe);
  const { sat: needSat, edge: needEdge, gloss: needGloss } = foilMapsNeeded(recipe);
  const activeSrc = (frames ? frames.urls[frames.activeKey] : null) ?? src;

  const paint = useCallback((pose: HoverTiltPose) => {
    const el = cardRef.current;
    if (!el) return;
    const maxTilt = recipeRef.current.maxTilt;
    const rotateX = Math.min(maxTilt, Math.max(-maxTilt, pose.rotateX));
    const rotateY = Math.min(maxTilt, Math.max(-maxTilt, pose.rotateY));
    const pointerX = pose.pointerX;
    const pointerY = pose.pointerY;
    lastPoseRef.current = { rotateX, rotateY, pointerX, pointerY };
    el.style.setProperty('--rotate-x', `${rotateY}deg`);
    el.style.setProperty('--rotate-y', `${rotateX}deg`);
    el.style.setProperty('--pointer-x', `${pointerX}%`);
    el.style.setProperty('--pointer-y', `${pointerY}%`);
    el.style.setProperty('--pointer-from-center', Math.min(1, Math.hypot(pointerX - 50, pointerY - 50) / 50).toFixed(3));
    el.style.setProperty('--pointer-from-top', (pointerY / 100).toFixed(3));
    el.style.setProperty('--pointer-from-left', (pointerX / 100).toFixed(3));
    const mag = Math.hypot(rotateX, rotateY);
    const recipeNow = recipeRef.current;
    const span = Math.max(0.001, recipeNow.maxTilt - recipeNow.deadDeg);
    const foil = mag <= recipeNow.deadDeg ? 0 : Math.min(1, (mag - recipeNow.deadDeg) / span);
    el.style.setProperty('--foil-opacity', foil.toFixed(3));
    el.setAttribute('data-tilt-x', rotateX.toFixed(1));
    el.setAttribute('data-tilt-y', rotateY.toFixed(1));
    el.setAttribute('data-tilt-scale', '1');
    el.setAttribute('data-foil-opacity', foil.toFixed(3));
    el.setAttribute('data-paused', pausedRef.current ? '1' : '0');
    el.setAttribute('data-export-orbit', interactingRef.current ? 'pointer' : pausedRef.current ? 'paused' : 'idle');
  }, []);

  const idleAt = useCallback((now: number) => {
    if (reducedMotionRef.current) return REST_POSE;
    if (originRef.current === null) originRef.current = now;
    const recipeNow = recipeRef.current;
    return pokeHoloIdle({
      now,
      origin: originRef.current,
      idleMsX: recipeNow.idleMsX,
      idleMsY: recipeNow.idleMsY,
      idleTilt: recipeNow.idleTilt,
    });
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const apply = () => {
      const r = stage.getBoundingClientRect();
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
        paint(pointerPoseRef.current);
      } else if (pausedRef.current) {
        const release = releaseRef.current;
        if (release) {
          const u = Math.min(1, (now - release.t0) / RELEASE_MS);
          const ease = 1 - (1 - u) * (1 - u);
          paint(lerpPose(release.from, REST_POSE, ease));
          if (u >= 1) releaseRef.current = null;
        } else {
          paint(REST_POSE);
        }
      } else {
        const idle = idleAt(now);
        const release = releaseRef.current;
        if (release) {
          const u = Math.min(1, (now - release.t0) / RELEASE_MS);
          const ease = 1 - (1 - u) * (1 - u);
          paint(lerpPose(release.from, idle, ease));
          if (u >= 1) releaseRef.current = null;
        } else {
          paint(idle);
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
    const vars = foilRecipeCssVars(recipe);
    for (const [key, value] of Object.entries(vars)) {
      el.style.setProperty(key, value);
    }
  }, [recipe]);

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
      const hit = hitRef.current;
      if (!hit) return;
      const r = hit.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const pose = pokeHoloFromPointer(clientX, clientY, r, recipeRef.current.maxTilt);
      pointerPoseRef.current = pose;
      interactingRef.current = true;
      releaseRef.current = null;
      paint(pose);
    },
    [paint],
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
      if (pausedRef.current) {
        releaseRef.current = { from: { ...lastPoseRef.current }, t0: performance.now() };
      } else {
        originRef.current = performance.now();
        releaseRef.current = null;
      }
      return;
    }

    if (!interactingRef.current) return;
    interactingRef.current = false;
    releaseRef.current = {
      from: { ...pointerPoseRef.current },
      t0: performance.now(),
    };
  }, []);

  const onPointerLeave = useCallback(() => {
    downRef.current = null;
    if (!interactingRef.current) return;
    interactingRef.current = false;
    releaseRef.current = {
      from: { ...pointerPoseRef.current },
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
          ref={hitRef}
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
            data-tilt-scale="1"
            data-paused="0"
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
