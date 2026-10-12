import { useCallback, useEffect, useRef, useState } from 'react';
import { useT, type NoArgKey } from '@/i18n';
import { usePokedexStore } from '@/store/usePokedexStore';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import type { AppView } from '@/components/layout/Header';
import { fireCompletionConfetti, preloadCompletionConfetti } from './completionConfetti';
import { NudgeCard } from './NudgeCard';

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

  // The card mounts only once ready, so its auto-dismiss timer runs from when
  // it appears: a long mobile sheet session doesn't eat into its on-screen life.
  if (!nudge || !ready) return null;
  return (
    <NudgeCard
      anchor={`[data-nav="${nudge.nav}"]`}
      title={t(nudge.titleKey)}
      body={t(nudge.bodyKey)}
      cta={t(nudge.ctaKey)}
      onCta={handleCta}
      onDismiss={dismiss}
    />
  );
}
