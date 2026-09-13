import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SheetKeyboardContext } from './sheetKeyboard';

/** px drag distance past which the release dismisses the sheet. */
const DISMISS_THRESHOLD = 120;

interface BottomSheetProps {
  onClose: () => void;
  /** Header content beside the grab handle. Rich nodes are fine. */
  title: React.ReactNode;
  /** Accessible name for the grab-handle button, which also closes on tap. */
  closeLabel: string;
  /**
   * 'full' fills the viewport below `topGap`; 'content' sizes to its content
   * and only caps at that height. Either way the header stays on-screen — a
   * bottom-anchored fixed height pushes it up behind the mobile browser chrome.
   */
  size?: 'full' | 'content';
  /** px left below the viewport top so the grab handle is always reachable. */
  topGap?: number;
  /** Stacking order for the portalled overlay. Default 50. */
  layerZIndex?: number;
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
  title,
  closeLabel,
  size = 'content',
  topGap = 56,
  layerZIndex = 50,
  children,
}: BottomSheetProps) {
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    // Downward only, and swallow the gesture so it can't pull-to-refresh.
    if (dy > 0) {
      isDragging.current = true;
      setDragY(dy);
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragY > DISMISS_THRESHOLD) onClose();
    else setDragY(0);
    dragStartY.current = null;
    isDragging.current = false;
  }, [dragY, onClose]);

  // Tap-to-close, but not as the tail of a drag gesture.
  const handleTap = useCallback(() => {
    if (!isDragging.current) onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    // iOS does not always fire a visualViewport event for a keyboard raised by
    // an autofocus, so the focus itself is a second trigger. Deferred a frame
    // because the keyboard animates in and the height is wrong until it lands.
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
  useEffect(() => {
    // Where the current touch began, so a touchmove can be classified as a
    // horizontal or a vertical gesture. A wheel event carries its own deltas
    // and needs no history.
    let startX = 0;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    };

    /** Can this element scroll along the axis the gesture is moving? */
    const scrollsOnAxis = (n: HTMLElement, horizontal: boolean) => {
      const cs = getComputedStyle(n);
      return horizontal
        ? (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && n.scrollWidth > n.clientWidth
        : (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && n.scrollHeight > n.clientHeight;
    };

    // Keeps the page behind the sheet still: a gesture that no scroller inside
    // the sheet can consume would otherwise chain through to the document.
    // The axis matters. Testing overflowY alone blocked sideways panning of
    // the filter chip rows, which scroll on X and have nothing to scroll on Y,
    // so the walk found no taker and swallowed the gesture.
    const swallow = (e: Event) => {
      const overlay = overlayRef.current;
      if (!overlay) return;

      let horizontal: boolean;
      if (e.type === 'wheel') {
        const we = e as WheelEvent;
        horizontal = Math.abs(we.deltaX) > Math.abs(we.deltaY);
      } else {
        const t = (e as TouchEvent).touches[0];
        if (!t) return;
        horizontal = Math.abs(t.clientX - startX) > Math.abs(t.clientY - startY);
      }

      for (let n = e.target as Node | null; n && n !== overlay; n = n.parentElement) {
        if (!(n instanceof HTMLElement)) continue;
        if (scrollsOnAxis(n, horizontal)) return;
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

  /**
   * The gap above the sheet exists so the grab handle stays clear of the
   * browser chrome. With a keyboard open there is nothing to spend it on: every
   * pixel between the chrome and the keyboard is form, and holding 56 of them
   * empty is what pushed the disclosure and the submit button below the fold
   * even after the sheet itself stopped hiding behind the keyboard.
   *
   * `innerHeight` is the layout viewport, which iOS does not shrink for the
   * keyboard, so the difference between the two *is* the keyboard. 80px of
   * slack keeps browser-chrome collapse from reading as one.
   */
  const keyboardOpen = viewport !== null && viewport.height < window.innerHeight - 80;
  const gap = keyboardOpen ? Math.min(topGap, 8) : topGap;

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
      className="fixed inset-x-0 flex flex-col justify-end md:hidden"
      // Bounded to the visible area rather than `inset-0`, so "the bottom" is
      // the top of the keyboard when one is open and the bottom of the screen
      // when it is not.
      style={
        viewport
          ? // `top`, not a transform. A transform on a `position: fixed`
            // element is a long-standing iOS Safari minefield — it can promote
            // the element to a layer positioned against the document rather
            // than the viewport, which is the opposite of what is wanted here.
            { zIndex: layerZIndex, top: `${viewport.top}px`, height: `${viewport.height}px` }
          : { zIndex: layerZIndex, top: 0, bottom: 0 }
      }
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        style={{ opacity: Math.max(0, 1 - dragY / (DISMISS_THRESHOLD * 3)) }}
      />
      <div
        role="dialog"
        aria-label={closeLabel}
        className="relative bg-background rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          // `100dvh` accounts for browser chrome but not the keyboard, so the
          // visible height wins whenever the visual viewport has reported one.
          //
          // A keyboard also switches a 'content'-sized sheet to a definite
          // height. That is what lets a form inside it lay itself out to the
          // space available — a percentage height needs a definite ancestor, and
          // with `maxHeight` alone the chain stays `auto` and the form can only
          // overflow and scroll, which is the fold the tail was hiding behind.
          height: size === 'full' || keyboardOpen ? `calc(100% - ${gap}px)` : undefined,
          maxHeight: viewport ? `${Math.max(0, viewport.height - gap)}px` : `calc(100dvh - ${gap}px)`,
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
      >
        {/* Grab handle — drag down or tap to close. Min 44px touch target per
            Apple HIG, which is why the padding tightens rather than collapses
            when a keyboard is open: the header is still something to aim at,
            just not something to spend 24px of a third of a screen on. */}
        <button
          type="button"
          aria-label={closeLabel}
          className={`w-full flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none ${
            keyboardOpen ? 'py-1.5' : 'py-3'
          }`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleTap}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-1" />
          <span className="text-sm font-semibold">{title}</span>
        </button>
        <div className="border-b" />
        {/* Its own scroll container: a long form scrolls here, and
            `overscroll-contain` stops that scroll continuing into the app once
            it reaches an end. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <SheetKeyboardContext.Provider value={keyboardOpen}>{children}</SheetKeyboardContext.Provider>
        </div>
      </div>
    </div>,
    document.body,
  );
}
