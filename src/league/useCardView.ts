import { useMemo } from 'react';
import { legendsOf, useLeagueStore, type GymCard } from './store/useLeagueStore';
import { deriveRows, type CardCell } from './model/engine';
import { cardShades, type CardShades } from './theme';

export interface CardView {
  card: GymCard;
  shades: CardShades;
  rows: CardCell[][];
}

export function useCardView(cardIndex: number): CardView {
  const card = useLeagueStore((s) => s.cards[cardIndex]);
  return useMemo(
    () => ({
      card,
      shades: cardShades(card.type),
      rows: deriveRows(card.lines, legendsOf(card)),
    }),
    [card],
  );
}
