type Line = { b: number[] };
type Card = { l: Line[] };

function nonempty<T>(cards: T[] | undefined): T[] | null {
  return cards && cards.length > 0 ? cards : null;
}

function memberIds(cards: Card[]): number[] {
  return cards.flatMap((c) => c.l.flatMap((line) => line.b));
}

export type LeaguePlayheadBoard<T extends Card> =
  | { kind: 'captured'; cards: T[]; presentIds: number[] }
  | { kind: 'latest'; cards: T[] }
  | { kind: 'uncaptured' };

export type LeagueOccupancy =
  | { kind: 'members'; ids: number[] }
  | { kind: 'all' }
  | { kind: 'none' };

export function leagueBoardAtPlayhead<T extends Card>(args: {
  sessionCards: T[] | undefined;
  latestCards: T[] | undefined;
  isLatestSession: boolean;
}): LeaguePlayheadBoard<T> {
  const session = nonempty(args.sessionCards);
  if (session) return { kind: 'captured', cards: session, presentIds: memberIds(session) };
  const latest = nonempty(args.latestCards);
  if (args.isLatestSession && latest) return { kind: 'latest', cards: latest };
  return { kind: 'uncaptured' };
}

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
