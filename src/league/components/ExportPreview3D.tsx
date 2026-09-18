import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  clampTiltToBox,
  fitCardInPreviewBox,
  PREVIEW_PERSPECTIVE_PX,
  PREVIEW_REST_PAD,
} from '@/components/export/exportPreviewFit';
import {
  pokeHoloFromPointer,
  pokeHoloIdle,
  REST_POSE,
  type HoverTiltPose,
} from '@/components/export/hoverTilt';
import {
  hoverTiltBoxShadow,
  hoverTiltCssVars,
  type HoverTiltRecipe,
} from '@/components/export/hoverTiltRecipe';
import {
  DEFAULT_MASK_CONTEXT,
  hoverTiltMaskCssVars,
  hoverTiltMaskPaint,
  hoverTiltMaskSpriteTypes,
  resolveHoverTiltMaskPaint,
  type HoverTiltMaskContext,
} from '@/components/export/hoverTiltMasks';
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
const HOVER_ARM_PX = 3;

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
  tilt,
  maskContext = DEFAULT_MASK_CONTEXT,
  darkCard = false,
}: {
  src: string | null;
  alt: string;
  busy?: boolean;
  className?: string;
  recipe?: FoilRecipe;
  frames?: { activeKey: string; urls: Record<string, string> };
  /** Native hover-tilt knobs and masks. Omit on the live overlay. */
  tilt?: HoverTiltRecipe;
  maskContext?: HoverTiltMaskContext;
  /** Workshop-only: invert the poster so white glare is readable. */
  darkCard?: boolean;
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
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const recipeRef = useRef(recipe);
  const tiltRef = useRef(tilt);
  const measureRef = useRef<() => void>(() => {});
  const enterSinceRef = useRef<number | null>(null);
  const [cardMax, setCardMax] = useState({ w: 0, h: 0 });
  const layerIds = activeFoilLayerIds(recipe);
  const { sat: needSat, edge: needEdge, gloss: needGloss } = foilMapsNeeded(recipe);
  const activeSrc = (frames ? frames.urls[frames.activeKey] : null) ?? src;

  const paint = useCallback((pose: HoverTiltPose) => {
    const el = cardRef.current;
    if (!el) return;
    const maxTilt = recipeRef.current.maxTilt;
    let rotateX = Math.min(maxTilt, Math.max(-maxTilt, pose.rotateX));
    let rotateY = Math.min(maxTilt, Math.max(-maxTilt, pose.rotateY));
    const stage = stageRef.current;
    const boxEl =
      stage?.closest<HTMLElement>('[data-export-preview-layer]') ?? stage;
    if (stage && el.offsetWidth > 0 && el.offsetHeight > 0) {
      const box = stage.getBoundingClientRect();
      const clamped = clampTiltToBox({
        tiltX: rotateX,
        tiltY: rotateY,
        cardWidth: el.offsetWidth,
        cardHeight: el.offsetHeight,
        boxWidth: box.width,
        boxHeight: box.height,
        pad: PREVIEW_REST_PAD,
      });
      rotateX = clamped.x;
      rotateY = clamped.y;
    }
    const pointerX = pose.pointerX;
    const pointerY = pose.pointerY;
    const applyRotate = (x: number, y: number) => {
      el.style.setProperty('--rotate-x', `${y}deg`);
      el.style.setProperty('--rotate-y', `${x}deg`);
    };
    applyRotate(rotateX, rotateY);
    if (boxEl && el.offsetWidth > 0) {
      const live = boxEl.getBoundingClientRect();
      const overflowOf = () => {
        const c = el.getBoundingClientRect();
        return Math.max(
          0,
          live.left - c.left,
          c.right - live.right,
          live.top - c.top,
          c.bottom - live.bottom,
        );
      };
      if (overflowOf() > 4) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          applyRotate(rotateX * mid, rotateY * mid);
          if (overflowOf() <= 4) lo = mid;
          else hi = mid;
        }
        rotateX *= lo;
        rotateY *= lo;
        applyRotate(rotateX, rotateY);
      }
    }
    lastPoseRef.current = { rotateX, rotateY, pointerX, pointerY };
    el.style.setProperty('--pointer-x', `${pointerX}%`);
    el.style.setProperty('--pointer-y', `${pointerY}%`);
    el.style.setProperty('--pointer-from-center', Math.min(1, Math.hypot(pointerX - 50, pointerY - 50) / 50).toFixed(3));
    el.style.setProperty('--pointer-from-top', (pointerY / 100).toFixed(3));
    el.style.setProperty('--pointer-from-left', (pointerX / 100).toFixed(3));
    const mag = Math.hypot(rotateX, rotateY);
    const recipeNow = recipeRef.current;
    const tiltNow = tiltRef.current;
    const span = Math.max(0.001, recipeNow.maxTilt - recipeNow.deadDeg);
    const foil = mag <= recipeNow.deadDeg ? 0 : Math.min(1, (mag - recipeNow.deadDeg) / span);
    el.style.setProperty('--foil-opacity', foil.toFixed(3));
    if (tiltNow) {
      const angle = (Math.atan2(pointerY - 50, pointerX - 50) * 180) / Math.PI;
      el.style.setProperty('--hover-tilt-angle', `${angle.toFixed(1)}deg`);
      el.style.setProperty('--hover-tilt-x', `${pointerX}%`);
      el.style.setProperty('--hover-tilt-y', `${pointerY}%`);
      el.style.setProperty('--hover-tilt-rotation-x', `${rotateX}deg`);
      el.style.setProperty('--hover-tilt-rotation-y', `${rotateY}deg`);
      el.style.setProperty('--hover-tilt-from-center', Math.min(1, Math.hypot(pointerX - 50, pointerY - 50) / 50).toFixed(3));
      el.style.setProperty('--hover-tilt-at-edge', Math.min(1, Math.hypot(pointerX - 50, pointerY - 50) / 50).toFixed(3));
      el.style.setProperty('--hover-tilt-opacity', foil.toFixed(3));
      el.style.setProperty('--gradient-x', `${pointerX}%`);
      el.style.setProperty('--gradient-y', `${pointerY}%`);
    }
    if (!el.style.getPropertyValue('--foil-pointLight')) {
      const vars = foilRecipeCssVars(recipeNow);
      for (const [key, value] of Object.entries(vars)) {
        el.style.setProperty(key, value);
      }
    }
    el.setAttribute('data-tilt-x', rotateX.toFixed(1));
    el.setAttribute('data-tilt-y', rotateY.toFixed(1));
    el.setAttribute('data-tilt-scale', tiltNow ? tiltNow.scaleFactor.toFixed(3) : '1');
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
        tiltDeg: recipeRef.current.idleTilt,
        pad: PREVIEW_REST_PAD,
      });
      setCardMax((prev) => {
        if (Math.abs(prev.w - size.width) < 1 && Math.abs(prev.h - size.height) < 1) return prev;
        return { w: size.width, h: size.height };
      });
    };
    measureRef.current = apply;
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
          const releaseMs = tiltRef.current?.exitDelay ?? RELEASE_MS;
          const u = Math.min(1, (now - release.t0) / Math.max(1, releaseMs));
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
          const releaseMs = tiltRef.current?.exitDelay ?? RELEASE_MS;
          const u = Math.min(1, (now - release.t0) / Math.max(1, releaseMs));
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
    tiltRef.current = tilt;
    const el = cardRef.current;
    if (!el) return;
    const vars = foilRecipeCssVars(recipe);
    for (const [key, value] of Object.entries(vars)) {
      el.style.setProperty(key, value);
    }
    if (!tilt) return;
    const tiltVars = hoverTiltCssVars(tilt);
    for (const [key, value] of Object.entries(tiltVars)) {
      el.style.setProperty(key, value);
    }
    el.dataset.maskSpriteCount = String(maskContext.sprites.length);
    el.dataset.maskSpriteTypes = hoverTiltMaskSpriteTypes(maskContext);
    const syncGlare = hoverTiltMaskPaint(tilt.glareMask, maskContext);
    const syncSparkle = hoverTiltMaskPaint(tilt.sparkleMask, maskContext);
    const syncVars = hoverTiltMaskCssVars(syncGlare, syncSparkle);
    for (const [key, value] of Object.entries(syncVars)) {
      el.style.setProperty(key, value);
    }
    let cancelled = false;
    void Promise.all([
      resolveHoverTiltMaskPaint(tilt.glareMask, maskContext),
      resolveHoverTiltMaskPaint(tilt.sparkleMask, maskContext),
    ]).then(([glare, sparkle]) => {
      if (cancelled || cardRef.current !== el) return;
      const maskVars = hoverTiltMaskCssVars(glare, sparkle);
      for (const [key, value] of Object.entries(maskVars)) {
        el.style.setProperty(key, value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeSrc, maskContext, recipe, tilt]);

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
      const tiltNow = tiltRef.current;
      const pose = pokeHoloFromPointer(clientX, clientY, r, recipeRef.current.maxTilt, tiltNow
        ? { tiltFactor: tiltNow.tiltFactor, tiltFactorY: tiltNow.tiltFactorY }
        : undefined);
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
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        applyPointer(e.clientX, e.clientY);
        return;
      }
      if (down) return;
      if (e.pointerType !== 'mouse') return;
      if (pausedRef.current) return;
      const last = lastPointerRef.current;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      // A cursor already on the card at open fires pointermove with no travel.
      // That must not steal idle. Arm hover only after a real move.
      if (!last) return;
      if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < HOVER_ARM_PX) return;
      const enterDelay = tiltRef.current?.enterDelay ?? 0;
      if (enterDelay > 0) {
        if (enterSinceRef.current === null) enterSinceRef.current = performance.now();
        if (performance.now() - enterSinceRef.current < enterDelay) return;
      }
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
      lastPointerRef.current = null;
      enterSinceRef.current = null;
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
    enterSinceRef.current = null;
    releaseRef.current = {
      from: { ...pointerPoseRef.current },
      t0: performance.now(),
    };
  }, []);

  const onPointerLeave = useCallback(() => {
    downRef.current = null;
    lastPointerRef.current = null;
    enterSinceRef.current = null;
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
      style={{
        perspective: `${PREVIEW_PERSPECTIVE_PX}px`,
        transformStyle: 'preserve-3d',
        containerType: 'size',
      }}
    >
      {activeSrc ? (
        <div
          ref={hitRef}
          className="export-foil-hit pointer-events-auto cursor-pointer touch-none overflow-visible p-[8px]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerLeave}
          onPointerLeave={onPointerLeave}
          data-export-tilt-hit
          data-tilt-perspective={String(PREVIEW_PERSPECTIVE_PX)}
        >
          <div
            ref={cardRef}
            className="export-foil pointer-events-none min-h-0 min-w-0 cursor-pointer overflow-hidden rounded-lg bg-transparent select-none"
            style={{
              transformOrigin: 'center center',
              boxShadow: tilt ? hoverTiltBoxShadow(tilt) : '0 24px 48px rgba(0,0,0,0.35)',
              maxHeight: maxH,
              maxWidth: maxW,
              width: 'auto',
              height: 'auto',
            }}
            data-export-preview
            data-export-orbit="idle"
            data-tilt-scale={tilt ? tilt.scaleFactor.toFixed(3) : '1'}
            data-paused="0"
            data-hover-tilt={tilt ? '1' : undefined}
            data-hover-tilt-glare-mask={tilt?.glareMask}
            data-hover-tilt-sparkle-mask={tilt?.sparkleMask}
            data-mask-sprite-count={String(maskContext.sprites.length)}
            data-mask-sprite-types={hoverTiltMaskSpriteTypes(maskContext)}
            data-workshop-dark-card={darkCard ? '1' : undefined}
          >
            <img
              ref={imgRef}
              src={activeSrc}
              alt={alt}
              className="pointer-events-none block h-auto w-auto object-contain"
              style={{ maxHeight: maxH, maxWidth: maxW, width: 'auto', height: 'auto' }}
              draggable={false}
              data-export-frame={frames?.activeKey}
              data-export-frame-active="1"
              onLoad={() => {
                measureRef.current();
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
