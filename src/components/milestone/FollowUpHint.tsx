import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * A small arrow-popup that floats in pointing at a specific on-page control —
 * a follow-up to a milestone celebration whose CTA lands the user on a page
 * where the promised feature is one more tap away (behind a settings panel,
 * a toolbar icon, etc). Clears itself the moment `fulfilled` flips true — the
 * user's own interaction with the target IS the hint's purpose — or when
 * dismissed directly.
 */

const AUTO_DISMISS_MS = 10000;
const CARD_W = 244;
const REVEAL_DELAY_MS = 260;

export function FollowUpHint({
  armed,
  dismiss,
  fulfilled,
  anchorRef,
  title,
  body,
  onShown,
}: {
  armed: boolean;
  dismiss: () => void;
  /** Flips true once the user has done the thing the hint points at (opened
   *  the settings pane, clicked export, ...) — dismisses the hint in response. */
  fulfilled: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  body: string;
  /** Called each time the hint appears on screen, for a "shown" beacon. Pass a
   *  stable function, or it runs again on every render. */
  onShown?: () => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (fulfilled) dismiss();
  }, [fulfilled, dismiss]);

  // Small delay so it floats in gracefully once the page has actually
  // settled, rather than popping in the instant the CTA navigates.
  const [armedReady, setArmedReady] = useState(false);
  useEffect(() => {
    if (!armed) return; // hidden state resets via the cleanup below
    const t = setTimeout(() => setArmedReady(true), REVEAL_DELAY_MS);
    return () => {
      clearTimeout(t);
      setArmedReady(false);
    };
  }, [armed]);
  const ready = armed && armedReady;

  useLayoutEffect(() => {
    if (!armed) return;
    const el = anchorRef.current;
    if (!el) return;
    const update = () => setAnchor(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [armed, anchorRef]);

  useEffect(() => {
    if (!armed || !ready) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [armed, ready, dismiss]);

  const visible = armed && ready && anchor !== null && !fulfilled;
  useEffect(() => {
    if (visible) onShown?.();
  }, [visible, onShown]);

  if (!visible || !anchor) return null;

  const centerX = anchor.left + anchor.width / 2;
  const left = Math.max(8, Math.min(centerX - CARD_W / 2, window.innerWidth - CARD_W - 8));
  const arrowLeft = Math.max(14, Math.min(centerX - left, CARD_W - 14));
  const top = anchor.bottom + 10;

  return createPortal(
    <div className="fixed z-[220]" style={{ left, top, width: CARD_W }} role="status">
      <div className="relative rounded-lg border bg-popover shadow-xl p-3 milestone-nudge-in">
        <div
          className="absolute z-10 rotate-45 bg-popover border-l border-t"
          style={{ width: 12, height: 12, left: arrowLeft - 6, top: -7 }}
        />
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="absolute right-1.5 top-1.5 p-1 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="text-sm font-bold pr-5">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">{body}</p>
      </div>
    </div>,
    document.body,
  );
}
