import { TYPE_NAMES, type TypeName } from '@/types/pokemon';

export const EXTRA_TYPE_AXIS = ['starter', 'gimmick', 'legendary', 'favorite'] as const;
export type ExtraTypeAxis = (typeof EXTRA_TYPE_AXIS)[number];
export type TypeAxisId = TypeName | ExtraTypeAxis;

export const TYPE_AXIS: readonly TypeAxisId[] = [...TYPE_NAMES, ...EXTRA_TYPE_AXIS];

export const GEN_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type GenNumber = (typeof GEN_NUMBERS)[number];
export const EXTRA_GEN_AXIS = ['legendary', 'favorite'] as const;
export type ExtraGenAxis = (typeof EXTRA_GEN_AXIS)[number];
export type GenAxisId = GenNumber | ExtraGenAxis;

export const GEN_AXIS: readonly GenAxisId[] = [...GEN_NUMBERS, ...EXTRA_GEN_AXIS];

export const TYPES18: readonly TypeName[] = TYPE_NAMES;

export function isTypeName(id: string | number): id is TypeName {
  return typeof id === 'string' && (TYPE_NAMES as readonly string[]).includes(id);
}

export function isGenNumber(id: string | number): id is GenNumber {
  return typeof id === 'number' && (GEN_NUMBERS as readonly number[]).includes(id);
}

export function cellKey(type: TypeAxisId, gen: GenAxisId): string {
  return `${type}|${gen}`;
}

export function parseCellKey(key: string): { type: TypeAxisId; gen: GenAxisId } | null {
  const bar = key.indexOf('|');
  if (bar < 0) return null;
  const type = key.slice(0, bar) as TypeAxisId;
  const raw = key.slice(bar + 1);
  const gen = /^\d+$/.test(raw) ? (Number(raw) as GenNumber) : (raw as ExtraGenAxis);
  if (!TYPE_AXIS.includes(type)) return null;
  if (!GEN_AXIS.includes(gen)) return null;
  return { type, gen };
}

export type CellKind = 'pick' | 'pointer' | 'disabled' | 'null';

export function isFavoriteLegendary(type: TypeAxisId, gen: GenAxisId): boolean {
  return (type === 'favorite' && gen === 'legendary') || (type === 'legendary' && gen === 'favorite');
}

export function cellKind(type: TypeAxisId, gen: GenAxisId, empty: boolean): CellKind {
  if (type === 'starter' && gen === 'legendary') return 'disabled';
  if (isFavoriteLegendary(type, gen)) return 'disabled';
  if (empty) return 'null';
  if (type === 'favorite' || gen === 'favorite') return 'pointer';
  if (type === 'legendary' && gen === 'legendary') return 'pointer';
  return 'pick';
}

export function isTypeCell(type: TypeAxisId, gen: GenAxisId): boolean {
  return isTypeName(type) && isGenNumber(gen);
}

export const ROMAN: Record<GenNumber, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
  8: 'VIII',
  9: 'IX',
};

export const EXTRA_MARK: Record<ExtraTypeAxis, string> = {
  starter: 'S',
  gimmick: 'G',
  legendary: 'L',
  favorite: '★',
};

export const EXTRA_COLOR: Record<ExtraTypeAxis | ExtraGenAxis, string> = {
  starter: '#dc2626',
  gimmick: '#7c3aed',
  legendary: '#b45309',
  favorite: '#a16207',
};
