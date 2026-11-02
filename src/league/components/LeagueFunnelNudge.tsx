import { useCallback, useEffect, useState } from 'react';
import { useT, type NoArgKey } from '@/i18n';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { leagueNudgeEvent, type LeagueNudgeId } from '../model/funnelNudges';
import { revealToolbarButton } from '../model/nudgeAnchor';
import { FloatingTip } from '@/components/milestone/TipCard';
import { useOverlayOpen } from '@/components/milestone/useOverlayOpen';
import { useLeagueUi } from '../store/useLeagueUi';

interface NudgeCopy {
  tip: string;
  titleKey: NoArgKey;
  ctaKey: NoArgKey;
}

const COPY: Record<LeagueNudgeId, NudgeCopy> = {
  card: { tip: 'league-card', titleKey: 'nudge.card.title', ctaKey: 'nudge.card.cta' },
  league: { tip: 'league-gyms', titleKey: 'nudge.gyms.title', ctaKey: 'nudge.gyms.cta' },
  complete: { tip: 'league-complete', titleKey: 'nudge.complete.title', ctaKey: 'nudge.gyms.cta' },
  full: { tip: 'league-full', titleKey: 'nudge.full.title', ctaKey: 'nudge.gyms.cta' },
};
export const REVEAL_DELAY_MS = 360;

function useNudge() {
  const id = useLeagueUi((s) => s.activeNudge);
  const dismissNudge = useLeagueUi((s) => s.dismissNudge);
  const openLeagueExport = useLeagueUi((s) => s.openLeagueExport);
  const openCard = useLeagueUi((s) => s.openCard);
  const lastCard = useLeagueUi((s) => s.lastCard);
  const browserOpen = useLeagueUi((s) => s.browserOpen);
  const exportOpen = useLeagueUi((s) => s.exportOpen);

  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => setArmed(true), REVEAL_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setArmed(false);
    };
  }, [id]);
  const covered = useOverlayOpen(id != null && !browserOpen && !exportOpen);
  const ready = id != null && armed && !browserOpen && !exportOpen && !covered;

  useEffect(() => {
    if (id) sendEventBeacon(leagueNudgeEvent(id, 'shown'), { once: true });
  }, [id]);

  const finish = useCallback(
    (action: 'cta' | 'dismiss') => {
      if (!id) return;
      sendEventBeacon(leagueNudgeEvent(id, action));
      if (action === 'cta') {
        openLeagueExport(id === 'card' ? (openCard ?? lastCard) : undefined);
      }
      dismissNudge();
    },
    [id, openCard, lastCard, openLeagueExport, dismissNudge],
  );

  return { id, ready, finish };
}

export function LeagueFunnelNudge() {
  const { id, ready, finish } = useNudge();
  const t = useT();
  if (!ready || !id) return null;
  return (
    <FloatingTip
      key={id}
      id={COPY[id].tip}
      target={id === 'card' ? 'league-card-export' : 'league-export'}
      title={t(COPY[id].titleKey)}
      action={t(COPY[id].ctaKey)}
      onAction={() => finish('cta')}
      onDismiss={() => finish('dismiss')}
      onAnchor={revealToolbarButton}
    />
  );
}
