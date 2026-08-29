import { useMemo } from 'react';
import { useLeagueStore, type GymCard } from './store/useLeagueStore';
import { deriveRows, type CardCell } from './model/engine';
import { cardShades, type CardShades } from './theme';

/**
 * Everything a card render needs, derived once. Components read this and
 * never call engine functions piecemeal — the one deep interface of the
 * architecture sketch.
 */
export interface CardView {
  card: GymCard;
  shades: CardShades;
  /** rows[0] is card row 1. Cells run left to right, highest seat first. */
  rows: CardCell[][];
}

export function useCardView(cardIndex: number): CardView {
  const card = useLeagueStore((s) => s.cards[cardIndex]);
  return useMemo(
    () => ({
      card,
      shades: cardShades(card.type),
      rows: deriveRows(card.lines, card.legend),
    }),
    [card],
  );
}
