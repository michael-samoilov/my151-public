import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT, type NoArgKey } from '@/i18n';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { TipCard } from '@/components/milestone/TipCard';
import { useOverlayOpen } from '@/components/milestone/useOverlayOpen';
import type { TipTarget } from '@/components/milestone/tipDots';
import { leagueNudgeEvent, type LeagueNudgeId } from '../model/funnelNudges';
import { revealTipSlot } from '../model/nudgeAnchor';
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

/** The pane whose toolbar holds a nudge's Export button: the open card's, or the league's. */
export type LeaguePane = 'league' | 'card';

const PANE_TARGET: Record<LeaguePane, TipTarget> = {
  league: 'league-export',
  card: 'league-card-export',
};

function paneOf(id: LeagueNudgeId): LeaguePane {
  return id === 'card' ? 'card' : 'league';
}

/**
 * The tip slot under a pane's toolbar. It shows the active nudge when that nudge
 * points at this pane's Export button. It stays mounted, so the pane's fit can watch it.
 */
export function LeagueTipSlot({ pane }: { pane: LeaguePane }) {
  const t = useT();
  const active = useLeagueUi((s) => s.activeNudge);
  const id = active !== null && paneOf(active) === pane ? active : null;
  const dismissNudge = useLeagueUi((s) => s.dismissNudge);
  const openLeagueExport = useLeagueUi((s) => s.openLeagueExport);
  const openCard = useLeagueUi((s) => s.openCard);
  const lastCard = useLeagueUi((s) => s.lastCard);
  const browserOpen = useLeagueUi((s) => s.browserOpen);
  const exportOpen = useLeagueUi((s) => s.exportOpen);
  const slotRef = useRef<HTMLDivElement>(null);

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

  useLayoutEffect(() => {
    if (ready && slotRef.current) revealTipSlot(slotRef.current);
  }, [ready]);

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

  return (
    <div ref={slotRef} data-tip-slot>
      {ready && (
        <TipCard
          key={id}
          id={COPY[id].tip}
          target={PANE_TARGET[pane]}
          title={t(COPY[id].titleKey)}
          action={t(COPY[id].ctaKey)}
          onAction={() => finish('cta')}
          onDismiss={() => finish('dismiss')}
        />
      )}
    </div>
  );
}
