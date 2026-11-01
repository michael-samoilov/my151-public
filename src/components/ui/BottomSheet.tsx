import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SheetKeyboardContext } from './sheetKeyboard';
import { SheetCloseGuardContext, type SheetCloseGuard, type SheetCloseVia } from './sheetCloseGuard';
import { isFlick } from './flick';

const DISMISS_THRESHOLD = 120;

// A finger held still drifts a few pixels in no set direction. Below this
// distance a touch has no axis yet.
const AXIS_SLOP_PX = 10;

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
  children: React.ReactNode;
}

/**
 * The app's mobile bottom sheet: backdrop, rounded top, grab handle, and
 * drag-down-to-dismiss. Mobile-only (`md:hidden`) because every current caller
 * shows something else entirely at desktop widths — a side pane or a dropdown —
 * rather than the same sheet scaled up.
 *
 * Extracted from two near-identical copies (the builder's selection sheet and
 * the View settings sheet) that had drifted apart: only one handled Escape, and
 * only one exposed an accessible name for the handle. Both now get the better
 * of the two.
 *
 * Deliberately not `aria-modal`: that promises the rest of the page is inert,
 * which needs a focus trap this does not implement. `role="dialog"` plus
 * Escape and a labelled control is what is actually true here.
 */
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
  children,
}: BottomSheetProps) {
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const dragStartAt = useRef(0);
  const isDragging = useRef(false);

  const closeGuard = useRef<SheetCloseGuard | null>(null);
  const setCloseGuard = useCallback((guard: SheetCloseGuard | null) => {
    closeGuard.current = guard;
  }, []);
  const requestClose = useCallback((via: SheetCloseVia) => {
    if (closeGuard.current?.(via)) return false;
    onClose();
    return true;
  }, [onClose]);

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
    const closed = (dragY > DISMISS_THRESHOLD || flicked) && requestClose('swipe');
    if (!closed) setDragY(0);
    dragStartY.current = null;
    isDragging.current = false;
  }, [dragY, requestClose]);

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

  /**
   * Stop the app behind the sheet from scrolling.
   *
   * The symptom was one bug and the cause was two, which is why the first fix
   * appeared to do nothing and got briefly thrown away.
   *
   * **A hand-rolled scroll in `App.tsx`.** It forwards wheel events from the
   * whitespace flanking the centred build page into that page's scroll
   * container by assigning `scrollTop` directly. The sheet is `position: fixed`
   * and so looks detached, but it is still a DOM descendant of that area, so
   * its gestures were being forwarded. `preventDefault` cannot stop a handler
   * that scrolls something by hand, so that one has to opt out by target — see
   * `data-overlay` on the overlay below.
   *
   * **The browser's own scroll.** With that forwarder fixed, a wheel over the
   * overlay still scrolled the pane natively, because Chromium has promoted it
   * to the implicit root scroller and a fixed overlay's scroll chain ends at
   * the viewport. That is what this listener is for. It only became visible
   * once the first cause was gone — before that the forwarder was moving the
   * page first, which made this look ineffective.
   *
   * Neither fix is sufficient alone; removing either one fails
   * `e2e/sheet-behaviour.spec.ts`, and they fail it in different projects.
   *
   * On `document` in the capture phase rather than on the overlay, because the
   * pane is the overlay's DOM *sibling* — cancelling on the overlay's own
   * branch never reaches it. Registered natively rather than through React's
   * `onWheel`/`onTouchMove`, which are passive, where `preventDefault()` is
   * silently ignored. The sheet's own scrollable content is exempted so a long
   * form still scrolls.
   */
  const overlayRef = useRef<HTMLDivElement>(null);

  /**
   * Keep the sheet above the on-screen keyboard.
   *
   * `position: fixed` anchors to the *layout* viewport, which does not shrink
   * when the keyboard opens, so a bottom-anchored sheet keeps its bottom edge
   * underneath it. With the feedback form that hid the tail of the textarea,
   * the "what gets sent" disclosure and the submit button — on the one surface
   * whose whole purpose is typing into it. `100dvh` does not help: it accounts
   * for browser chrome, not for the keyboard.
   *
   * The visual viewport is the only thing that reports the keyboard, so this is
   * a deliberate exception to the rule in `layoutFontSize.ts` and
   * `usePixelPerfectSprite.ts` that this app does not listen to it. Both of
   * those avoid it because it fires on every frame of a pinch-zoom, and that
   * reason is respected rather than overridden: updates are ignored while
   * `scale` is not 1, so a pinch changes nothing here, and the listener only
   * exists while a sheet is open rather than for the life of the page.
   */
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const [textFocus, setTextFocus] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      // A pinch is not a keyboard. Leaving the sheet alone during one also
      // keeps this off the per-frame path those other modules warn about.
      //
      // Compared with a tolerance, not with `!== 1`. Chromium reports exactly 1
      // and iOS Safari does not: it routinely hands back 0.9999999 and similar,
      // so an exact test bails on every sync and the sheet never learns the
      // keyboard is there. That is precisely the bug this block was written to
      // fix, and it survived because the test runs on the engine that reports
      // the tidy number.
      if (Math.abs(vv.scale - 1) > 0.05) return;
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

  /**
   * Leaving the field collapses the sheet again, but never under a press.
   *
   * What takes focus off the field is usually a press on another control in
   * the same sheet: a category chip, a move in the TM list, a disclosure.
   * Focus moves at `mousedown`, so collapsing on `blur` pulled that control out
   * from under the pointer before the release. The release then landed on
   * whatever had taken its place, and the click went nowhere.
   *
   * So the collapse waits until nothing is pressed, and then one frame more.
   * A release and the click it produces are dispatched in the same task, and a
   * frame callback only runs after that task. Compatibility mouse events count
   * as a press as well, because a touch tap releases its pointer first and only
   * then moves focus, on the `mousedown` the browser synthesizes after it.
   *
   * Focus arriving in a field before that frame cancels the collapse. That is
   * also why moving from one field to the next never collapses at all: the
   * `focus` follows the `blur` in the same task.
   */
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
        // A touch that moves while text in the sheet is selected can be a
        // drag of a selection handle. iOS WebKit drops that drag when the
        // page cancels its touchmove, so the handle froze after a long press
        // had made the selection. Most handle drags run sideways along a line,
        // where no scroller takes them, so this walk cancelled them all.
        const selection = document.getSelection();
        if (selection && !selection.isCollapsed && overlay.contains(selection.focusNode)) return;
        // On a press-and-hold of a list's scroll thumb, the first move is
        // that drift. A sideways guess cancelled it, and iOS then froze the
        // thumb drag that followed.
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

  /*
   * Portalled to the body, and that is the sheet's own job rather than each
   * caller's.
   *
   * A `position: fixed` element anchors to the viewport only while no
   * ancestor is transformed; a transformed one becomes its containing block
   * instead. The league builder's mobile shell is exactly that — two panes on
   * one 200%-wide track that the camera translates — so a sheet opened from
   * inside it laid itself out against the track: 780px wide on a 390px phone,
   * and pushed far enough down that its last line fell off the screen.
   *
   * Every caller could portal its own sheet, and two of them did. This is the
   * version that cannot be got wrong: the sheet leaves the tree itself, so no
   * ancestor a caller happens to sit under can move it. React context still
   * reaches through, which is what `SheetKeyboardContext` needs.
   */
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
          className="pointer-events-auto absolute inset-0 bg-black/50"
          onClick={() => requestClose('scrim')}
          style={{ opacity: Math.max(0, 1 - dragY / (DISMISS_THRESHOLD * 3)) }}
        />
      )}
      <div
        role="dialog"
        aria-label={dialogLabel ?? closeLabel}
        data-export-chrome={exportChrome ? '' : undefined}
        className="relative flex max-h-full min-h-0 flex-col rounded-t-2xl bg-background shadow-2xl pointer-events-auto"
        data-sheet-keyboard={keyboardOpen ? '' : undefined}
        style={{
          // `100dvh` accounts for browser chrome but not the keyboard, so the
          // visible height wins whenever the visual viewport has reported one.
          //
          // A keyboard also switches a 'content'-sized sheet to a definite
          // height. That is what lets a form inside it lay itself out to the
          // space available — a percentage height needs a definite ancestor, and
          // with `maxHeight` alone the chain stays `auto` and the form can only
          // overflow and scroll, which is the fold the tail was hiding behind.
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
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none',
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
