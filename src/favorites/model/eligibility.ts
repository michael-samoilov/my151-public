import { TYPE_NAMES } from '@/types/pokemon';
import {
  GEN_NUMBERS,
  cellKind,
  isGenNumber,
  isTypeName,
  type GenAxisId,
  type TypeAxisId,
} from './cells';
import {
  allPickerMons,
  isLegendaryEligible,
  isNewDexRiff,
  isPowerupForm,
  isStarter,
  type PickerMon,
} from './catalog';

function byId(a: PickerMon, b: PickerMon): number {
  return a.id - b.id;
}

export function eligibleFor(type: TypeAxisId, gen: GenAxisId): PickerMon[] {
  const list = allPickerMons();
  let out: PickerMon[] = [];

  if (isTypeName(type) && isGenNumber(gen)) {
    out = list.filter((m) => !isPowerupForm(m) && m.generation === gen && m.types.includes(type));
  } else if (type === 'starter' && isGenNumber(gen)) {
    out = list.filter((m) => isStarter(m) && m.generation === gen);
  } else if (type === 'gimmick' && isGenNumber(gen)) {
    out = list.filter(
      (m) => (isPowerupForm(m) && m.generation === gen) || (isNewDexRiff(m) && m.generation === gen),
    );
  } else if (type === 'legendary' && isGenNumber(gen)) {
    out = list.filter((m) => isLegendaryEligible(m) && m.generation === gen && !isPowerupForm(m));
  } else if (isTypeName(type) && gen === 'legendary') {
    out = list.filter((m) => isLegendaryEligible(m) && m.types.includes(type) && !isPowerupForm(m));
  } else if (type === 'gimmick' && gen === 'legendary') {
    out = list.filter((m) => isPowerupForm(m) && isLegendaryEligible(m));
  } else if (type === 'starter' && gen === 'legendary') {
    out = [];
  }

  return out.slice().sort(byId);
}

const EMPTY_TYPE_GEN = new Set<string>();

for (const type of TYPE_NAMES) {
  for (const gen of GEN_NUMBERS) {
    if (eligibleFor(type, gen).length === 0) EMPTY_TYPE_GEN.add(`${type}|${gen}`);
  }
}

export function isEmptyTypeGen(type: TypeAxisId, gen: GenAxisId): boolean {
  if (!isTypeName(type) || !isGenNumber(gen)) return false;
  return EMPTY_TYPE_GEN.has(`${type}|${gen}`);
}

export function kindFor(type: TypeAxisId, gen: GenAxisId) {
  return cellKind(type, gen, isEmptyTypeGen(type, gen));
}
