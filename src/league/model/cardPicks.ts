import type { LegendPick } from './engine';
import type { GymCard } from '../store/useLeagueStore';

/**
 * Every legendary on a card's endgame row.
 *
 * A card saved before the row could hold more than one carries a single
 * `legend`, which reads as a one-entry list — exactly what it meant.
 */
export function legendsOf(card: GymCard): LegendPick[] {
  if (card.legends) return card.legends;
  return card.legend ? [card.legend] : [];
}
