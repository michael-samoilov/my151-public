import { useEffect } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';

/**
 * Watches the placed-count and feeds it to the milestone tracker, which bumps
 * the sticky `milestoneMax` and arms a celebration on the first crossing of
 * each threshold. Mount once (App), like useCompletionBeacon.
 */
export function useMilestoneTracker() {
  const sections = usePokedexStore((s) => s.sections);
  const recordPlacedCount = usePokedexStore((s) => s.recordPlacedCount);

  useEffect(() => {
    const count = Object.values(sections).reduce((sum, ids) => sum + ids.length, 0);
    recordPlacedCount(count);
  }, [sections, recordPlacedCount]);
}
