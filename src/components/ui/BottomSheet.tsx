import { useCallback, useEffect, useRef, useState } from 'react';

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
  useEffect(() => {
    const swallow = (e: Event) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      for (let n = e.target as Node | null; n && n !== overlay; n = n.parentElement) {
        if (!(n instanceof HTMLElement)) continue;
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return;
      }
      e.preventDefault();
    };
    const opts = { passive: false, capture: true } as const;
    document.addEventListener('wheel', swallow, opts);
    document.addEventListener('touchmove', swallow, opts);
    return () => {
      document.removeEventListener('wheel', swallow, opts);
      document.removeEventListener('touchmove', swallow, opts);
    };
  }, []);

  return (
    <div ref={overlayRef} data-overlay className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
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
          height: size === 'full' ? `calc(100dvh - ${topGap}px)` : undefined,
          maxHeight: `calc(100dvh - ${topGap}px)`,
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
      >
        {/* Grab handle — drag down or tap to close. Min 44px touch target per Apple HIG. */}
        <button
          type="button"
          aria-label={closeLabel}
          className="w-full flex flex-col items-center justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
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
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
