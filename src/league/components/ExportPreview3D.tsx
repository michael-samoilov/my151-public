import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  clampHypot,
  clampTiltToBox,
  fitCardInPreviewBox,
  paintedBoxOverflow,
  PREVIEW_DESKTOP_MAX_HYPOT,
  PREVIEW_DESKTOP_MIN_PX,
  PREVIEW_PERSPECTIVE_PX,
  PREVIEW_REST_PAD,
  PREVIEW_TILT_INSET,
  tiltInsetForRestGap,
} from '@/components/export/exportPreviewFit';
import {
  applySpringOpts,
  createSpring,
  HOVER_TILT_EXIT_DELAY_MS,
  HOVER_TILT_EXIT_SPRING,
  HOVER_TILT_SPRING,
  hoverTiltFromNormalized,
  hoverTiltFromPointer,
  pointInBox,
  pokeHoloIdle,
  REST_POSE,
  springSettled,
  tickSpring,
  type HoverTiltPose,
  type HoverTiltSpring,
} from '@/components/export/hoverTilt';
import {
  DEFAULT_HOVER_TILT_RECIPE,
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

const TAP_MS = 320;
const TAP_PX = 10;

type Orbit = 'idle' | 'pointer' | 'rest' | 'paused';

function lerpPose(from: HoverTiltPose, to: HoverTiltPose, u: number): HoverTiltPose {
  return {
    rotateX: from.rotateX + (to.rotateX - from.rotateX) * u,
    rotateY: from.rotateY + (to.rotateY - from.rotateY) * u,
    pointerX: from.pointerX + (to.pointerX - from.pointerX) * u,
    pointerY: from.pointerY + (to.pointerY - from.pointerY) * u,
    nx: from.nx + (to.nx - from.nx) * u,
    ny: from.ny + (to.ny - from.ny) * u,
  };
}

function tiltAxes(tilt: HoverTiltRecipe | undefined): { tiltFactor: number; tiltFactorY: number } {
  return {
    tiltFactor: tilt?.tiltFactor ?? DEFAULT_HOVER_TILT_RECIPE.tiltFactor,
    tiltFactorY: tilt?.tiltFactorY ?? DEFAULT_HOVER_TILT_RECIPE.tiltFactorY,
  };
}

/**
 * Live export preview. Pointer tracking, springs, rest, and CSS vars
 * copy hover-tilt (https://github.com/simeydotme/hover-tilt).
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
  const orbitRef = useRef<Orbit>('idle');
  const pausedRef = useRef(false);
  const pointerPoseRef = useRef<HoverTiltPose>(REST_POSE);
  const lastPoseRef = useRef<HoverTiltPose>(REST_POSE);
  const releaseRef = useRef<{ from: HoverTiltPose; t0: number } | null>(null);
  const reducedMotionRef = useRef(false);
  const downRef = useRef<{ t: number; x: number; y: number; dragged: boolean } | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const enterSinceRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const moveFrameRef = useRef<number | null>(null);
  const restAtRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const springXRef = useRef<HoverTiltSpring>(createSpring(0.5));
  const springYRef = useRef<HoverTiltSpring>(createSpring(0.5));
  const springARef = useRef<HoverTiltSpring>(createSpring(0));
  const recipeRef = useRef(recipe);
  const tiltRef = useRef(tilt);
  const measureRef = useRef<() => void>(() => {});
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
    const foilMag = Math.hypot(rotateX, rotateY);
    const stage = stageRef.current;
    const boxEl =
      stage?.closest<HTMLElement>('[data-export-preview-layer]') ?? stage;
    const tiltPad = (() => {
      const box = (boxEl ?? stage)?.getBoundingClientRect();
      if (!box || el.offsetWidth <= 0) return PREVIEW_TILT_INSET;
      const restGap = Math.min((box.width - el.offsetWidth) / 2, (box.height - el.offsetHeight) / 2);
      return tiltInsetForRestGap(restGap);
    })();
    if (stage && el.offsetWidth > 0 && el.offsetHeight > 0) {
      const box = stage.getBoundingClientRect();
      const clamped = clampTiltToBox({
        tiltX: rotateX,
        tiltY: rotateY,
        cardWidth: el.offsetWidth,
        cardHeight: el.offsetHeight,
        boxWidth: box.width,
        boxHeight: box.height,
        pad: tiltPad,
      });
      rotateX = clamped.x;
      rotateY = clamped.y;
    }
    if (window.innerWidth >= PREVIEW_DESKTOP_MIN_PX) {
      const capped = clampHypot(rotateX, rotateY, PREVIEW_DESKTOP_MAX_HYPOT);
      rotateX = capped.x;
      rotateY = capped.y;
    }
    const pointerX = pose.pointerX;
    const pointerY = pose.pointerY;
    const nx = pose.nx;
    const ny = pose.ny;
    const applyRotate = (x: number, y: number) => {
      el.style.setProperty('--rotation-x', `${x}deg`);
      el.style.setProperty('--rotation-y', `${y}deg`);
      el.style.setProperty('--rotate-x', `${y}deg`);
      el.style.setProperty('--rotate-y', `${x}deg`);
    };
    applyRotate(rotateX, rotateY);
    if (boxEl && el.offsetWidth > 0) {
      const live = boxEl.getBoundingClientRect();
      const overflowOf = () => paintedBoxOverflow(el.getBoundingClientRect(), live, tiltPad);
      if (overflowOf() > 0) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          applyRotate(rotateX * mid, rotateY * mid);
          if (overflowOf() <= 0) lo = mid;
          else hi = mid;
        }
        rotateX *= lo;
        rotateY *= lo;
        applyRotate(rotateX, rotateY);
      }
    }
    lastPoseRef.current = { rotateX, rotateY, pointerX, pointerY, nx, ny };
    el.style.setProperty('--pointer-x', `${pointerX}%`);
    el.style.setProperty('--pointer-y', `${pointerY}%`);
    el.style.setProperty('--pointer-from-center', Math.min(1, Math.hypot(pointerX - 50, pointerY - 50) / 50).toFixed(3));
    el.style.setProperty('--pointer-from-top', (pointerY / 100).toFixed(3));
    el.style.setProperty('--pointer-from-left', (pointerX / 100).toFixed(3));
    el.style.setProperty('--hover-tilt-x', nx.toFixed(4));
    el.style.setProperty('--hover-tilt-y', ny.toFixed(4));
    el.style.setProperty('--gradient-x', `${pointerX}%`);
    el.style.setProperty('--gradient-y', `${pointerY}%`);
    const recipeNow = recipeRef.current;
    const tiltNow = tiltRef.current ?? DEFAULT_HOVER_TILT_RECIPE;
    const span = Math.max(0.001, recipeNow.maxTilt - recipeNow.deadDeg);
    const foil =
      foilMag <= recipeNow.deadDeg ? 0 : Math.min(1, (foilMag - recipeNow.deadDeg) / span);
    el.style.setProperty('--foil-opacity', foil.toFixed(3));
    el.style.setProperty('--hover-tilt-opacity', foil.toFixed(3));
    const angle = (Math.atan2(ny - 0.5, nx - 0.5) * 180) / Math.PI;
    el.style.setProperty('--hover-tilt-angle', `${angle.toFixed(1)}deg`);
    el.style.setProperty('--hover-tilt-from-center', Math.min(1, Math.hypot(nx - 0.5, ny - 0.5) / 0.5).toFixed(3));
    el.style.setProperty('--hover-tilt-at-edge', Math.min(1, Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) * 2).toFixed(3));
    const shadowX = nx * 2 - 1;
    const shadowY = ny * 2 - 1;
    el.style.setProperty('--shadow-x', shadowX.toFixed(4));
    el.style.setProperty('--shadow-y', shadowY.toFixed(4));
    if (!el.style.getPropertyValue('--foil-pointLight')) {
      const vars = foilRecipeCssVars(recipeNow);
      for (const [key, value] of Object.entries(vars)) {
        el.style.setProperty(key, value);
      }
    }
    el.setAttribute('data-tilt-x', rotateX.toFixed(1));
    el.setAttribute('data-tilt-y', rotateY.toFixed(1));
    el.setAttribute('data-tilt-scale', tiltNow.scaleFactor === 1 ? '1' : tiltNow.scaleFactor.toFixed(3));
    el.setAttribute('data-foil-opacity', foil.toFixed(3));
    el.setAttribute('data-paused', pausedRef.current ? '1' : '0');
    el.setAttribute('data-export-orbit', orbitRef.current);
    el.setAttribute('data-shadow-x', shadowX.toFixed(2));
    el.setAttribute('data-shadow-y', shadowY.toFixed(2));
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

  const paintedBox = useCallback((): DOMRect | null => {
    const card = cardRef.current;
    if (card && card.offsetWidth > 0) return card.getBoundingClientRect();
    const hit = hitRef.current;
    return hit ? hit.getBoundingClientRect() : null;
  }, []);

  const beginPointer = useCallback((clientX: number, clientY: number) => {
    const box = paintedBox();
    if (!box || box.width === 0) return;
    const pose = hoverTiltFromPointer(clientX, clientY, box, tiltAxes(tiltRef.current));
    const last = lastPoseRef.current;
    springXRef.current.value = last.nx;
    springYRef.current.value = last.ny;
    springXRef.current.target = pose.nx;
    springYRef.current.target = pose.ny;
    springARef.current.target = 1;
    applySpringOpts(springXRef.current, HOVER_TILT_SPRING);
    applySpringOpts(springYRef.current, HOVER_TILT_SPRING);
    applySpringOpts(springARef.current, HOVER_TILT_SPRING);
    pointerPoseRef.current = pose;
    pendingPointerRef.current = { x: clientX, y: clientY };
    orbitRef.current = 'pointer';
    restAtRef.current = null;
    releaseRef.current = null;
  }, [paintedBox]);

  const schedulePointer = useCallback((clientX: number, clientY: number) => {
    pendingPointerRef.current = { x: clientX, y: clientY };
    if (moveFrameRef.current !== null) return;
    moveFrameRef.current = requestAnimationFrame(() => {
      moveFrameRef.current = null;
      const pending = pendingPointerRef.current;
      if (!pending || orbitRef.current !== 'pointer') return;
      const box = paintedBox();
      if (!box || box.width === 0) return;
      const pose = hoverTiltFromPointer(pending.x, pending.y, box, tiltAxes(tiltRef.current));
      springXRef.current.target = pose.nx;
      springYRef.current.target = pose.ny;
      springARef.current.target = 1;
      pointerPoseRef.current = pose;
    });
  }, [paintedBox]);

  const beginRest = useCallback((now: number) => {
    if (orbitRef.current !== 'pointer') return;
    orbitRef.current = 'rest';
    const delay = tiltRef.current?.exitDelay ?? HOVER_TILT_EXIT_DELAY_MS;
    restAtRef.current = now + delay;
    pendingPointerRef.current = null;
    if (moveFrameRef.current !== null) {
      cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = null;
    }
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
      const lastTick = lastTickRef.current ?? now;
      const dt = now - lastTick;
      lastTickRef.current = now;
      if (orbitRef.current === 'pointer') {
        tickSpring(springXRef.current, dt);
        tickSpring(springYRef.current, dt);
        tickSpring(springARef.current, dt);
        paint(hoverTiltFromNormalized(springXRef.current.value, springYRef.current.value, tiltAxes(tiltRef.current)));
      } else if (orbitRef.current === 'rest') {
        const restAt = restAtRef.current;
        if (restAt !== null && now < restAt) {
          paint(lastPoseRef.current);
        } else {
          applySpringOpts(springXRef.current, HOVER_TILT_EXIT_SPRING);
          applySpringOpts(springYRef.current, HOVER_TILT_EXIT_SPRING);
          applySpringOpts(springARef.current, HOVER_TILT_EXIT_SPRING);
          springXRef.current.target = 0.5;
          springYRef.current.target = 0.5;
          springARef.current.target = 0;
          tickSpring(springXRef.current, dt);
          tickSpring(springYRef.current, dt);
          tickSpring(springARef.current, dt);
          paint(hoverTiltFromNormalized(springXRef.current.value, springYRef.current.value, tiltAxes(tiltRef.current)));
          if (
            springSettled(springXRef.current) &&
            springSettled(springYRef.current) &&
            springARef.current.value < 0.02
          ) {
            restAtRef.current = null;
            originRef.current = now;
            orbitRef.current = 'idle';
            paint(REST_POSE);
          }
        }
      } else if (pausedRef.current) {
        orbitRef.current = 'paused';
        const release = releaseRef.current;
        const releaseMs = tiltRef.current?.exitDelay ?? HOVER_TILT_EXIT_DELAY_MS;
        if (release) {
          const u = Math.min(1, (now - release.t0) / Math.max(1, releaseMs));
          const ease = 1 - (1 - u) * (1 - u);
          paint(lerpPose(release.from, REST_POSE, ease));
          if (u >= 1) releaseRef.current = null;
        } else {
          paint(REST_POSE);
        }
      } else {
        orbitRef.current = 'idle';
        const idle = idleAt(now);
        const release = releaseRef.current;
        if (release) {
          const releaseMs = tiltRef.current?.exitDelay ?? HOVER_TILT_EXIT_DELAY_MS;
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
    const tiltNow = tilt ?? DEFAULT_HOVER_TILT_RECIPE;
    const tiltVars = hoverTiltCssVars(tiltNow);
    for (const [key, value] of Object.entries(tiltVars)) {
      el.style.setProperty(key, value);
    }
    el.dataset.hoverTiltShadow = tiltNow.shadow ? '1' : '0';
    if (!tilt) return;
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

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && !downRef.current) return;
      const card = cardRef.current;
      const hit = hitRef.current;
      if (!card) return;
      const painted = card.getBoundingClientRect();
      const overCard = pointInBox(e.clientX, e.clientY, painted, 2);
      const overHit = hit ? pointInBox(e.clientX, e.clientY, hit.getBoundingClientRect(), 2) : false;
      const down = downRef.current;
      if (down && !down.dragged) {
        const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        if (dist > TAP_PX) down.dragged = true;
      }
      const dragging = Boolean(down?.dragged || (down && e.buttons > 0 && e.pointerType !== 'mouse'));
      if (dragging) {
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        if (orbitRef.current !== 'pointer') beginPointer(e.clientX, e.clientY);
        else schedulePointer(e.clientX, e.clientY);
        return;
      }
      if (down) return;
      if (pausedRef.current) return;
      if (e.pointerType !== 'mouse') return;
      if (overCard || (orbitRef.current === 'pointer' && overHit)) {
        const last = lastPointerRef.current;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        // Seed only: a parked cursor must not cancel poke-holo idle.
        // Real mice always send a second event; hover-tilt springs still track that.
        if (!last) return;
        if (last.x === e.clientX && last.y === e.clientY && orbitRef.current !== 'pointer') return;
        const enterDelay = tiltRef.current?.enterDelay ?? 0;
        if (enterDelay > 0 && orbitRef.current !== 'pointer') {
          if (enterSinceRef.current === null) enterSinceRef.current = performance.now();
          if (performance.now() - enterSinceRef.current < enterDelay) return;
        }
        enterSinceRef.current = null;
        if (orbitRef.current !== 'pointer') beginPointer(e.clientX, e.clientY);
        else schedulePointer(e.clientX, e.clientY);
        return;
      }
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      enterSinceRef.current = null;
      if (orbitRef.current === 'pointer') beginRest(performance.now());
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => document.removeEventListener('pointermove', onMove);
  }, [beginPointer, beginRest, schedulePointer]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    downRef.current = { t: performance.now(), x: e.clientX, y: e.clientY, dragged: false };
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const down = downRef.current;
    downRef.current = null;
    const tap =
      !!down &&
      !down.dragged &&
      performance.now() - down.t < TAP_MS &&
      Math.hypot(e.clientX - down.x, e.clientY - down.y) <= TAP_PX;

    if (tap) {
      lastPointerRef.current = null;
      pendingPointerRef.current = null;
      restAtRef.current = null;
      enterSinceRef.current = null;
      pausedRef.current = !pausedRef.current;
      if (pausedRef.current) {
        orbitRef.current = 'paused';
        releaseRef.current = { from: { ...lastPoseRef.current }, t0: performance.now() };
      } else {
        orbitRef.current = 'idle';
        originRef.current = performance.now();
        releaseRef.current = null;
      }
      return;
    }

    if (orbitRef.current !== 'pointer') return;
    if (pausedRef.current) {
      orbitRef.current = 'paused';
      releaseRef.current = { from: { ...lastPoseRef.current }, t0: performance.now() };
      pendingPointerRef.current = null;
      return;
    }
    beginRest(performance.now());
  }, [beginRest]);

  const onPointerCancel = useCallback(() => {
    downRef.current = null;
    if (orbitRef.current === 'pointer') beginRest(performance.now());
  }, [beginRest]);

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
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          data-export-tilt-hit
          data-tilt-perspective={String(PREVIEW_PERSPECTIVE_PX)}
        >
          <div
            ref={cardRef}
            className="export-foil pointer-events-none min-h-0 min-w-0 cursor-pointer overflow-hidden rounded-lg bg-transparent select-none"
            style={{
              transformOrigin: 'center center',
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
            data-hover-tilt-shadow="1"
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
