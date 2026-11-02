import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

export type CardZoom =
  | { kind: 'fit' }
  | { kind: 'zoomed'; zoom: number; windowPx: number };

interface Point {
  x: number;
  y: number;
}

interface Pinch {
  startZoom: number;
  startDistance: number;
  focus: Point;
  origin: Point;
  unit: number;
  zoom: number;
  mid: Point;
}

interface Settle {
  focus: Point;
  scale: number;
  mid: Point;
}

const FIT: CardZoom = { kind: 'fit' };
const ZOOM_RANGE = { mobile: { min: 1, max: 4 }, desktop: { min: 1, max: 2.5 } };
const MIN_KEPT_PINCH_ZOOM = 1.05;

function frameStyle(state: CardZoom): CSSProperties {
  // platform: `touch-action: pan-x pan-y` stops the browser pinch-zooming the page over the card, so this frame takes the pinch.
  if (state.kind === 'fit') return { touchAction: 'pan-x pan-y' };
  return {
    touchAction: 'pan-x pan-y',
    overflow: 'auto',
    overscrollBehavior: 'contain',
    maxHeight: state.windowPx,
  };
}

function windowHeight(frame: HTMLElement): number {
  const pane = frame.closest('[data-lg-viewport]');
  const top = frame.getBoundingClientRect().top;
  if (!(pane instanceof HTMLElement)) return Math.max(0, window.innerHeight - top);
  const box = pane.getBoundingClientRect();
  const paneTop = box.top + pane.clientTop;
  return Math.max(0, paneTop + pane.clientHeight - Math.max(top, paneTop));
}

export function useCardZoom(
  cardIndex: number,
  contentRef: RefObject<HTMLDivElement | null>,
  desktop: boolean,
) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [stored, setStored] = useState<{ cardIndex: number; zoom: CardZoom }>({ cardIndex, zoom: FIT });
  const state = stored.cardIndex === cardIndex ? stored.zoom : FIT;
  const zoom = state.kind === 'zoomed' ? state.zoom : 1;
  const live = useRef({ state, cardIndex });
  const settle = useRef<Settle | null>(null);
  useLayoutEffect(() => {
    live.current = { state, cardIndex };
  });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    const s = settle.current;
    if (!frame || !content || !s) return;
    settle.current = null;
    content.style.transform = '';
    content.style.transformOrigin = '';
    frame.style.overflow = frameStyle(state).overflow ?? '';
    const pane = frame.closest('[data-lg-viewport]');
    if (state.kind === 'zoomed' && pane instanceof HTMLElement) {
      const above = pane.getBoundingClientRect().top + pane.clientTop - frame.getBoundingClientRect().top;
      if (above > 0) pane.scrollTop -= above;
    }
    const box = content.getBoundingClientRect();
    const dx = box.left + s.focus.x * s.scale - s.mid.x;
    const dy = box.top + s.focus.y * s.scale - s.mid.y;
    if (state.kind === 'zoomed') {
      frame.scrollLeft += dx;
      frame.scrollTop += dy;
    } else if (pane instanceof HTMLElement) {
      pane.scrollTop += dy;
    }
  }, [state, contentRef]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    const range = desktop ? ZOOM_RANGE.desktop : ZOOM_RANGE.mobile;
    let pinch: Pinch | null = null;

    const pair = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return {
        mid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
        distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
      };
    };
    const begin = (touches: TouchList): Pinch => {
      const { mid, distance } = pair(touches);
      const { state: now } = live.current;
      const startZoom = now.kind === 'zoomed' ? now.zoom : 1;
      const box = content.getBoundingClientRect();
      // platform: A scroller clamps its scroll to content that shrinks under a transform, so the frame clips while a pinch transforms the content.
      frame.style.overflow = 'clip';
      const clipped = content.getBoundingClientRect();
      content.style.transformOrigin = '0 0';
      pinch = {
        startZoom,
        startDistance: distance,
        focus: { x: mid.x - box.left, y: mid.y - box.top },
        origin: { x: clipped.left, y: clipped.top },
        unit: content.offsetWidth > 0 ? clipped.width / content.offsetWidth : 1,
        zoom: startZoom,
        mid,
      };
      return pinch;
    };
    const draw = (p: Pinch) => {
      const s = p.zoom / p.startZoom;
      const x = (p.mid.x - p.origin.x - p.focus.x * s) / p.unit;
      const y = (p.mid.y - p.origin.y - p.focus.y * s) / p.unit;
      content.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    };
    const commit = (p: Pinch) => {
      const zoomed = p.zoom >= MIN_KEPT_PINCH_ZOOM;
      const next: CardZoom = zoomed
        ? { kind: 'zoomed', zoom: p.zoom, windowPx: windowHeight(frame) }
        : { kind: 'fit' };
      settle.current = { focus: p.focus, scale: (zoomed ? p.zoom : 1) / p.startZoom, mid: p.mid };
      setStored({ cardIndex: live.current.cardIndex, zoom: next });
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      if (event.cancelable) event.preventDefault();
      if (!pinch) begin(event.touches);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      if (event.cancelable) event.preventDefault();
      const p = pinch ?? begin(event.touches);
      const { mid, distance } = pair(event.touches);
      p.zoom = Math.max(range.min, Math.min(range.max, p.startZoom * distance / p.startDistance));
      p.mid = mid;
      draw(p);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!pinch || event.touches.length >= 2) return;
      commit(pinch);
      pinch = null;
    };
    // platform: iOS reports a touch pinch as gesture events too and zooms the page unless they are cancelled.
    const onGesture = (event: Event) => {
      if (pinch) event.preventDefault();
    };

    const active = { passive: false };
    frame.addEventListener('touchstart', onTouchStart, active);
    frame.addEventListener('touchmove', onTouchMove, active);
    frame.addEventListener('touchend', onTouchEnd);
    frame.addEventListener('touchcancel', onTouchEnd);
    frame.addEventListener('gesturestart', onGesture, active);
    frame.addEventListener('gesturechange', onGesture, active);
    frame.addEventListener('gestureend', onGesture, active);
    return () => {
      frame.removeEventListener('touchstart', onTouchStart);
      frame.removeEventListener('touchmove', onTouchMove);
      frame.removeEventListener('touchend', onTouchEnd);
      frame.removeEventListener('touchcancel', onTouchEnd);
      frame.removeEventListener('gesturestart', onGesture);
      frame.removeEventListener('gesturechange', onGesture);
      frame.removeEventListener('gestureend', onGesture);
      if (pinch) {
        content.style.transform = '';
        content.style.transformOrigin = '';
        frame.style.overflow = frameStyle(live.current.state).overflow ?? '';
      }
    };
  }, [contentRef, desktop]);

  const zoomed = state.kind === 'zoomed';
  useLayoutEffect(() => {
    if (!zoomed) return;
    const onResize = () => {
      const frame = frameRef.current;
      if (!frame) return;
      const windowPx = windowHeight(frame);
      setStored((prev) => prev.zoom.kind === 'zoomed' && Math.abs(prev.zoom.windowPx - windowPx) > 0.5
        ? { ...prev, zoom: { ...prev.zoom, windowPx } }
        : prev);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [zoomed]);

  return {
    zoom,
    frameProps: {
      ref: frameRef,
      style: frameStyle(state),
      'data-testid': 'card-zoom-frame',
      'data-card-zoom': String(Math.round(zoom * 1000) / 1000),
    },
  };
}
