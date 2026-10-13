import { normalizeSearch } from '@/i18n/searchNormalize';
import type { TypeName } from '@/types/pokemon';
import { moveName } from './moveNames';
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
    // The name the picker shows, folded the way the Pokémon search folds it:
    // accents, full-width Latin and hiragana typed for katakana all match.
    const q = normalizeSearch(query.q.trim());
    return MOVES.filter((m) => normalizeSearch(moveName(m)).includes(q));
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
