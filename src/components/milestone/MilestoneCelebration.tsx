import { useCallback, useEffect, useRef, useState } from 'react';
import { useT, type NoArgKey } from '@/i18n';
import { usePokedexStore } from '@/store/usePokedexStore';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import type { AppView } from '@/components/layout/Header';
import { fireCompletionConfetti, preloadCompletionConfetti } from './completionConfetti';
import { NudgeCard } from './NudgeCard';
import { useOverlayOpen } from './useOverlayOpen';

interface Nudge {
  nav: Extract<AppView, 'analytics' | 'view'>;
  titleKey: NoArgKey;
  bodyKey: NoArgKey;
  ctaKey: NoArgKey;
}

const NUDGES: Record<number, Nudge> = {
  25: { nav: 'analytics', titleKey: 'nudge.25.title', bodyKey: 'nudge.25.body', ctaKey: 'nudge.25.cta' },
  100: { nav: 'view', titleKey: 'nudge.100.title', bodyKey: 'nudge.100.body', ctaKey: 'nudge.100.cta' },
  151: { nav: 'view', titleKey: 'nudge.151.title', bodyKey: 'nudge.151.body', ctaKey: 'nudge.151.cta' },
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
    if (celebration === 100) {
      usePokedexStore.getState().armStatsHint();
      usePokedexStore.getState().dismissExportHint();
    } else if (celebration === 151) {
      usePokedexStore.getState().armExportHint();
      usePokedexStore.getState().dismissStatsHint();
    }
    dismiss();
  }, [nudge, celebration, onNavigate, dismiss]);

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
