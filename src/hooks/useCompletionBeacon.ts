import { useEffect, useRef } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';

const STORAGE_KEY = 'p151-submitted-hash';

/** Simple hash of a sorted ID array for dedup. */
function hashIds(ids: number[]): string {
  return ids.slice().sort((a, b) => a - b).join(',');
}

/**
 * Watches the Pokedex store. When exactly 151 Pokemon are selected
 * and the set hasn't been submitted yet, fires a single beacon POST
 * to /api/submit with the ID array.
 */
export function useCompletionBeacon() {
  const sections = usePokedexStore((s) => s.sections);
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    const allIds = Object.values(sections).flat();
    if (allIds.length !== 151) return;

    const hash = hashIds(allIds);

    // Skip if already sent this session or matches localStorage
    if (sentRef.current === hash) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === hash) {
        sentRef.current = hash;
        return;
      }
    } catch {
      // localStorage may be unavailable
    }

    // Send beacon
    const payload = JSON.stringify({ ids: allIds });
    const sent = navigator.sendBeacon('/api/submit', new Blob([payload], { type: 'application/json' }));

    if (sent) {
      sentRef.current = hash;
      try {
        localStorage.setItem(STORAGE_KEY, hash);
      } catch {
        // localStorage may be unavailable
      }
    }
  }, [sections]);
}
