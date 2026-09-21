import type { TypeName } from '@/types/pokemon';
import { MOVES, type ContestType, type Move } from './moves';

/** The TM picker's visible row set, given the search box and the chips. */
export function filterMoves({
  search,
  types,
  categories,
  contests,
}: {
  search: string;
  types: TypeName[] | null;
  categories: ReadonlyArray<Move['category']>;
  contests: ReadonlyArray<ContestType>;
}): Move[] {
  const q = search.trim().toLowerCase();
  if (q) {
    return MOVES.filter((m) => m.name.toLowerCase().includes(q));
  }
  return MOVES.filter((m) => {
    const typeOk = !types || types.includes(m.type);
    const catOk = categories.length === 0 || categories.includes(m.category);
    const contestOk = contests.length === 0 || (m.contest !== null && contests.includes(m.contest));
    return typeOk && catOk && contestOk;
  });
}
