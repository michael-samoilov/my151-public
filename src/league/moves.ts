import movesData from '@/data/moves.json';
import type { MessageKey } from '@/i18n';
import type { TypeName } from '@/types/pokemon';

export interface Move {
  id: number;
  name: string;
  type: TypeName;
  category: 'physical' | 'special' | 'status';
  pp: number;
  power: number | null;
  accuracy: number | null;
  contest: ContestType | null;
}

export type ContestType = 'cool' | 'beautiful' | 'cute' | 'clever' | 'tough';

export const MOVES = movesData as Move[];

const byId = new Map(MOVES.map((m) => [m.id, m]));

export function getMoveById(id: number): Move | undefined {
  return byId.get(id);
}

export const CATEGORY_COLORS: Record<Move['category'], string> = {
  physical: '#EB5628',
  special: '#375AB2',
  status: '#828282',
};

export const CONTEST_COLORS: Record<ContestType, string> = {
  beautiful: '#1e93c0',
  clever: '#15a13f',
  cool: '#d42c04',
  cute: '#d2458d',
  tough: '#cca100',
};

export const CONTEST_TYPES: ContestType[] = ['beautiful', 'clever', 'cool', 'cute', 'tough'];

export const CATEGORY_LABEL = {
  physical: 'league.category.physical',
  special: 'league.category.special',
  status: 'league.category.status',
} as const satisfies Record<Move['category'], MessageKey>;

export const CONTEST_LABEL = {
  beautiful: 'league.contest.beautiful',
  clever: 'league.contest.clever',
  cool: 'league.contest.cool',
  cute: 'league.contest.cute',
  tough: 'league.contest.tough',
} as const satisfies Record<ContestType, MessageKey>;
