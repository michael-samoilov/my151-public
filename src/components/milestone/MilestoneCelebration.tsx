import { useCallback, useEffect, useRef, useState } from 'react';
import { useT, type NoArgKey } from '@/i18n';
import { usePokedexStore } from '@/store/usePokedexStore';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import type { AppView } from '@/components/layout/Header';
import { fireCompletionConfetti, preloadCompletionConfetti } from './completionConfetti';
import { FloatingTip } from './TipCard';
import type { TipTarget } from './tipDots';
import { useOverlayOpen } from './useOverlayOpen';

interface Nudge {
  nav: Extract<AppView, 'analytics' | 'view'>;
  target: TipTarget;
  then: readonly TipTarget[];
  titleKey: NoArgKey;
  bodyKey?: NoArgKey;
  ctaKey: NoArgKey;
}

const NUDGES: Record<number, Nudge> = {
  25: { nav: 'analytics', target: 'dex-analytics', then: [], titleKey: 'nudge.25.title', ctaKey: 'nudge.25.cta' },
  100: { nav: 'view', target: 'dex-view', then: ['dex-view-settings'], titleKey: 'nudge.100.title', ctaKey: 'nudge.100.cta' },
  151: { nav: 'view', target: 'dex-view', then: ['dex-export'], titleKey: 'nudge.151.title', bodyKey: 'nudge.151.body', ctaKey: 'nudge.151.cta' },
};

const REVEAL_DELAY_MOBILE_MS = 950;
const REVEAL_DELAY_DESKTOP_MS = 640;

export function MilestoneCelebration({ view, onNavigate }: { view: AppView; onNavigate: (view: AppView) => void }) {
  const t = useT();
  const celebration = usePokedexStore((s) => s.milestoneCelebration);
  const dismiss = usePokedexStore((s) => s.dismissMilestoneCelebration);
  const mobileBrowserOpen = usePokedexStore((s) => s.mobileBrowserOpen);
  const isDesktop = useViewportAtLeast(1024);
  const nudge = celebration != null ? NUDGES[celebration] : null;

  const confettiFor = useRef<number | null>(null);

  const visited = nudge != null && view === nudge.nav;
  useEffect(() => {
    if (visited) dismiss();
  }, [visited, dismiss]);

  const onBuildPage = nudge != null && view === 'builder' && (isDesktop || !mobileBrowserOpen);
  const covered = useOverlayOpen(onBuildPage);
  const canShow = onBuildPage && !covered;
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!canShow) return;
    const t = setTimeout(() => setArmed(true), isDesktop ? REVEAL_DELAY_DESKTOP_MS : REVEAL_DELAY_MOBILE_MS);
    return () => {
      clearTimeout(t);
      setArmed(false);
    };
  }, [canShow, isDesktop]);
  const ready = canShow && armed;

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

  useEffect(() => {
    if (celebration != null) sendEventBeacon(`milestone-${celebration}`, { once: true });
  }, [celebration]);

  const handleCta = useCallback(() => {
    if (nudge) onNavigate(nudge.nav);
    dismiss();
  }, [nudge, onNavigate, dismiss]);

  if (!nudge || !ready) return null;
  return (
    <FloatingTip
      key={celebration}
      id={`dex-${celebration}`}
      target={nudge.target}
      then={nudge.then}
      title={t(nudge.titleKey)}
      body={nudge.bodyKey && t(nudge.bodyKey)}
      action={t(nudge.ctaKey)}
      onAction={handleCta}
      onDismiss={dismiss}
    />
  );
}
