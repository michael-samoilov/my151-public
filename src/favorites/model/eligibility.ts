import { TYPE_NAMES } from '@/types/pokemon';
import { PARADOX_IDS } from '@/data/categories';
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
  comparePickerOrder,
  CONVERGENT_IDS,
  isLegendaryEligible,
  isRegional,
  isRegionalFamily,
  isNewDexRiff,
  isPowerupForm,
  isGimmickForm,
  isStarter,
  type PickerMon,
} from './catalog';

/** Keep native species before regional arrivals, with special picks at the end. */
export function regionalPickerTier(mon: PickerMon): number {
  const legendary = isLegendaryEligible(mon);
  if (legendary && (mon.id !== mon.ownerId || isRegionalFamily(mon))) return 3;
  if (legendary || PARADOX_IDS.has(mon.id) || CONVERGENT_IDS.has(mon.id)) return 2;
  if (isRegionalFamily(mon)) return 1;
  return 0;
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
      (m) => (isGimmickForm(m) || isNewDexRiff(m)) && m.generation === gen,
    );
  } else if (type === 'legendary' && isGenNumber(gen)) {
    out = list.filter((m) => isLegendaryEligible(m) && m.generation === gen && !isPowerupForm(m));
  } else if (isTypeName(type) && gen === 'legendary') {
    out = list.filter((m) => isLegendaryEligible(m) && m.types.includes(type) && !isPowerupForm(m));
  } else if (type === 'gimmick' && gen === 'legendary') {
    out = list.filter((m) => isGimmickForm(m) && isLegendaryEligible(m));
  } else if (type === 'starter' && gen === 'legendary') {
    out = [];
  }

  const regionalLayout = out.some(isRegional);
  return out.slice().sort((a, b) => {
    if (type === 'starter' && gen === 8) {
      const hisuiA = a.name.endsWith('-hisui') ? 1 : 0;
      const hisuiB = b.name.endsWith('-hisui') ? 1 : 0;
      if (hisuiA !== hisuiB) return hisuiA - hisuiB;
    } else if (type !== 'starter') {
      // Legendary variants are the final group even if no regional species
      // happens to be eligible for this particular cell.
      const tierA = regionalPickerTier(a);
      const tierB = regionalPickerTier(b);
      if (tierA === 3 || tierB === 3 || regionalLayout) {
        if (tierA !== tierB) return tierA - tierB;
      }
    }
    return comparePickerOrder(a, b);
  });
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
