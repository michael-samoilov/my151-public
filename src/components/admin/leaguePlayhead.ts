type Line = { b: number[] };
type Card = { l: Line[] };

function nonempty<T>(cards: T[] | undefined): T[] | null {
  return cards && cards.length > 0 ? cards : null;
}

function memberIds(cards: Card[]): number[] {
  return cards.flatMap((c) => c.l.flatMap((line) => line.b));
}

export type LeagueOccupancy =
  | { kind: 'members'; ids: number[] }
  | { kind: 'all' }
  | { kind: 'none' };

export function leagueOccupancyAtPlayhead(
  sessionCards: Card[] | undefined,
  isLatestSession: boolean,
): LeagueOccupancy {
  const session = nonempty(sessionCards);
  if (session) return { kind: 'members', ids: memberIds(session) };
  return isLatestSession ? { kind: 'all' } : { kind: 'none' };
}

export function occupancyPresent(o: LeagueOccupancy): ReadonlySet<number> | null {
  if (o.kind === 'all') return null;
  if (o.kind === 'none') return new Set();
  return new Set(o.ids);
}
