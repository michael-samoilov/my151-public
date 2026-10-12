import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT, type NoArgKey } from '@/i18n';
import { createPortal } from 'react-dom';
import { usePokedexStore } from '@/store/usePokedexStore';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import type { AppView } from '@/components/layout/Header';
import { X } from 'lucide-react';
import { fireCompletionConfetti, preloadCompletionConfetti } from './completionConfetti';

/**
 * Milestone celebrations — the once-per-user payoff moments. When a milestone
 * is first crossed, the store arms `milestoneCelebration` (persisted
 * once-fired, so it never replays across sessions or when dipping below and
 * back). This surfaces a nudge popup anchored under the relevant nav button,
 * pointing the user at the surface they just unlocked, plus confetti at 151.
 */

interface Nudge {
  nav: Extract<AppView, 'analytics' | 'view'>;
  titleKey: NoArgKey;
  bodyKey: NoArgKey;
  ctaKey: NoArgKey;
}

/** Per-milestone nudge copy, by catalog key. */
const NUDGES: Record<number, Nudge> = {
  25: { nav: 'analytics', titleKey: 'nudge.25.title', bodyKey: 'nudge.25.body', ctaKey: 'nudge.25.cta' },
  100: { nav: 'view', titleKey: 'nudge.100.title', bodyKey: 'nudge.100.body', ctaKey: 'nudge.100.cta' },
  151: { nav: 'view', titleKey: 'nudge.151.title', bodyKey: 'nudge.151.body', ctaKey: 'nudge.151.cta' },
};

const AUTO_DISMISS_MS = 10000;
const CARD_W = 264;

// The popup drops down over the progress bar, so it must not appear until the
// bar's own animation has fully played and the user has seen it. On mobile the
// bar defers its count ~320ms after the selection sheet closes, then runs its
// fill slide + bead pop/ripple (~560ms) — hold the popup past that whole window.
// Desktop has no sheet, so it only waits out the bar animation.
const REVEAL_DELAY_MOBILE_MS = 950;
const REVEAL_DELAY_DESKTOP_MS = 640;

export function MilestoneCelebration({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const t = useT();
  const celebration = usePokedexStore((s) => s.milestoneCelebration);
  const dismiss = usePokedexStore((s) => s.dismissMilestoneCelebration);
  const mobileBrowserOpen = usePokedexStore((s) => s.mobileBrowserOpen);
  const isDesktop = useViewportAtLeast(1024);
  const nudge = celebration != null ? NUDGES[celebration] : null;

  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const confettiFor = useRef<number | null>(null);

  // On mobile the milestone is usually crossed from inside the selection sheet.
  // Hold the whole celebration (popup + confetti) until that sheet closes AND the
  // progress bar has finished animating, so the popup floats in over a bar the
  // user has already watched fill — never on top of the animation itself.
  const canShow = nudge != null && (isDesktop || !mobileBrowserOpen);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!canShow) return; // hidden state resets via the cleanup below
    const t = setTimeout(() => setArmed(true), isDesktop ? REVEAL_DELAY_DESKTOP_MS : REVEAL_DELAY_MOBILE_MS);
    return () => {
      clearTimeout(t);
      setArmed(false);
    };
  }, [canShow, isDesktop]);
  const ready = canShow && armed;

  // Confetti at 151 — once per armed celebration (store guarantees once-ever),
  // held until the celebration is actually visible (ready). Its code starts
  // loading when the celebration arms, so the burst lands with the popup.
  useEffect(() => {
    if (celebration === 151) preloadCompletionConfetti();
  }, [celebration]);
  useEffect(() => {
    if (celebration === 151 && ready && confettiFor.current !== 151) {
      confettiFor.current = 151;
      fireCompletionConfetti();
    }
    if (celebration == null) confettiFor.current = null;
  }, [celebration, ready]);

  // Funnel: record the milestone crossing (once per browser).
  useEffect(() => {
    if (celebration != null) sendEventBeacon(`milestone-${celebration}`, { once: true });
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

  // Auto-dismiss — timed from when the card actually appears (ready), so a long
  // mobile sheet session doesn't eat into its on-screen life.
  useEffect(() => {
    if (!nudge || !ready) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [nudge, ready, dismiss]);

  const handleCta = useCallback(() => {
    if (nudge) onNavigate(nudge.nav);
    // Both the 100- and 151-milestone CTAs land on View, but the feature they
    // promised (detailed stats / export) is one more tap away — arm the
    // matching follow-up nudge that points at where it actually lives.
    // Defensively clear the other so two nudges never overlap (e.g. the user
    // never opened Settings at 100 before reaching 151).
    if (celebration === 100) {
      usePokedexStore.getState().armStatsHint();
      usePokedexStore.getState().dismissExportHint();
    } else if (celebration === 151) {
      usePokedexStore.getState().armExportHint();
      usePokedexStore.getState().dismissStatsHint();
    }
    dismiss();
  }, [nudge, celebration, onNavigate, dismiss]);

  if (!nudge || !anchor || !ready) return null;

  const centerX = anchor.left + anchor.width / 2;
  const left = Math.max(8, Math.min(centerX - CARD_W / 2, window.innerWidth - CARD_W - 8));
  const arrowLeft = Math.max(14, Math.min(centerX - left, CARD_W - 14));
  const top = anchor.bottom + 10;

  return createPortal(
    <div className="fixed z-[220]" style={{ left, top, width: CARD_W }} role="status">
      <div className="relative rounded-lg border bg-popover shadow-xl p-3 milestone-nudge-in">
        {/* up-arrow — a rotated square whose two bordered edges form the
            pointer. Sized + positioned in px (not rem) so its left/right
            corners land exactly on the card's top border line: the element's
            vertical center sits at the border (top = -border - size/2), and its
            fill covers the border between the corners so there's no seam. */}
        <div
          className="absolute z-10 rotate-45 bg-popover border-l border-t"
          style={{ width: 12, height: 12, left: arrowLeft - 6, top: -7 }}
        />
        <button
          type="button"
          aria-label={t('common.dismiss')}
          onClick={dismiss}
          className="absolute right-1.5 top-1.5 p-1 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="text-sm font-bold pr-5">{t(nudge.titleKey)}</div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">{t(nudge.bodyKey)}</p>
        <button
          type="button"
          onClick={handleCta}
          className="mt-2.5 w-full rounded-md bg-primary text-primary-foreground text-xs font-semibold py-1.5 hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {t(nudge.ctaKey)}
        </button>
      </div>
    </div>,
    document.body,
  );
}
