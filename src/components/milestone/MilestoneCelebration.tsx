import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';
import { usePokedexStore } from '@/store/usePokedexStore';
import type { AppView } from '@/components/layout/Header';
import { X } from 'lucide-react';

/**
 * Milestone celebrations — the once-per-user payoff moments. When a milestone
 * is first crossed, the store arms `milestoneCelebration` (persisted
 * once-fired, so it never replays across sessions or when dipping below and
 * back). This surfaces a nudge popup anchored under the relevant nav button,
 * pointing the user at the surface they just unlocked, plus confetti at 151.
 */

interface Nudge {
  nav: Extract<AppView, 'analytics' | 'view'>;
  title: string;
  body: string;
  cta: string;
}

const NUDGES: Record<number, Nudge> = {
  25: {
    nav: 'analytics',
    title: 'Analytics unlocked',
    body: 'Your dex has enough shape to analyze. See how it stacks up against the national dex.',
    cta: 'Open Analytics',
  },
  100: {
    nav: 'view',
    title: 'Detailed stats unlocked',
    body: 'Flip on “Show stats” in View for type, generation, and base-stat charts beside your dex.',
    cta: 'Open View',
  },
  151: {
    nav: 'view',
    title: 'Your 151 is complete! 🎉',
    body: 'Export your dex as a poster and share it. The Export button is in View.',
    cta: 'Open View',
  },
};

const AUTO_DISMISS_MS = 10000;
const CARD_W = 264;

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

function fireConfetti() {
  if (prefersReducedMotion()) return;
  const colors = ['#dc2626', '#7ac74c', '#ee8130', '#6390f0', '#f7d02c'];
  // Center burst…
  confetti({ particleCount: 130, spread: 95, startVelocity: 45, origin: { x: 0.5, y: 0.35 }, colors, zIndex: 300 });
  // …then a short stream from both lower corners.
  const end = Date.now() + 1100;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.75 }, colors, zIndex: 300 });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.75 }, colors, zIndex: 300 });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export function MilestoneCelebration({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const celebration = usePokedexStore((s) => s.milestoneCelebration);
  const dismiss = usePokedexStore((s) => s.dismissMilestoneCelebration);
  const nudge = celebration != null ? NUDGES[celebration] : null;

  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const confettiFor = useRef<number | null>(null);

  // Confetti at 151 — once per armed celebration (store guarantees once-ever).
  useEffect(() => {
    if (celebration === 151 && confettiFor.current !== 151) {
      confettiFor.current = 151;
      fireConfetti();
    }
    if (celebration == null) confettiFor.current = null;
  }, [celebration]);

  // Track the target nav button's position (stale anchor is harmless — the
  // render guard hides the card whenever there's no active nudge).
  useLayoutEffect(() => {
    if (!nudge) return;
    const el = document.querySelector(`[data-nav="${nudge.nav}"]`);
    if (!el) return;
    const update = () => setAnchor(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [nudge]);

  // Auto-dismiss.
  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [nudge, dismiss]);

  const handleCta = useCallback(() => {
    if (nudge) onNavigate(nudge.nav);
    dismiss();
  }, [nudge, onNavigate, dismiss]);

  if (!nudge || !anchor) return null;

  const centerX = anchor.left + anchor.width / 2;
  const left = Math.max(8, Math.min(centerX - CARD_W / 2, window.innerWidth - CARD_W - 8));
  const arrowLeft = Math.max(14, Math.min(centerX - left, CARD_W - 14));
  const top = anchor.bottom + 10;

  return createPortal(
    <div className="fixed z-[220]" style={{ left, top, width: CARD_W }} role="status">
      <div className="relative rounded-lg border bg-popover shadow-xl p-3 animate-in fade-in-0 slide-in-from-top-1">
        {/* up-arrow — sits above the card so its fill covers the card's top
            border at this x (no seam); its two edges continue the outline. */}
        <div
          className="absolute z-10 w-3 h-3 rotate-45 bg-popover border-l border-t"
          style={{ left: arrowLeft - 6, top: -6 }}
        />
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="absolute right-1.5 top-1.5 p-1 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="text-sm font-bold pr-5">{nudge.title}</div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">{nudge.body}</p>
        <button
          type="button"
          onClick={handleCta}
          className="mt-2.5 w-full rounded-md bg-primary text-primary-foreground text-xs font-semibold py-1.5 hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {nudge.cta}
        </button>
      </div>
    </div>,
    document.body,
  );
}
