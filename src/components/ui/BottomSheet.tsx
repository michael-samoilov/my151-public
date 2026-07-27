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

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
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
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}
