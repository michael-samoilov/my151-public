import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { PokeBallSpinner } from '@/components/shared/PokeBallSpinner';
import { useT } from '@/i18n';
import {
  clampHypot,
  clampTiltToBox,
  fitCardInPreviewBox,
  previewPerspectivePx,
  previewSizeCamera,
  PREVIEW_REST_PAD,
  PREVIEW_SHADOW_PAD_PX,
  type PreviewCamera,
} from '@/components/export/exportPreviewFit';
import {
  normalizedForTilt,
  pointInBox,
  pokeHoloIdle,
  pointerMovedFrom,
  REST_POSE,
} from '@/components/export/hoverTilt';
import {
  applySpringOpts,
  cancelHoverTiltFrame,
  createSpring,
  HOVER_TILT_EXIT_DELAY_MS,
  HOVER_TILT_EXIT_SPRING,
  HOVER_TILT_SPRING,
  hoverTiltEnter,
  hoverTiltFromNormalized,
  hoverTiltFromPointer,
  hoverTiltLeave,
  hoverTiltPointerMove,
  hoverTiltScale,
  hoverTiltShadow,
  scheduleHoverTiltFrame,
  springSettled,
  tickSpring,
  type HoverTiltAxes,
  type HoverTiltPose,
  type HoverTiltSpring,
} from '@/components/export/hover-tilt/hoverTilt';
import '@/components/export/hover-tilt/hoverTilt.css';
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
import { FOIL_HOLO_BLEND } from '../export/foilBlend';
import { exportCornerRadius } from '@/lib/exportPngShape';
import './ExportPreview3D.css';

const TAP_MS = 320;
/** Opening the export eases auto-tilt, glare, pop, and foil in from flat. */
const PREVIEW_OPEN_MS = 1500;
/** The most one frame advances the opening, so a stalled frame cannot skip it. */
const PREVIEW_OPEN_STEP_MS = 34;

/** The opening ramp, 0 to 1, from the ms the loop counted since the card showed. */
function openEase(ms: number | null): number {
  if (ms === null) return 0;
  const u = Math.min(1, ms / PREVIEW_OPEN_MS);
  return u * u * (3 - 2 * u);
}
const TAP_PX = 10;

type Orbit = 'idle' | 'pointer' | 'rest' | 'paused' | 'static';

/**
 * `auto` orbits until a mouse first hovers the card. `hover` tilts under the
 * mouse and rests flat when it leaves. `locked` rests flat and ignores hover
 * until the next click. Touch toggles between `auto` and `locked`.
 */
type TiltMode = 'auto' | 'hover' | 'locked';

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

function tiltAxes(tilt: HoverTiltRecipe | undefined, maxTilt: number): HoverTiltAxes {
  return {
    rotation: maxTilt,
    tiltFactor: tilt?.tiltFactor ?? DEFAULT_HOVER_TILT_RECIPE.tiltFactor,
    tiltFactorY: tilt?.tiltFactorY ?? DEFAULT_HOVER_TILT_RECIPE.tiltFactorY,
  };
}

function HoloShineParts() {
  return (
    <>
      <span className="export-foil-holo-part export-foil-holo-radial" />
      <span className="export-foil-holo-part export-foil-holo-bands" />
      <span className="export-foil-holo-part export-foil-holo-pillars" />
      <span className="export-foil-holo-part export-foil-holo-grain" />
    </>
  );
}

/**
 * Live export preview. It tilts with hover-tilt's pointer tracking, springs,
 * and leave, which live in `@/components/export/hover-tilt/`, and writes
 * hover-tilt's documented CSS variables.
 */
export function ExportPreview3D({
  src,
  alt,
  busy,
  className,
  recipe = DEFAULT_FOIL_RECIPE,
  frames,
  tilt = DEFAULT_HOVER_TILT_RECIPE,
  maskContext = DEFAULT_MASK_CONTEXT,
  darkCard = false,
  camera = previewPerspectivePx,
  size = 1,
  shine = 'paint',
}: {
  src: string | null;
  alt: string;
  busy?: boolean;
  className?: string;
  recipe?: FoilRecipe;
  frames?: { activeKey: string; urls: Record<string, string> };
  /** Native hover-tilt knobs and masks. Live overlay uses the default recipe. */
  tilt?: HoverTiltRecipe;
  maskContext?: HoverTiltMaskContext;
  darkCard?: boolean;
  /** Camera distance for a card size. The workshop compares others. */
  camera?: PreviewCamera;
  /**
   * A multiple of the card size `previewSizeCamera` gives, never past the
   * room the tilt leaves. `room` fills that room, as on October 10.
   */
  size?: number | 'room';
  /**
   * `paint` moves the V shine's backgrounds, which repaints the shine on
   * every frame. `move`, in the workshop only, slides its band layers with
   * transforms: half the raster work in Chrome, but more layers to blend,
   * so only a real GPU shows whether it is smoother.
   */
  shine?: 'move' | 'paint';
}) {
  const t = useT();
  const stageRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const originRef = useRef<number | null>(null);
  const openMsRef = useRef<number | null>(null);
  const orbitRef = useRef<Orbit>('idle');
  const pausedRef = useRef(false);
  const modeRef = useRef<TiltMode>('auto');
  const pointerPoseRef = useRef<HoverTiltPose>(REST_POSE);
  const lastPoseRef = useRef<HoverTiltPose>(REST_POSE);
  const releaseRef = useRef<{ from: HoverTiltPose; t0: number } | null>(null);
  const downRef = useRef<{ t: number; x: number; y: number; dragged: boolean } | null>(null);
  const reducedMotionRef = useRef(false);
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
  const cameraRef = useRef(camera);
  const sizeRef = useRef(size);
  const measureRef = useRef<() => void>(() => {});
  const stageSizeRef = useRef({ w: 0, h: 0 });
  const cardMaxRef = useRef({ w: 0, h: 0 });
  const [cardMax, setCardMax] = useState({ w: 0, h: 0 });
  const layerIds = activeFoilLayerIds(recipe);
  const { sat: needSat, edge: needEdge, gloss: needGloss } = foilMapsNeeded(recipe);
  const liveSrc = (frames ? frames.urls[frames.activeKey] : null) ?? src;
  // While a changed setting renders, keep the last picture on screen: a
  // placeholder between two finished pictures flickers. The Save button shows
  // the wait instead. A picture the cache has since released is not kept.
  const [heldSrc, setHeldSrc] = useState(liveSrc);
  if (liveSrc && liveSrc !== heldSrc) setHeldSrc(liveSrc);
  const heldIsLive = heldSrc != null && (heldSrc === src || Object.values(frames?.urls ?? {}).includes(heldSrc));
  const activeSrc = liveSrc ?? (heldIsLive ? heldSrc : null);
  const shownKey = frames ? Object.keys(frames.urls).find((key) => frames.urls[key] === activeSrc) : undefined;

  const paint = useCallback((pose: HoverTiltPose) => {
    const el = cardRef.current;
    if (!el) return;
    const maxTilt = recipeRef.current.maxTilt;
    const logicalX = Math.min(maxTilt, Math.max(-maxTilt, pose.rotateX));
    const logicalY = Math.min(maxTilt, Math.max(-maxTilt, pose.rotateY));
    const foilMag = Math.hypot(logicalX, logicalY);
    let rotateX = logicalX;
    let rotateY = logicalY;
    const stageSize = stageSizeRef.current;
    const cardW = cardMaxRef.current.w;
    const cardH = cardMaxRef.current.h;
    const tiltNowEarly = tiltRef.current ?? DEFAULT_HOVER_TILT_RECIPE;
    const activation = Math.min(1, Math.max(0, springARef.current.value));
    // The glare and the pop ease in with the opening. The foil does not: a
    // flat card already shows it at its floor.
    const open = openEase(openMsRef.current);
    const liveScale = hoverTiltScale(tiltNowEarly.scaleFactor, activation, open);
    if (stageSize.w > 0 && cardW > 0 && cardH > 0) {
      const clamped = clampTiltToBox({
        tiltX: rotateX,
        tiltY: rotateY,
        cardWidth: cardW * liveScale,
        cardHeight: cardH * liveScale,
        boxWidth: stageSize.w,
        boxHeight: stageSize.h,
        // The fit already holds the widest tilt this far inside, so this
        // only catches a stage that resized before the card refit.
        pad: PREVIEW_REST_PAD,
        camera: cameraRef.current,
      });
      rotateX = clamped.x;
      rotateY = clamped.y;
    }
    const capped = clampHypot(rotateX, rotateY, maxTilt);
    rotateX = capped.x;
    rotateY = capped.y;
    const pointerX = pose.pointerX;
    const pointerY = pose.pointerY;
    const nx = pose.nx;
    const ny = pose.ny;
    el.style.setProperty('--rotation-x', `${rotateX}deg`);
    el.style.setProperty('--rotation-y', `${rotateY}deg`);
    el.style.setProperty('--rotate-x', `${rotateY}deg`);
    el.style.setProperty('--rotate-y', `${rotateX}deg`);
    lastPoseRef.current = { rotateX: logicalX, rotateY: logicalY, pointerX, pointerY, nx, ny };
    el.style.setProperty('--pointer-x', `${pointerX}%`);
    el.style.setProperty('--pointer-y', `${pointerY}%`);
    el.style.setProperty('--pointer-from-center', Math.min(1, Math.hypot(pointerX - 50, pointerY - 50) / 50).toFixed(3));
    el.style.setProperty('--pointer-from-top', (pointerY / 100).toFixed(3));
    el.style.setProperty('--pointer-from-left', (pointerX / 100).toFixed(3));
    el.style.setProperty('--hover-tilt-x', nx.toFixed(4));
    el.style.setProperty('--hover-tilt-y', ny.toFixed(4));
    el.style.setProperty('--gradient-x', `${pointerX}%`);
    el.style.setProperty('--gradient-y', `${pointerY}%`);
    // poke-holo maps the pointer to 37-63% across and 33-67% down for the shine.
    el.style.setProperty('--background-x', `${(37 + pointerX * 0.26).toFixed(2)}%`);
    el.style.setProperty('--background-y', `${(33 + pointerY * 0.34).toFixed(2)}%`);
    const recipeNow = recipeRef.current;
    const tiltNow = tiltNowEarly;
    const span = Math.max(0.001, recipeNow.maxTilt - recipeNow.deadDeg);
    const tiltStrength =
      foilMag <= recipeNow.deadDeg ? 0 : Math.min(1, (foilMag - recipeNow.deadDeg) / span);
    const foil = activation * (0.45 + 0.55 * tiltStrength);
    el.style.setProperty('--foil-opacity', foil.toFixed(3));
    el.style.setProperty('--hover-tilt-opacity', (activation * open).toFixed(3));
    const angle = (Math.atan2(ny - 0.5, nx - 0.5) * 180) / Math.PI;
    el.style.setProperty('--hover-tilt-angle', `${angle.toFixed(1)}deg`);
    el.style.setProperty('--hover-tilt-from-center', Math.min(1, Math.hypot(nx - 0.5, ny - 0.5) / 0.5).toFixed(3));
    el.style.setProperty('--hover-tilt-at-edge', Math.min(1, Math.max(Math.abs(nx - 0.5), Math.abs(ny - 0.5)) * 2).toFixed(3));
    const shadow = hoverTiltShadow(nx, ny, activation);
    const shadowX = shadow.x;
    const shadowY = shadow.y;
    const shadowOn = tiltNow.shadow && tiltNow.shadowBlur > 0;
    const shadowAmt = shadowOn ? shadow.alpha : 0;
    el.style.setProperty('--shadow-x', shadowX.toFixed(4));
    el.style.setProperty('--shadow-y', shadowY.toFixed(4));
    el.style.setProperty('--hover-tilt-shadow-opacity', shadowAmt.toFixed(3));
    el.style.setProperty('--hover-tilt-scale', liveScale.toFixed(3));
    const hit = hitRef.current;
    if (hit) {
      // The card is laid out at its popped size, so tilt never enlarges a
      // raster: the lift scales down to rest and up to 1 while active.
      const pop = Math.max(1, tiltNow.scaleFactor);
      hit.style.setProperty('--rotation-x', `${rotateX}deg`);
      hit.style.setProperty('--rotation-y', `${rotateY}deg`);
      hit.style.setProperty('--hover-tilt-scale', liveScale.toFixed(3));
      hit.style.setProperty('--export-lift-scale', (liveScale / pop).toFixed(4));
      hit.style.setProperty('--export-lift-rest', (1 / pop).toFixed(4));
      hit.style.setProperty('--shadow-x', shadowX.toFixed(4));
      hit.style.setProperty('--shadow-y', shadowY.toFixed(4));
      hit.style.setProperty('--hover-tilt-shadow-opacity', shadowAmt.toFixed(3));
      // In layout px, which the lift's transform then scales back down.
      hit.style.setProperty('--hover-tilt-shadow-blur', String(Math.round(tiltNow.shadowBlur * pop)));
      hit.dataset.hoverTiltShadow = shadowOn ? '1' : '0';
      hit.setAttribute('data-shadow-x', shadowX.toFixed(2));
      hit.setAttribute('data-shadow-y', shadowY.toFixed(2));
      hit.setAttribute('data-shadow-opacity', shadowAmt.toFixed(3));
      hit.setAttribute('data-tilt-active', activation > 0.02 ? '1' : '0');
    }
    if (!el.style.getPropertyValue('--foil-pointLight')) {
      const vars = foilRecipeCssVars(recipeNow);
      for (const [key, value] of Object.entries(vars)) {
        el.style.setProperty(key, value);
      }
    }
    el.setAttribute('data-tilt-x', rotateX.toFixed(1));
    el.setAttribute('data-tilt-y', rotateY.toFixed(1));
    el.setAttribute('data-tilt-active', activation > 0.02 ? '1' : '0');
    el.setAttribute('data-tilt-scale', liveScale === 1 ? '1' : liveScale.toFixed(3));
    el.setAttribute('data-foil-opacity', foil.toFixed(3));
    el.setAttribute('data-paused', pausedRef.current ? '1' : '0');
    el.setAttribute('data-tilt-mode', modeRef.current);
    el.setAttribute('data-export-orbit', orbitRef.current);
    el.setAttribute('data-shadow-x', shadowX.toFixed(2));
    el.setAttribute('data-shadow-y', shadowY.toFixed(2));
  }, []);

  const idleAt = useCallback((now: number) => {
    const origin = originRef.current;
    // Reduced motion holds the card still. Activation still rises in idle, so
    // the foil stays on. Hover, drag, and tap are the user's own motion.
    if (reducedMotionRef.current || origin === null) return REST_POSE;
    const recipeNow = recipeRef.current;
    // The orbit radius grows with `open`, so auto-tilt starts flat and spirals out.
    return pokeHoloIdle({
      now,
      origin,
      idleMsX: recipeNow.idleMsX,
      idleMsY: recipeNow.idleMsY,
      idleTilt: recipeNow.idleTilt * openEase(openMsRef.current),
      axes: tiltAxes(tiltRef.current, recipeNow.maxTilt),
    });
  }, []);

  /** Unrotated box. The lift's transformed rect inverts left and right. */
  const restPointerBox = useCallback((): DOMRect | null => {
    const hit = hitRef.current;
    if (!hit || hit.offsetWidth <= 0) return null;
    const lift = hit.querySelector('[data-export-foil-lift]');
    const width = lift instanceof HTMLElement && lift.offsetWidth > 0 ? lift.offsetWidth : hit.clientWidth;
    const height = lift instanceof HTMLElement && lift.offsetHeight > 0 ? lift.offsetHeight : hit.clientHeight;
    const hitRect = hit.getBoundingClientRect();
    const scale = Number(getComputedStyle(hit).getPropertyValue('--export-lift-scale')) || 1;
    const visualW = width * scale;
    const visualH = height * scale;
    return new DOMRect(
      hitRect.left + (hit.offsetWidth - visualW) / 2,
      hitRect.top + (hit.offsetHeight - visualH) / 2,
      visualW,
      visualH,
    );
  }, []);

  const beginPointer = useCallback((clientX: number, clientY: number) => {
    const box = restPointerBox();
    if (!box || box.width === 0) return;
    const axes = tiltAxes(tiltRef.current, recipeRef.current.maxTilt);
    const pose = hoverTiltFromPointer(clientX, clientY, box, axes);
    // Start the springs at the tilt on screen, whatever drew it: auto-tilt,
    // a release, or rest.
    const last = lastPoseRef.current;
    const from = normalizedForTilt(last.rotateX, last.rotateY, axes);
    springXRef.current.value = from.nx;
    springYRef.current.value = from.ny;
    hoverTiltEnter(springXRef.current, springYRef.current, springARef.current, pose);
    pointerPoseRef.current = pose;
    pendingPointerRef.current = { x: clientX, y: clientY };
    orbitRef.current = 'pointer';
    restAtRef.current = null;
    releaseRef.current = null;
  }, [restPointerBox]);

  const schedulePointer = useCallback((clientX: number, clientY: number) => {
    pendingPointerRef.current = { x: clientX, y: clientY };
    scheduleHoverTiltFrame(moveFrameRef, () => {
      const pending = pendingPointerRef.current;
      if (!pending || orbitRef.current !== 'pointer') return;
      const box = restPointerBox();
      if (!box || box.width === 0) return;
      const pose = hoverTiltFromPointer(pending.x, pending.y, box, tiltAxes(tiltRef.current, recipeRef.current.maxTilt));
      hoverTiltPointerMove(springXRef.current, springYRef.current, springARef.current, pose);
      pointerPoseRef.current = pose;
    });
  }, [restPointerBox]);

  const beginRest = useCallback((now: number) => {
    if (orbitRef.current !== 'pointer') return;
    orbitRef.current = 'rest';
    const delay = tiltRef.current?.exitDelay ?? HOVER_TILT_EXIT_DELAY_MS;
    restAtRef.current = now + delay;
    pendingPointerRef.current = null;
    cancelHoverTiltFrame(moveFrameRef);
  }, []);

  const parkFlat = useCallback((now: number) => {
    modeRef.current = 'locked';
    pausedRef.current = true;
    orbitRef.current = 'paused';
    releaseRef.current = { from: { ...lastPoseRef.current }, t0: now };
    pendingPointerRef.current = null;
    restAtRef.current = null;
    enterSinceRef.current = null;
    lastPointerRef.current = null;
    cancelHoverTiltFrame(moveFrameRef);
    paint(lerpPose(releaseRef.current.from, REST_POSE, 0));
  }, [paint]);

  const resumeAuto = useCallback((now: number) => {
    modeRef.current = 'auto';
    pausedRef.current = false;
    orbitRef.current = 'idle';
    releaseRef.current = { from: { ...lastPoseRef.current }, t0: now };
    pendingPointerRef.current = null;
    restAtRef.current = null;
    enterSinceRef.current = null;
    if (originRef.current === null) originRef.current = now;
    paint(lerpPose(releaseRef.current.from, idleAt(now), 0));
  }, [idleAt, paint]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const apply = () => {
      const r = stage.getBoundingClientRect();
      stageSizeRef.current = { w: r.width, h: r.height };
      const img = imgRef.current;
      const aspect = img && img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 1;
      // Room for the widest tilt a pointer or auto-tilt can reach. A card
      // sized for more leans on clampTiltToBox, which jumps: the projected
      // card is tallest mid-tilt, so fitting is not monotonic in the angle.
      const fitFor = (fitCamera: PreviewCamera) =>
        fitCardInPreviewBox({
          boxWidth: r.width,
          boxHeight: r.height,
          aspect,
          tiltDeg: Math.max(recipeRef.current.idleTilt, recipeRef.current.maxTilt),
          pad: PREVIEW_REST_PAD,
          camera: fitCamera,
        });
      const room = fitFor(cameraRef.current);
      const want = sizeRef.current;
      const scale =
        want === 'room' ? 1 : Math.min(1, (fitFor(previewSizeCamera).width * want) / Math.max(1, room.width));
      const pop = Math.max(1, tiltRef.current?.scaleFactor ?? 1);
      const restW = (room.width * scale) / pop;
      const restH = (room.height * scale) / pop;
      cardMaxRef.current = { w: restW, h: restH };
      setCardMax((prev) => {
        if (Math.abs(prev.w - restW) < 1 && Math.abs(prev.h - restH) < 1) return prev;
        return { w: restW, h: restH };
      });
    };
    measureRef.current = apply;
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [activeSrc]);

  useEffect(() => {
    cardMaxRef.current = cardMax;
  }, [cardMax]);

  // The PNG rounds its corners to 4% of its short edge. A percentage
  // border-radius would be elliptical on a non-square card, so match in px.
  useLayoutEffect(() => {
    const img = imgRef.current;
    const hit = hitRef.current;
    if (!img || !hit) return;
    const sync = () => {
      if (img.offsetWidth <= 0 || img.offsetHeight <= 0) return;
      hit.style.setProperty('--export-card-radius', `${exportCornerRadius(img.offsetWidth, img.offsetHeight).toFixed(2)}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(img);
    return () => ro.disconnect();
  }, [activeSrc]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (reducedMotionRef.current === query.matches) return;
      reducedMotionRef.current = query.matches;
      // Ease into the new idle pose instead of jumping to it.
      if (orbitRef.current === 'idle' && !pausedRef.current) {
        releaseRef.current = { from: { ...lastPoseRef.current }, t0: performance.now() };
      }
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const lastTick = lastTickRef.current ?? now;
      const dt = now - lastTick;
      lastTickRef.current = now;
      // The opening starts once the card shows with its foil maps: the loop
      // runs while the preview renders, and building the maps stalls the main
      // thread right after the image loads. A card that first showed mid-orbit
      // would jump in at full tilt.
      if (openMsRef.current === null) {
        const maps = cardRef.current?.dataset.foilMaps;
        if (imgRef.current?.complete && (maps === '1' || maps === 'failed')) {
          openMsRef.current = 0;
          originRef.current ??= now;
        }
      } else if (openMsRef.current < PREVIEW_OPEN_MS) {
        openMsRef.current += Math.min(dt, PREVIEW_OPEN_STEP_MS);
      }
      if (orbitRef.current === 'pointer') {
        tickSpring(springXRef.current, dt);
        tickSpring(springYRef.current, dt);
        tickSpring(springARef.current, dt);
        paint(hoverTiltFromNormalized(springXRef.current.value, springYRef.current.value, tiltAxes(tiltRef.current, recipeRef.current.maxTilt)));
      } else if (orbitRef.current === 'rest') {
        const restAt = restAtRef.current;
        if (restAt !== null && now < restAt) {
          paint(lastPoseRef.current);
        } else {
          hoverTiltLeave(springXRef.current, springYRef.current, springARef.current);
          tickSpring(springXRef.current, dt);
          tickSpring(springYRef.current, dt);
          tickSpring(springARef.current, dt);
          paint(hoverTiltFromNormalized(springXRef.current.value, springYRef.current.value, tiltAxes(tiltRef.current, recipeRef.current.maxTilt)));
          if (
            springSettled(springXRef.current) &&
            springSettled(springYRef.current) &&
            springARef.current.value < 0.02
          ) {
            restAtRef.current = null;
            orbitRef.current = modeRef.current === 'auto' ? 'idle' : 'static';
            // Auto-tilt never passes through flat, so ease into it.
            if (orbitRef.current === 'idle') releaseRef.current = { from: REST_POSE, t0: now };
            paint(REST_POSE);
          }
        }
      } else if (pausedRef.current || modeRef.current !== 'auto') {
        orbitRef.current = pausedRef.current ? 'paused' : 'static';
        applySpringOpts(springARef.current, HOVER_TILT_EXIT_SPRING);
        springARef.current.target = 0;
        tickSpring(springARef.current, dt);
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
        applySpringOpts(springARef.current, HOVER_TILT_SPRING);
        springARef.current.target = 1;
        tickSpring(springARef.current, dt);
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

  useLayoutEffect(() => {
    recipeRef.current = recipe;
    tiltRef.current = tilt;
    cameraRef.current = camera;
    sizeRef.current = size;
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
    // On the hit, so the card and its shape shadow both inherit the outline.
    hitRef.current?.style.setProperty('--export-shape-mask', foilMaskCss(activeSrc ?? ''));
    el.style.setProperty('--foil-holo-blend', FOIL_HOLO_BLEND);
    el.dataset.hoverTiltShadow = tiltNow.shadow ? '1' : '0';
    el.dataset.hoverTilt = '1';
    el.dataset.maskSpriteCount = String(maskContext.sprites.length);
    el.dataset.maskSpriteTypes = hoverTiltMaskSpriteTypes(maskContext);
    const syncGlare = hoverTiltMaskPaint(tiltNow.glareMask, maskContext);
    const syncVars = hoverTiltMaskCssVars(syncGlare);
    for (const [key, value] of Object.entries(syncVars)) {
      el.style.setProperty(key, value);
    }
    let cancelled = false;
    void resolveHoverTiltMaskPaint(tiltNow.glareMask, maskContext).then((glare) => {
      if (cancelled || cardRef.current !== el) return;
      const maskVars = hoverTiltMaskCssVars(glare);
      for (const [key, value] of Object.entries(maskVars)) {
        el.style.setProperty(key, value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeSrc, camera, idleAt, maskContext, paint, recipe, size, tilt]);

  // The fit reserves room for the tilt, so a new extent, camera, or size refits the card.
  useLayoutEffect(() => {
    measureRef.current();
  }, [camera, recipe.idleTilt, recipe.maxTilt, size]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    delete el.dataset.foilMaps;
    delete el.dataset.foilMapSource;
    el.style.setProperty('--foil-sat-mask', 'none');
    el.style.setProperty('--foil-edge-mask', 'none');
    el.style.setProperty('--foil-gloss-mask', 'none');
  }, [activeSrc]);

  useEffect(() => {
    const el = cardRef.current;
    const img = imgRef.current;
    if (!el || !activeSrc) return;
    if (!needSat && !needEdge && !needGloss) {
      el.dataset.foilMaps = '1';
      el.dataset.foilMapSource = activeSrc;
      return;
    }
    let cancelled = false;
    let tries = 0;
    const apply = () => {
      if (cancelled) return;
      void foilMaskUrlsFromImage(activeSrc, { sat: needSat, edge: needEdge, gloss: needGloss })
        .then((maps) => {
          if (cancelled) return;
          const card = cardRef.current;
          if (!card) return;
          card.style.setProperty('--foil-sat-mask', foilMaskCss(maps.sat));
          card.style.setProperty('--foil-edge-mask', foilMaskCss(maps.edge));
          card.style.setProperty('--foil-gloss-mask', foilMaskCss(maps.gloss));
          card.dataset.foilMaps = '1';
          card.dataset.foilMapSource = activeSrc;
        })
        .catch(() => {
          if (cancelled) return;
          if (tries >= 6) {
            const card = cardRef.current;
            if (card) card.dataset.foilMaps = 'failed';
            return;
          }
          tries += 1;
          window.setTimeout(apply, 50);
        });
    };
    if (img?.complete && img.naturalWidth > 0) apply();
    else img?.addEventListener('load', apply);
    return () => {
      cancelled = true;
      img?.removeEventListener('load', apply);
    };
  }, [activeSrc, needSat, needEdge, needGloss]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && !downRef.current) return;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('[data-export-chrome] input, [data-export-chrome] select, [data-export-chrome] textarea')
      ) {
        return;
      }
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
      // A mouse already tilts by hover, so only a finger or pen drags the card.
      const dragging = e.pointerType !== 'mouse' && Boolean(down?.dragged || (down && e.buttons > 0));
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
        if (!last) {
          lastPointerRef.current = { x: e.clientX, y: e.clientY };
          return;
        }
        if (orbitRef.current !== 'pointer' && !pointerMovedFrom(last, e.clientX, e.clientY)) {
          return;
        }
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        const enterDelay = tiltRef.current?.enterDelay ?? 0;
        if (enterDelay > 0 && orbitRef.current !== 'pointer') {
          if (enterSinceRef.current === null) enterSinceRef.current = performance.now();
          if (performance.now() - enterSinceRef.current < enterDelay) return;
        }
        enterSinceRef.current = null;
        if (orbitRef.current !== 'pointer') {
          modeRef.current = 'hover';
          beginPointer(e.clientX, e.clientY);
        } else {
          schedulePointer(e.clientX, e.clientY);
        }
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
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Synthetic test events have no pointer capture. */
    }
    downRef.current = { t: performance.now(), x: e.clientX, y: e.clientY, dragged: false };
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const down = downRef.current;
    downRef.current = null;
    if (e.pointerType === 'mouse') {
      if (!down) return;
      pendingPointerRef.current = null;
      restAtRef.current = null;
      enterSinceRef.current = null;
      if (modeRef.current === 'locked') {
        // Unlock into hover tilt. The mouse is over the card, so it tilts now.
        modeRef.current = 'hover';
        pausedRef.current = false;
        releaseRef.current = null;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        beginPointer(e.clientX, e.clientY);
      } else {
        parkFlat(performance.now());
      }
      return;
    }
    const tap =
      !!down &&
      !down.dragged &&
      performance.now() - down.t < TAP_MS &&
      Math.hypot(e.clientX - down.x, e.clientY - down.y) <= TAP_PX;

    const now = performance.now();
    if (tap) {
      lastPointerRef.current = null;
      pendingPointerRef.current = null;
      restAtRef.current = null;
      enterSinceRef.current = null;
      if (pausedRef.current) resumeAuto(now);
      else parkFlat(now);
      return;
    }

    if (down?.dragged) {
      parkFlat(now);
      return;
    }

    if (down && !down.dragged) {
      if (orbitRef.current === 'pointer' && !pausedRef.current) beginRest(now);
      return;
    }

    if (orbitRef.current === 'pointer' && !pausedRef.current) beginRest(now);
  }, [beginPointer, beginRest, parkFlat, resumeAuto]);

  const onPointerCancel = useCallback(() => {
    const down = downRef.current;
    downRef.current = null;
    const now = performance.now();
    if (down?.dragged) {
      parkFlat(now);
      return;
    }
    if (orbitRef.current === 'pointer' && !pausedRef.current) beginRest(now);
  }, [beginRest, parkFlat]);

  const pop = Math.max(1, tilt?.scaleFactor ?? 1);
  const maxW = cardMax.w > 0 ? `${Math.round(cardMax.w * pop)}px` : '100%';
  const maxH = cardMax.h > 0 ? `${Math.round(cardMax.h * pop)}px` : '100%';
  // The lift is laid out at its popped size, so the camera scales with that.
  // Until the first measure, the stylesheet's default stands in.
  const perspectivePx =
    cardMax.w > 0 ? Math.round(camera(cardMax.w * pop, cardMax.h * pop)) : null;

  return (
    <div
      ref={stageRef}
      className={cn(
        'relative flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-visible',
        className,
      )}
    >
      {activeSrc ? (
        <div
          ref={hitRef}
          className="export-foil-hit pointer-events-auto cursor-pointer touch-none overflow-visible"
          style={
            {
              padding: PREVIEW_SHADOW_PAD_PX,
              ...(perspectivePx ? { '--export-perspective': `${perspectivePx}px` } : {}),
              '--export-lift-scale': 1 / pop,
              '--export-lift-rest': 1 / pop,
            } as React.CSSProperties
          }
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          data-export-tilt-hit
          data-export-shadow
          data-shadow-pad={String(PREVIEW_SHADOW_PAD_PX)}
          data-tilt-perspective={perspectivePx ? String(perspectivePx) : undefined}
          data-hover-tilt="1"
          data-hover-tilt-shadow="1"
          data-tilt-active="0"
          data-pointer-box="rest"
        >
          <div className="export-foil-lift" data-export-foil-lift>
          <div className="export-foil-shadow export-foil-shadow-far" aria-hidden data-export-shadow-layer="far" />
          <div className="export-foil-shadow export-foil-shadow-near" aria-hidden data-export-shadow-layer="near" />
          <div
            ref={cardRef}
            className="export-foil pointer-events-none min-h-0 min-w-0 cursor-pointer overflow-hidden bg-transparent select-none"
            style={{
              transformOrigin: 'center center',
              maxHeight: maxH,
              maxWidth: maxW,
              width: 'auto',
              height: 'auto',
            }}
            data-export-preview
            data-export-orbit="idle"
            data-tilt-scale="1"
            data-tilt-active="0"
            data-paused="0"
            data-hover-tilt="1"
            data-hover-tilt-shadow="1"
            data-hover-tilt-glare-mask={tilt.glareMask}
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
              data-export-frame={shownKey}
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
                data-holo-engine={id === 'holographic' ? shine : undefined}
              >
                {id === 'holographic' && shine === 'move' ? (
                  <>
                    <HoloShineParts />
                    <span className="export-foil-holo-cross">
                      <HoloShineParts />
                    </span>
                  </>
                ) : null}
              </div>
            ))}
          </div>
          </div>
        </div>
      ) : (
        busy ? (
          <div className="flex h-48 w-64 items-center justify-center opacity-70 md:h-64 md:w-80"
            role="status" aria-label={t('export.preview.rendering')} data-export-preview>
            <PokeBallSpinner delayed className="h-12 w-12" />
          </div>
        ) : (
          <div
            className="flex h-48 w-64 items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground md:h-64 md:w-80"
            data-export-preview
          >
            {t('export.preview.unavailable')}
          </div>
        )
      )}
    </div>
  );
}
