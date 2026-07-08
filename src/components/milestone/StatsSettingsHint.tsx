import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { usePokedexStore } from '@/store/usePokedexStore';
import { X } from 'lucide-react';

/**
 * Follow-up to the 100-milestone celebration. "Show detailed stats" lives
 * inside View Settings rather than directly on the page, so the celebration's
 * "Open View" CTA alone would strand the user — this points at the settings
 * gear once they land on View. Armed by MilestoneCelebration's handleCta,
 * cleared the moment the user opens Settings (their own click fulfills it) or
 * dismisses it directly.
 */

const AUTO_DISMISS_MS = 10000;
const CARD_W = 244;
const REVEAL_DELAY_MS = 260;

export function StatsSettingsHint({
  anchorRef,
  settingsOpen,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  settingsOpen: boolean;
}) {
  const armed = usePokedexStore((s) => s.statsHintArmed);
  const dismiss = usePokedexStore((s) => s.dismissStatsHint);

  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  // Opening Settings fulfills the nudge's purpose — clear it so it doesn't
  // reappear once the pane closes.
  useEffect(() => {
    if (settingsOpen) dismiss();
  }, [settingsOpen, dismiss]);

  // Small delay so it floats in gracefully once View has actually settled,
  // rather than popping in the instant the CTA navigates.
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

  if (!armed || !ready || !anchor || settingsOpen) return null;

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
        <div className="text-sm font-bold pr-5">Stats live in Settings</div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">
          Tap the gear and turn on “Show detailed stats” for type, generation, and base-stat charts.
        </p>
      </div>
    </div>,
    document.body,
  );
}
