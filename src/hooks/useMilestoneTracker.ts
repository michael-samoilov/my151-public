import { useEffect } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';

export function useMilestoneTracker() {
  const sections = usePokedexStore((s) => s.sections);
  const recordPlacedCount = usePokedexStore((s) => s.recordPlacedCount);

  useEffect(() => {
    const count = Object.values(sections).reduce((sum, ids) => sum + ids.length, 0);
    recordPlacedCount(count);
  }, [sections, recordPlacedCount]);
}
