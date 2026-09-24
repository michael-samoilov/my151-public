import { useEffect } from 'react';
import { nextLeagueNudge } from '../model/funnelNudges';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';

/**
 * Arms one export nudge when a threshold is first crossed, the way
 * `useMilestoneTracker` arms dex celebrations. Mount once from LeagueApp.
 */
export function useLeagueFunnelNudges() {
  const cards = useLeagueStore((s) => s.cards);
  const celebrated = useLeagueStore((s) => s.celebratedNudges);
  const mark = useLeagueStore((s) => s.markNudgeCelebrated);
  const openCard = useLeagueUi((s) => s.openCard);
  const browserOpen = useLeagueUi((s) => s.browserOpen);
  const exportOpen = useLeagueUi((s) => s.exportOpen);
  const activeNudge = useLeagueUi((s) => s.activeNudge);
  const armNudge = useLeagueUi((s) => s.armNudge);
  const dismissNudge = useLeagueUi((s) => s.dismissNudge);

  useEffect(() => {
    if (activeNudge === 'card' && openCard === null) {
      dismissNudge();
      return;
    }
    if (activeNudge === 'league' && openCard !== null) {
      dismissNudge();
      return;
    }
    if (activeNudge) return;
    const next = nextLeagueNudge({
      cards,
      celebrated,
      openCard,
      browserOpen,
      exportOpen,
    });
    if (!next) return;
    mark(next);
    armNudge(next);
  }, [
    cards,
    celebrated,
    openCard,
    browserOpen,
    exportOpen,
    activeNudge,
    mark,
    armNudge,
    dismissNudge,
  ]);
}
