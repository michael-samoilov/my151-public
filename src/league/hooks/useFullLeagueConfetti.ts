import { useEffect } from 'react';
import { fireCompletionConfetti, preloadCompletionConfetti } from '@/components/milestone/completionConfetti';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { REVEAL_DELAY_MS } from '../components/LeagueFunnelNudge';
import { allCardsHaveFullTeams } from '../model/funnelNudges';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';

export function useFullLeagueConfetti() {
  const due = useLeagueStore((s) => !s.fullLeagueCelebrated && allCardsHaveFullTeams(s.cards));
  const markCelebrated = useLeagueStore((s) => s.markFullLeagueCelebrated);
  const armNudge = useLeagueUi((s) => s.armNudge);
  const openCard = useLeagueUi((s) => s.openCard);
  const exportOpen = useLeagueUi((s) => s.exportOpen);
  const browserOpen = useLeagueUi((s) => s.browserOpen);
  const isDesktop = useIsDesktop();
  // A tooltip waits for the picker to close, so the burst waits with it.
  const summaryOnScreen = (isDesktop || openCard === null) && !exportOpen && !browserOpen;

  useEffect(() => {
    if (due) preloadCompletionConfetti();
  }, [due]);

  useEffect(() => {
    if (!due || !summaryOnScreen) return;
    const timer = setTimeout(() => {
      markCelebrated();
      fireCompletionConfetti();
      // The tooltip says what the burst celebrates, and offers the export.
      armNudge('full');
    }, REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [due, summaryOnScreen, markCelebrated, armNudge]);
}
