import type { TypeName } from '@/types/pokemon';
import { MOVES, type ContestType, type Move } from './moves';

export type MoveChips = {
  types: TypeName[] | null;
  categories: ReadonlyArray<Move['category']>;
  contests: ReadonlyArray<ContestType>;
};

type MoveListQuery =
  | { kind: 'search'; q: string }
  | ({ kind: 'chips' } & MoveChips);

function filterMoves(query: MoveListQuery): Move[] {
  if (query.kind === 'search') {
    const q = query.q.trim().toLowerCase();
    return MOVES.filter((m) => m.name.toLowerCase().includes(q));
  }
  const { types, categories, contests } = query;
  return MOVES.filter((m) => {
    const typeOk = !types || types.includes(m.type);
    const catOk = categories.length === 0 || categories.includes(m.category);
    const contestOk = contests.length === 0 || (m.contest !== null && contests.includes(m.contest));
    return typeOk && catOk && contestOk;
  });
}

export function movesForPicker(search: string, chips: MoveChips): Move[] {
  const q = search.trim();
  return q
    ? filterMoves({ kind: 'search', q })
    : filterMoves({ kind: 'chips', ...chips });
}
