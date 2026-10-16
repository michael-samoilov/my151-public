import type { LegendPick } from './engine';
import type { GymCard } from '../store/useLeagueStore';

export function legendsOf(card: GymCard): LegendPick[] {
  if (card.legends) return card.legends;
  return card.legend ? [card.legend] : [];
}
