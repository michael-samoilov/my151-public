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
  const openCard = useLeagueUi((s) => s.openCard);
  const exportOpen = useLeagueUi((s) => s.exportOpen);
  const isDesktop = useIsDesktop();
  const summaryOnScreen = (isDesktop || openCard === null) && !exportOpen;

  useEffect(() => {
    if (due) preloadCompletionConfetti();
  }, [due]);

  useEffect(() => {
    if (!due || !summaryOnScreen) return;
    const timer = setTimeout(() => {
      markCelebrated();
      fireCompletionConfetti();
    }, REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [due, summaryOnScreen, markCelebrated]);
}
