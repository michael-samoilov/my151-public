import type { GymCard } from '../store/useLeagueStore';
import { legendsOf } from '../store/useLeagueStore';

const EXPORT_COUNT_KEY = 'league-builder-export-count';

/** Distinct Pokémon species seated anywhere in the league (lines, legends, picks). */
export function countDistinctPokemonInLeague(cards: GymCard[]): number {
  const ids = new Set<number>();
  for (const card of cards) {
    for (const line of card.lines) {
      for (const id of line.branch) ids.add(id);
    }
    for (const leg of legendsOf(card)) ids.add(leg.pokemonId);
    if (card.partnerId != null) ids.add(card.partnerId);
    if (card.signatureId != null) ids.add(card.signatureId);
  }
  return ids.size;
}

export function readLeagueExportCount(): number {
  try {
    const raw = localStorage.getItem(EXPORT_COUNT_KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Returns the count after incrementing. */
export function incrementLeagueExportCount(): number {
  const next = readLeagueExportCount() + 1;
  try {
    localStorage.setItem(EXPORT_COUNT_KEY, String(next));
  } catch {
    /* quota or private mode */
  }
  return next;
}
