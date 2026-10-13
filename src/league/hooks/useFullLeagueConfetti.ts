import { useEffect } from 'react';
import { fireCompletionConfetti, preloadCompletionConfetti } from '@/components/milestone/completionConfetti';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { REVEAL_DELAY_MS } from '../components/LeagueFunnelNudge';
import { allCardsHaveFullTeams } from '../model/funnelNudges';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';

/**
 * Fires the completion confetti once, the first time all 14 trainer cards
 * have a full team while the league summary is on screen. On desktop the
 * summary stays beside the open card, so that is at once; on a phone it is
 * when the person goes back to the summary. Mount once from LeagueApp.
 */
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
    // The popups' reveal delay: a phone's pan back to the summary has ended,
    // and on desktop the new line has landed on the card.
    const timer = setTimeout(() => {
      markCelebrated();
      fireCompletionConfetti();
    }, REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [due, summaryOnScreen, markCelebrated]);
}
