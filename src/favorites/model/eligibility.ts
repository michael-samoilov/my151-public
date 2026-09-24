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
  getPickerMon,
  isLegendaryEligible,
  isRegionalFamily,
  isNewDexRiff,
  isPowerupForm,
  isGimmickForm,
  isStarter,
  type PickerMon,
} from './catalog';

/** Native families precede arrivals from older generations within each section. */
export function regionalPickerTier(mon: PickerMon): number {
  const legendary = isLegendaryEligible(mon);
  const owner = getPickerMon(mon.ownerId);
  const olderFamily = isRegionalFamily(mon) || (owner != null && owner.generation < mon.generation);
  if (legendary) return 3 + Number(olderFamily);
  if (PARADOX_IDS.has(mon.id) || CONVERGENT_IDS.has(mon.id)) return 2;
  return Number(olderFamily);
}

function isGimmickCandidate(mon: PickerMon): boolean {
  return isGimmickForm(mon) || isNewDexRiff(mon);
}

function isStarterSpeciesForm(mon: PickerMon): boolean {
  // Forms inherit starter status from their own species, not the whole
  // evolution chain: Gigantamax Pikachu/Eevee qualify, Raichu does not.
  const owner = getPickerMon(mon.ownerId);
  return isStarter(mon) || (owner != null && isStarter(owner));
}

export function eligibleFor(type: TypeAxisId, gen: GenAxisId): PickerMon[] {
  const list = allPickerMons();
  let out: PickerMon[] = [];

  if (isTypeName(type) && isGenNumber(gen)) {
    out = list.filter((m) => !isPowerupForm(m) && m.generation === gen && m.types.includes(type));
  } else if (isTypeName(type) && gen === 'gimmick') {
    out = list.filter((m) => isGimmickCandidate(m) && m.types.includes(type));
  } else if (type === 'starter' && isGenNumber(gen)) {
    out = list.filter((m) => isStarter(m) && m.generation === gen);
  } else if (type === 'starter' && gen === 'gimmick') {
    out = list.filter((m) => isGimmickCandidate(m) && isStarterSpeciesForm(m));
  } else if (type === 'gimmick' && isGenNumber(gen)) {
    out = list.filter(
      (m) => isGimmickCandidate(m) && m.generation === gen,
    );
  } else if (type === 'legendary' && isGenNumber(gen)) {
    out = list.filter((m) => isLegendaryEligible(m) && m.generation === gen && !isPowerupForm(m));
  } else if (isTypeName(type) && gen === 'legendary') {
    out = list.filter((m) => isLegendaryEligible(m) && m.types.includes(type) && !isPowerupForm(m));
  } else if (type === 'legendary' && gen === 'gimmick') {
    out = list.filter((m) => isGimmickCandidate(m) && isLegendaryEligible(m));
  } else if (type === 'starter' && gen === 'legendary') {
    out = [];
  }

  return out.slice().sort((a, b) => {
    if (type === 'starter' && gen === 8) {
      const hisuiA = a.name.endsWith('-hisui') ? 1 : 0;
      const hisuiB = b.name.endsWith('-hisui') ? 1 : 0;
      if (hisuiA !== hisuiB) return hisuiA - hisuiB;
    } else if (type !== 'starter') {
      const tierA = regionalPickerTier(a);
      const tierB = regionalPickerTier(b);
      if (tierA !== tierB) return tierA - tierB;
    }
    return comparePickerOrder(a, b);
  });
}

const EMPTY_TYPE_PICKERS = new Set<string>();

for (const type of TYPE_NAMES) {
  for (const gen of [...GEN_NUMBERS, 'gimmick'] as const) {
    if (eligibleFor(type, gen).length === 0) EMPTY_TYPE_PICKERS.add(`${type}|${gen}`);
  }
}

export function isEmptyTypePicker(type: TypeAxisId, gen: GenAxisId): boolean {
  if (!isTypeName(type) || (!isGenNumber(gen) && gen !== 'gimmick')) return false;
  return EMPTY_TYPE_PICKERS.has(`${type}|${gen}`);
}

export function kindFor(type: TypeAxisId, gen: GenAxisId) {
  return cellKind(type, gen, isEmptyTypePicker(type, gen));
}
