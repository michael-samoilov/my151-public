import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SheetKeyboardContext } from './sheetKeyboard';
import { SheetCloseGuardContext, type SheetCloseGuard, type SheetCloseVia } from './sheetCloseGuard';
import { isFlick } from './flick';
import './sheetMotion.css';

const DISMISS_THRESHOLD = 120;

const AXIS_SLOP_PX = 10;
const UNZOOMED_SCALE_TOLERANCE = 0.05;

type Axis = 'x' | 'y' | 'either';

interface BottomSheetProps {
  onClose: () => void;
  onHeaderClick?: () => void;
  headerLabel?: string;
  title: React.ReactNode;
  headerAccessory?: React.ReactNode;
  closeLabel: string;
  dialogLabel?: string;
  size?: 'full' | 'content';
  topGap?: number;
  layerZIndex?: number;
  showScrim?: boolean;
  exportChrome?: boolean;
  capHeightPx?: number;
  fitContent?: boolean;
  instant?: boolean;
  children: React.ReactNode;
}

// platform: aria-modal promises an inert page, which needs a focus trap, so the sheet uses role dialog without aria-modal.
export function BottomSheet({
  onClose,
  onHeaderClick,
  headerLabel,
  title,
  headerAccessory,
  closeLabel,
  dialogLabel,
  size = 'content',
  topGap = 56,
  layerZIndex = 110,
  showScrim = true,
  exportChrome = false,
  capHeightPx,
  fitContent = false,
  instant = false,
  children,
}: BottomSheetProps) {
  const [dragY, setDragY] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const dragStartAt = useRef(0);
  const isDragging = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeGuard = useRef<SheetCloseGuard | null>(null);
  const setCloseGuard = useCallback((guard: SheetCloseGuard | null) => {
    closeGuard.current = guard;
  }, []);
  const requestClose = useCallback((via: SheetCloseVia) => {
    if (leaving) return true;
    if (closeGuard.current?.(via)) return false;
    onClose();
    return true;
  }, [leaving, onClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragStartAt.current = performance.now();
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) {
      isDragging.current = true;
      setDragY(dy);
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const flicked = isFlick(dragY, performance.now() - dragStartAt.current);
    dragStartY.current = null;
    isDragging.current = false;
    if (!(dragY > DISMISS_THRESHOLD || flicked) || closeGuard.current?.('swipe')) {
      setDragY(0);
    } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
    } else {
      setLeaving(true);
    }
  }, [dragY, onClose]);

  // platform: Browsers can skip transitionend in a hidden tab or after an interrupted transition, so a timer also closes the sheet.
  useEffect(() => {
    if (!leaving) return;
    const el = dialogRef.current;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onClose();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'transform') finish();
    };
    el?.addEventListener('transitionend', onEnd);
    const timer = setTimeout(finish, 250);
    return () => {
      el?.removeEventListener('transitionend', onEnd);
      clearTimeout(timer);
    };
  }, [leaving, onClose]);

  const handleTap = useCallback(() => {
    if (isDragging.current) return;
    if (onHeaderClick) onHeaderClick();
    else requestClose('handle');
  }, [onHeaderClick, requestClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose('escape');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // platform: Chromium makes the pane the implicit root scroller, and a fixed overlay's scroll chain ends at the viewport.
  // platform: React registers onWheel and onTouchMove as passive, so preventDefault needs a native capture listener on document.
  const overlayRef = useRef<HTMLDivElement>(null);

  // platform: position fixed and 100dvh ignore the on-screen keyboard; only the visual viewport reports it.
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const [textFocus, setTextFocus] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      // platform: iOS Safari reports an unzoomed visualViewport.scale as values such as 0.9999999, not exactly 1.
      if (Math.abs(vv.scale - 1) > UNZOOMED_SCALE_TOLERANCE) return;
      setViewport({ height: vv.height, top: vv.offsetTop });
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    const onFocus = () => {
      requestAnimationFrame(sync);
      setTimeout(sync, 300);
    };
    window.addEventListener('focusin', onFocus);
    window.addEventListener('resize', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('focusin', onFocus);
      window.removeEventListener('resize', sync);
    };
  }, []);

  // platform: Focus moves at mousedown, a release and its click share one task, and a touch tap synthesizes mousedown after pointerup.
  const collapsePending = useRef(false);
  const pressing = useRef(false);
  const collapseFrame = useRef(0);
  const collapseAfterPress = useCallback(() => {
    cancelAnimationFrame(collapseFrame.current);
    if (!collapsePending.current || pressing.current) return;
    collapseFrame.current = requestAnimationFrame(() => {
      if (!collapsePending.current || pressing.current) return;
      collapsePending.current = false;
      setTextFocus(false);
    });
  }, []);
  useEffect(() => {
    const press = () => {
      pressing.current = true;
    };
    const release = () => {
      pressing.current = false;
      collapseAfterPress();
    };
    const opts = { capture: true } as const;
    document.addEventListener('pointerdown', press, opts);
    document.addEventListener('mousedown', press, opts);
    document.addEventListener('pointerup', release, opts);
    document.addEventListener('pointercancel', release, opts);
    document.addEventListener('mouseup', release, opts);
    return () => {
      document.removeEventListener('pointerdown', press, opts);
      document.removeEventListener('mousedown', press, opts);
      document.removeEventListener('pointerup', release, opts);
      document.removeEventListener('pointercancel', release, opts);
      document.removeEventListener('mouseup', release, opts);
      cancelAnimationFrame(collapseFrame.current);
    };
  }, [collapseAfterPress]);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    };

    const scrollsOnAxis = (n: HTMLElement, axis: Axis) => {
      const cs = getComputedStyle(n);
      const x = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && n.scrollWidth > n.clientWidth;
      const y = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && n.scrollHeight > n.clientHeight;
      return axis === 'x' ? x : axis === 'y' ? y : x || y;
    };

    const swallow = (e: Event) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const target = e.target;
      if (target instanceof Element) {
        const owner = target.closest('input, select, textarea');
        if (owner instanceof HTMLElement && overlay.contains(owner)) return;
      }

      let axis: Axis;
      if (e.type === 'wheel') {
        const we = e as WheelEvent;
        axis = Math.abs(we.deltaX) > Math.abs(we.deltaY) ? 'x' : 'y';
      } else {
        const t = (e as TouchEvent).touches[0];
        if (!t) return;
        // platform: iOS WebKit drops a selection-handle drag when the page cancels its touchmove.
        const selection = document.getSelection();
        if (selection && !selection.isCollapsed && overlay.contains(selection.focusNode)) return;
        // platform: iOS freezes a scroll-thumb drag when the page cancels its first touchmove.
        const dx = Math.abs(t.clientX - startX);
        const dy = Math.abs(t.clientY - startY);
        axis = Math.max(dx, dy) < AXIS_SLOP_PX ? 'either' : dx > dy ? 'x' : 'y';
      }

      for (let n = e.target as Node | null; n && n !== overlay; n = n.parentElement) {
        if (!(n instanceof HTMLElement)) continue;
        if (scrollsOnAxis(n, axis)) return;
      }
      e.preventDefault();
    };
    const opts = { passive: false, capture: true } as const;
    document.addEventListener('touchstart', onStart, { passive: true, capture: true });
    document.addEventListener('wheel', swallow, opts);
    document.addEventListener('touchmove', swallow, opts);
    return () => {
      document.removeEventListener('touchstart', onStart, { capture: true });
      document.removeEventListener('wheel', swallow, opts);
      document.removeEventListener('touchmove', swallow, opts);
    };
  }, []);

  const keyboardOpen =
    textFocus || (viewport !== null && viewport.height < window.innerHeight - 80);
  const gap = keyboardOpen ? Math.min(topGap, 8) : topGap;
  const viewportMax = viewport ? Math.max(0, viewport.height - gap) : null;
  const maxHeightPx =
    capHeightPx != null && viewportMax != null
      ? Math.min(viewportMax, capHeightPx)
      : capHeightPx ?? viewportMax;

  // platform: A transformed ancestor becomes the containing block of a position fixed element, so the sheet portals to the body.
  return createPortal(
    <div
      ref={overlayRef}
      data-overlay
      className="pointer-events-none fixed inset-x-0 z-[110] flex flex-col justify-end md:hidden"
      onFocusCapture={(e) => {
        const t = e.target;
        if (t instanceof HTMLTextAreaElement
          || (t instanceof HTMLInputElement && t.type !== 'checkbox' && t.type !== 'radio')) {
          collapsePending.current = false;
          setTextFocus(true);
        }
      }}
      onBlurCapture={() => {
        collapsePending.current = true;
        collapseAfterPress();
      }}
      style={
        viewport
          ?

            { zIndex: layerZIndex, top: `${viewport.top}px`, height: `${viewport.height}px` }
          : { zIndex: layerZIndex, top: 0, bottom: 0 }
      }
    >
      {showScrim && (
        <div
          className={`pointer-events-auto absolute inset-0 bg-black/50${instant ? '' : ' scrim-fade-in'}`}
          onClick={() => requestClose('scrim')}
          style={{
            opacity: leaving ? 0 : Math.max(0, 1 - dragY / (DISMISS_THRESHOLD * 3)),
            transition: leaving ? 'opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)' : undefined,
          }}
        />
      )}
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={dialogLabel ?? closeLabel}
        data-export-chrome={exportChrome ? '' : undefined}
        className={`relative flex max-h-full min-h-0 flex-col rounded-t-2xl bg-background shadow-2xl pointer-events-auto${
          instant ? '' : ' sheet-rise-in'
        }`}
        data-sheet-keyboard={keyboardOpen ? '' : undefined}
        style={{
          // platform: 100dvh ignores the on-screen keyboard, and a percentage height needs an ancestor with a definite height.
          height:
            exportChrome && !fitContent && maxHeightPx != null
              ? `${maxHeightPx}px`
              : size === 'full' || keyboardOpen
                ? `calc(100% - ${gap}px)`
                : undefined,
          maxHeight:
            maxHeightPx != null
              ? `${maxHeightPx}px`
              : viewport
                ? `${Math.max(0, viewport.height - gap)}px`
                : `calc(100dvh - ${gap}px)`,
          transform: leaving ? 'translateY(100%)' : `translateY(${dragY}px)`,
          transition: leaving
            ? 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)'
            : dragY === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
      >
        <div className="relative shrink-0" data-testid="bottom-sheet-header-frame">
          <button
            type="button"
            data-testid="bottom-sheet-header"
            aria-label={headerLabel ?? closeLabel}
            className={`w-full flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none ${
              keyboardOpen ? 'py-1.5' : 'py-3'
            }`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={handleTap}
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-1" />
            <span className="w-full text-sm font-semibold">{title}</span>
          </button>
          {headerAccessory ? (
            <div className={`absolute right-2 z-10 flex items-center ${keyboardOpen ? 'top-3.5 bottom-1.5' : 'top-5 bottom-3'}`}>
              {headerAccessory}
            </div>
          ) : null}
        </div>
        <div className="border-b" />
        <div
          className={
            exportChrome
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
              : 'min-h-0 flex-1 overflow-y-auto overscroll-contain'
          }
        >
          <SheetCloseGuardContext.Provider value={setCloseGuard}>
            <SheetKeyboardContext.Provider value={keyboardOpen}>{children}</SheetKeyboardContext.Provider>
          </SheetCloseGuardContext.Provider>
        </div>
      </div>
    </div>,
    document.body,
  );
}
