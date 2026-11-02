import { useEffect, useLayoutEffect, useState } from 'react';
import { POKEDEX_STORAGE_KEY } from '@/lib/demoMode';
import { SLOT_COUNT } from '@/league/model/constants';

export interface ToolProgress { count: number; total: number }

export interface SavedToolProgress {
  dex: ToolProgress;
  league: ToolProgress;
  favorites: ToolProgress | null;
}

const DEX_TOTAL = 151;
export const FAVORITES_TOTAL = 257;

function readSavedState(key: string): Record<string, unknown> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    return saved?.state && typeof saved.state === 'object' ? saved.state : null;
  } catch {
    return null;
  }
}

function readDex(): ToolProgress {
  const sections = readSavedState(POKEDEX_STORAGE_KEY)?.sections;
  const count = sections && typeof sections === 'object'
    ? Object.values(sections).reduce((n: number, ids) => n + (Array.isArray(ids) ? ids.length : 0), 0)
    : 0;
  return { count, total: DEX_TOTAL };
}

function readLeague(): ToolProgress {
  const cards = readSavedState('league-builder')?.cards;
  const count = Array.isArray(cards) ? cards.slice(0, SLOT_COUNT).filter(
    card => Array.isArray(card?.lines) && card.lines.length > 0,
  ).length : 0;
  return { count, total: SLOT_COUNT };
}

async function readFavorites(): Promise<ToolProgress> {
  const { savedFavoriteFills } = await import('@/favorites/model/savedNumbers');
  const fills = savedFavoriteFills(localStorage.getItem('favorite-picker'));
  if (!fills) return { count: 0, total: FAVORITES_TOTAL };
  const { buildFavoritesSnapshot } = await import('@/favorites/export/snapshot');
  const { filled, total } = buildFavoritesSnapshot(fills).completion;
  return { count: filled, total };
}

export function useSavedToolProgress(active = true): SavedToolProgress {
  const [progress, setProgress] = useState<SavedToolProgress>(() => ({
    dex: { count: 0, total: DEX_TOTAL }, league: { count: 0, total: SLOT_COUNT }, favorites: null,
  }));
  useLayoutEffect(() => {
    if (!active) return;
    const read = () => setProgress(p => ({ ...p, dex: readDex(), league: readLeague() }));
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, [active]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const read = () => readFavorites().then(
      favorites => { if (live) setProgress(p => ({ ...p, favorites })); },
      () => {},
    );
    void read();
    window.addEventListener('storage', read);
    return () => { live = false; window.removeEventListener('storage', read); };
  }, [active]);
  return progress;
}
