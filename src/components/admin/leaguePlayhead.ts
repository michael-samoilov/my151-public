type Card = { l: { b: number[] }[] };

export function sessionCards<T extends Card>(cards: T[] | undefined): T[] | null {
  return cards && cards.length > 0 ? cards : null;
}
